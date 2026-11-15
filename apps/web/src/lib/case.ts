import "server-only";
import { notFound } from "next/navigation";
import { ApiError, apiGet, type CaseDetail } from "./api";

/** Loads a case for a page; anything the user may not see becomes a plain 404. */
export async function loadCase(id: string): Promise<CaseDetail> {
  try {
    return await apiGet<CaseDetail>(`/cases/${id}`);
  } catch (err) {
    if (err instanceof ApiError && [400, 403, 404].includes(err.status)) notFound();
    throw err;
  }
}
