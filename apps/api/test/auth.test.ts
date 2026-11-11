import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOwner } from "@magistrad/db/testing";
import { asBrowser, signInThroughIdp, startHarness, WEB_ORIGIN, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
  // Invite the fictional dev accounts (except dan@nomfa.test's... he is invited too, to prove MFA is required).
  await asOwner(h.db, async (c) => {
    await c.query(`INSERT INTO app.users (email, full_name, platform_role) VALUES
      ('admin@magistrad.test', 'Morgan Platform', 'super_admin'),
      ('ben@alpha-llp.test', 'Ben Member', 'none'),
      ('dan@nomfa.test', 'Dan NoMFA', 'none')`);
  });
});
afterAll(async () => { if (h) await h.close(); });

describe("sign-in through the identity provider", () => {
  it("activates an invited user on first sign-in with MFA and opens a session", async () => {
    const r = await signInThroughIdp(h, "admin@magistrad.test", { returnTo: "/admin" });
    expect(r.redirect).toBe(`${WEB_ORIGIN}/admin`);
    expect(r.token).toBeTruthy();
    const me = await h.app.inject({ method: "GET", url: "/me", headers: asBrowser(r.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { email: "admin@magistrad.test" }, isSuperAdmin: true });
  });

  it("rejects a sign-in without MFA, even with the right password", async () => {
    const withoutCode = await signInThroughIdp(h, "ben@alpha-llp.test", { code: null });
    expect(withoutCode.redirect).toBe(`${WEB_ORIGIN}/sign-in?error=mfa_required`);
    expect(withoutCode.token).toBeUndefined();
    const noMfaAccount = await signInThroughIdp(h, "dan@nomfa.test");
    expect(noMfaAccount.redirect).toBe(`${WEB_ORIGIN}/sign-in?error=mfa_required`);
  });

  it("rejects people who have not been invited", async () => {
    const r = await signInThroughIdp(h, "carol@beta-co.test");
    expect(r.redirect).toBe(`${WEB_ORIGIN}/sign-in?error=no_account`);
    expect(r.token).toBeUndefined();
  });

  it("rejects suspended accounts", async () => {
    await signInThroughIdp(h, "ben@alpha-llp.test"); // activates Ben
    await asOwner(h.db, (c) => c.query("UPDATE app.users SET status = 'suspended' WHERE email = 'ben@alpha-llp.test'"));
    const r = await signInThroughIdp(h, "ben@alpha-llp.test");
    expect(r.redirect).toBe(`${WEB_ORIGIN}/sign-in?error=suspended`);
  });

  it("will not redirect anywhere except our own site after sign-in", async () => {
    const r = await signInThroughIdp(h, "admin@magistrad.test", { returnTo: "//evil.example/steal" });
    expect(r.redirect).toBe(`${WEB_ORIGIN}/`);
  });

  it("refuses to reuse a completed sign-in response", async () => {
    const r = await signInThroughIdp(h, "admin@magistrad.test");
    const replay = await h.app.inject({ method: "GET", url: r.callbackUrl.replace("http://api.test", "") });
    expect(replay.headers.location).toBe(`${WEB_ORIGIN}/sign-in?error=expired`);
  });

  it("stores only a hash of the session token, and logout ends the session", async () => {
    const { token } = await signInThroughIdp(h, "admin@magistrad.test");
    const stored = await asOwner(h.db, (c) => c.query("SELECT 1 FROM app.sessions WHERE token_hash = $1", [token]));
    expect(stored.rowCount).toBe(0);
    const out = await h.app.inject({ method: "POST", url: "/auth/logout", headers: { ...asBrowser(token), "content-length": "0" } });
    expect(out.statusCode).toBe(200);
    const me = await h.app.inject({ method: "GET", url: "/me", headers: asBrowser(token) });
    expect(me.statusCode).toBe(401);
  });

  it("records sign-in successes and failures in the audit log", async () => {
    const rows = await asOwner(h.db, (c) => c.query("SELECT outcome, metadata->>'reason' AS reason FROM app.audit_events WHERE action = 'auth.login'"));
    const reasons = rows.rows.map((r) => `${r.outcome}:${r.reason ?? ""}`);
    expect(reasons).toEqual(expect.arrayContaining(["success:", "denied:mfa_missing", "denied:no_account", "denied:suspended"]));
  });
});
