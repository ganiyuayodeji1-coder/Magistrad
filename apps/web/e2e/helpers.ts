import { expect, type Page } from "@playwright/test";
import { DEV_ACCOUNTS, totp } from "@magistrad/dev-idp";

export async function signIn(page: Page, email: string, opts: { withCode?: boolean } = {}) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(page.getByText("Development identity provider")).toBeVisible();
  const a = DEV_ACCOUNTS.find((x) => x.email === email)!;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(a.password);
  if (opts.withCode !== false && a.totpSecret) await page.getByLabel("Authenticator code").fill(totp(a.totpSecret));
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "You are signed out" })).toBeVisible();
}
