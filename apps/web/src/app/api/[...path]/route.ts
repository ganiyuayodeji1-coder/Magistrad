/**
 * Same-origin gateway to the API service. The browser only ever talks to the web origin,
 * so the session cookie is first-party and the API has no public address.
 * The target is read at runtime (API_INTERNAL_URL), so one build runs in every environment.
 * Only an allow-list of headers is forwarded in each direction.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_HEADERS = ["cookie", "content-type", "origin", "user-agent", "accept", "x-forwarded-for"];
const RESPONSE_HEADERS = ["content-type", "location", "cache-control", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];
const MAX_BODY = 64 * 1024;

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  if (path.some((seg) => seg === ".." || seg.includes("/"))) return new Response("Bad path", { status: 400 });
  const base = process.env.API_INTERNAL_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
  const target = `${base}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY) return Response.json({ error: "too_large", message: "Request too large." }, { status: 413 });
    headers.set("content-length", String(body.byteLength));
  }

  const upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual", cache: "no-store" });
  const out = new Headers();
  for (const h of RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  out.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
