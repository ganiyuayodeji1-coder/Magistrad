import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedWorld, type World } from "@magistrad/db/testing";
import { asBrowser, sessionFor, startHarness, type Harness } from "./harness";

let h: Harness;
let w: World;
let superToken: string;
beforeAll(async () => {
  h = await startHarness();
  w = await seedWorld(h.db);
  superToken = await sessionFor(h, w.superAdmin);
});
afterAll(async () => { if (h) await h.close(); });

describe("HTTP security", () => {
  it("requires a session for everything except health and sign-in", async () => {
    for (const url of ["/me", "/organisations", "/users", "/audit"]) {
      expect((await h.app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
    expect((await h.app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });

  it("refuses state changes from another origin or without an origin (CSRF)", async () => {
    const body = { name: "Gamma Chambers", type: "chambers" };
    const noOrigin = await h.app.inject({ method: "POST", url: "/organisations", headers: { cookie: `mag_session=${superToken}` }, payload: body });
    expect(noOrigin.statusCode).toBe(403);
    const evil = await h.app.inject({ method: "POST", url: "/organisations", headers: { cookie: `mag_session=${superToken}`, origin: "https://evil.example" }, payload: body });
    expect(evil.statusCode).toBe(403);
    const ok = await h.app.inject({ method: "POST", url: "/organisations", headers: asBrowser(superToken), payload: body });
    expect(ok.statusCode).toBe(201);
  });

  it("refuses form-encoded bodies", async () => {
    const res = await h.app.inject({
      method: "POST", url: "/organisations",
      headers: { ...asBrowser(superToken), "content-type": "application/x-www-form-urlencoded" },
      payload: "name=Rogue&type=law_firm",
    });
    expect(res.statusCode).toBe(415);
  });

  it("validates input strictly", async () => {
    const res = await h.app.inject({ method: "POST", url: "/organisations", headers: asBrowser(superToken), payload: { name: "X", type: "law_firm", extra: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it("sends strict security headers and never reveals the server", async () => {
    const res = await h.app.inject({ method: "GET", url: "/health" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("ignores a spoofed X-Forwarded-For when no proxy is trusted", async () => {
    await h.app.inject({ method: "POST", url: "/organisations", headers: { ...asBrowser(superToken), "x-forwarded-for": "1.2.3.4" }, payload: { name: "Delta LLP", type: "law_firm" } });
    const res = await h.app.inject({ method: "GET", url: "/audit?limit=1", headers: asBrowser(superToken) });
    expect(res.json().events[0].ipAddress).not.toBe("1.2.3.4");
  });

  it("ends every session immediately when an account is suspended", async () => {
    const memberToken = await sessionFor(h, w.memberA);
    expect((await h.app.inject({ method: "GET", url: "/me", headers: asBrowser(memberToken) })).statusCode).toBe(200);
    const res = await h.app.inject({ method: "POST", url: `/users/${w.memberA}/suspend`, headers: { ...asBrowser(superToken), "content-length": "0" } });
    expect(res.statusCode).toBe(200);
    expect((await h.app.inject({ method: "GET", url: "/me", headers: asBrowser(memberToken) })).statusCode).toBe(401);
  });

  it("keeps the audit chain intact through all of the above", async () => {
    const res = await h.app.inject({ method: "GET", url: "/audit/verify", headers: asBrowser(superToken) });
    expect(res.json()).toMatchObject({ intact: true, firstBrokenSeq: null });
  });
});
