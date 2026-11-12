import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API = process.env.API_INTERNAL_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
const COOKIE = process.env.SESSION_COOKIE_NAME ?? (process.env.NODE_ENV === "production" ? "__Host-mag_session" : "mag_session");

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Server-side read from the API, forwarding only the session cookie.
 * Signed-out users are sent to sign-in; a 403 or 404 becomes an ApiError for the page to show.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) redirect("/sign-in");
  const res = await fetch(`${API}${path}`, { headers: { cookie: `${COOKIE}=${token}` }, cache: "no-store" });
  if (res.status === 401) redirect("/sign-in");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? "Request failed");
  }
  return (await res.json()) as T;
}

export interface Me {
  user: { id: string; email: string; fullName: string; platformRole: "none" | "super_admin" };
  organisations: { id: string; name: string; type: string; role: "org_admin" | "member" }[];
  isSuperAdmin: boolean;
}
