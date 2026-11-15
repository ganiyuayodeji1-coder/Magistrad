import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signIn, signOut } from "./helpers";

const section = (page: Page, name: "Home" | "Files" | "Members") =>
  page.getByRole("navigation", { name: "Case sections" }).getByRole("link", { name, exact: true }).click();

const TITLE = "Acme Widgets Ltd v Bloggs Builders Ltd (fictional)";
let caseUrl = "";

test.describe.serial("Phase 1: a case workspace in a real browser", () => {
  test("the claimant's solicitor opens a case and lands in its workspace", async ({ page }) => {
    await signIn(page, "grace@northgate.test");
    await expect(page.getByText("You are not on any cases yet")).toBeVisible();
    await page.getByRole("link", { name: "Open a case" }).click();
    await page.getByLabel("Case title").fill(TITLE);
    await page.getByLabel("Your firm acts for").selectOption("claimant");
    await page.getByLabel("Court", { exact: true }).fill("County Court at Exampletown");
    await page.getByLabel("Claimant", { exact: true }).fill("Acme Widgets Ltd (fictional)");
    await page.getByLabel("Defendant", { exact: true }).fill("Bloggs Builders Ltd (fictional)");
    await page.getByRole("button", { name: "Open the case" }).click();

    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByTestId("my-case-role")).toHaveText("Claimant's solicitor");
    caseUrl = new URL(page.url()).pathname;
    await expect(page.getByText("Case opened on Magistrad")).toBeVisible();
  });

  test("she staffs her side, invites the defendant's solicitor and links the court", async ({ page }) => {
    await signIn(page, "grace@northgate.test");
    await page.goto(`${caseUrl}/members`);
    const add = async (as: string, name: string, email: string) => {
      await page.getByLabel("Adding as").selectOption({ label: as });
      await page.getByLabel("Full name").fill(name);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Add to case" }).click();
      await expect(page.getByRole("cell", { name: name, exact: true })).toBeVisible();
    };
    await add("Claimant's barrister", "Eve Counsel", "eve@chambers.test");
    await add("Claimant's expert", "Frank Expert", "frank@experts.test");
    await add("Defendant's solicitor", "Dave Defence", "dave@defence-llp.test");
    // Once the defendant side has someone, she can no longer add people to it.
    await expect(page.getByLabel("Adding as").locator("option", { hasText: "Defendant" })).toHaveCount(0);

    await section(page, "Home");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Link court" }).click();
    await expect(page.getByText("County Court at Exampletown (fictional)")).toBeVisible();

    await section(page, "Files");
    await expect(page.getByTestId("folder-private")).toContainText("Claimant — private workspace");
    await expect(page.getByTestId("folder-shared")).toBeVisible();
    await expect(page.getByTestId("folder-filings")).toBeVisible();
    await expect(page.getByTestId("folder-orders")).toBeVisible();
    await signOut(page);
  });

  test("the court registry sees the case exists, assigns the judge, and sees no documents or team", async ({ page }) => {
    await signIn(page, "registry@court.test");
    await page.getByRole("link", { name: new RegExp(TITLE.replace(/[()]/g, "\\$&")) }).click();
    await expect(page.getByTestId("my-case-role")).toHaveText("Court registry");
    await section(page, "Members");
    await page.getByLabel("Adding as").selectOption({ label: "Judge" });
    await page.getByLabel("Full name").fill("HHJ Ray");
    await page.getByLabel("Email").fill("judge.ray@court.test");
    await page.getByRole("button", { name: "Add to case" }).click();
    await expect(page.getByRole("cell", { name: "HHJ Ray", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Eve Counsel" })).toHaveCount(0);
    await section(page, "Files");
    await expect(page.getByText("does not include access to any document areas")).toBeVisible();
    await signOut(page);
  });

  test("the defendant's solicitor sees only their own private area and not the claimant's counsel or expert", async ({ page }) => {
    await signIn(page, "dave@defence-llp.test");
    await page.goto(caseUrl);
    await expect(page.getByTestId("my-case-role")).toHaveText("Defendant's solicitor");
    await expect(page.getByText(/Eve Counsel joined/)).toHaveCount(0);
    await expect(page.getByText(/Dave Defence joined as solicitor/)).toBeVisible();

    await section(page, "Files");
    await expect(page.getByTestId("folder-private")).toContainText("Defendant — private workspace");
    await expect(page.getByText("Claimant — private workspace")).toHaveCount(0);

    await section(page, "Members");
    await expect(page.getByRole("cell", { name: "Grace Northgate", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Eve Counsel" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Frank Expert" })).toHaveCount(0);
    await signOut(page);
  });

  test("the judge sees shared material and the court record, but neither private area", async ({ page }) => {
    await signIn(page, "judge.ray@court.test");
    await page.goto(caseUrl);
    await expect(page.getByTestId("my-case-role")).toHaveText("Judge");
    await section(page, "Files");
    await expect(page.getByTestId("folder-shared")).toBeVisible();
    await expect(page.getByTestId("folder-orders")).toBeVisible();
    await expect(page.getByTestId("folder-private")).toHaveCount(0);
    await section(page, "Members");
    await expect(page.getByRole("cell", { name: "Eve Counsel", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to case" })).toHaveCount(0);
    await signOut(page);
  });

  test("people not on the case get 'not found', even the super administrator", async ({ page }) => {
    await signIn(page, "admin@magistrad.test");
    const res = await page.goto(caseUrl);
    expect(res?.status()).toBe(404);
  });
});
