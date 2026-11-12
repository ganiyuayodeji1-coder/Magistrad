import { expect, test, type Page } from "@playwright/test";
import { DEV_ACCOUNTS, totp } from "@magistrad/dev-idp";

const account = (email: string) => DEV_ACCOUNTS.find((a) => a.email === email)!;

async function signIn(page: Page, email: string, opts: { withCode?: boolean } = {}) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(page.getByText("Development identity provider")).toBeVisible();
  const a = account(email);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(a.password);
  if (opts.withCode !== false && a.totpSecret) await page.getByLabel("Authenticator code").fill(totp(a.totpSecret));
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "You are signed out" })).toBeVisible();
}

test.describe.serial("Phase 0 in a real browser", () => {
  test("signed-out visitors are sent to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a sign-in without the authenticator code is refused", async ({ page }) => {
    await signIn(page, "admin@magistrad.test", { withCode: false });
    await expect(page).toHaveURL(/\/sign-in\?error=mfa_required$/);
    await expect(page.getByRole("alert").filter({ hasText: "two-step verification" })).toBeVisible();
  });

  test("someone who was never invited cannot get in", async ({ page }) => {
    await signIn(page, "carol@beta-co.test");
    await expect(page.getByRole("alert").filter({ hasText: "no Magistrad account" })).toBeVisible();
  });

  test("the super administrator sets up a firm and its administrator", async ({ page }) => {
    await signIn(page, "admin@magistrad.test");
    await expect(page.getByTestId("current-user")).toHaveText("Morgan Platform");
    await expect(page.getByText("You are not a member of any organisation yet")).toBeVisible();

    await page.getByRole("link", { name: "Organisations" }).click();
    await page.getByLabel("Name").fill("Alpha LLP (fictional)");
    await page.getByLabel("Regulator number").fill("000000");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "Alpha LLP (fictional)" })).toBeVisible();

    await page.getByLabel("Full name").fill("Alice Admin");
    await page.getByLabel("Email").fill("alice@alpha-llp.test");
    await page.getByLabel("Role").selectOption("org_admin");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Invitation recorded")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Alice Admin" })).toBeVisible();
    await signOut(page);
  });

  test("the firm administrator activates on first sign-in and adds a colleague", async ({ page }) => {
    await signIn(page, "alice@alpha-llp.test");
    await expect(page.getByTestId("current-user")).toHaveText("Alice Admin");
    // Not a super admin: no platform pages in the navigation.
    await expect(page.getByRole("link", { name: "Accounts" })).toHaveCount(0);
    await page.getByRole("link", { name: /Alpha LLP \(fictional\)/ }).click();

    await page.getByLabel("Full name").fill("Ben Member");
    await page.getByLabel("Email").fill("ben@alpha-llp.test");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("cell", { name: "Ben Member" })).toBeVisible();

    // She cannot add herself, and the server says so.
    await page.getByLabel("Full name").fill("Alice Again");
    await page.getByLabel("Email").fill("alice@alpha-llp.test");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "permission" })).toContainText("cannot change your own membership");

    await page.getByRole("link", { name: "Activity log" }).click();
    await expect(page.getByRole("cell", { name: "member.add" }).first()).toBeVisible();
    await signOut(page);
  });

  test("a member sees their firm but cannot manage it or reach platform pages", async ({ page }) => {
    await signIn(page, "ben@alpha-llp.test");
    await page.getByRole("link", { name: /Alpha LLP \(fictional\)/ }).click();
    await expect(page.getByRole("button", { name: "Add person" })).toHaveCount(0);
    await expect(page.getByText("Only administrators can change membership.")).toBeVisible();
    for (const url of ["/admin/users", "/admin/audit", "/admin/organisations"]) {
      const res = await page.goto(url);
      expect(res?.status()).toBe(404);
    }
    await page.goto("/");
    await signOut(page);
  });

  test("suspending an account signs that person out, and the audit chain stays intact", async ({ browser, page }) => {
    const benContext = await browser.newContext();
    const ben = await benContext.newPage();
    await signIn(ben, "ben@alpha-llp.test");
    await expect(ben.getByTestId("current-user")).toHaveText("Ben Member");

    await signIn(page, "admin@magistrad.test");
    await page.getByRole("link", { name: "Accounts" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("row", { name: /Ben Member/ }).getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByRole("row", { name: /Ben Member/ }).getByText("suspended")).toBeVisible();

    await ben.reload();
    await expect(ben).toHaveURL(/\/sign-in$/);
    await benContext.close();

    await page.getByRole("link", { name: "Audit log" }).click();
    await page.getByRole("button", { name: "Verify the whole chain" }).click();
    await expect(page.getByText(/^Intact\./)).toBeVisible();
  });

  test("pages carry a strict, per-request content security policy", async ({ request }) => {
    const a = await request.get("/sign-in");
    const b = await request.get("/sign-in");
    const csp = a.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toBe(b.headers()["content-security-policy"]);
  });
});
