"use client";

/** Browser-side call to the API through the same-origin /api proxy. */
export async function apiSend(method: "POST" | "PATCH", path: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; issues?: { path: string; message: string }[] };
  if (res.ok) return { ok: true, data };
  const detail = data.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
  return { ok: false, message: detail ? `${data.message} (${detail})` : data.message ?? "Something went wrong." };
}

