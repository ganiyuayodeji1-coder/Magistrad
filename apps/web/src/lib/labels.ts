// Plain constants: safe to import from server and client components.
export const ROLE_LABEL: Record<string, string> = { org_admin: "Administrator", member: "Member" };
export const ORG_TYPE_LABEL: Record<string, string> = {
  law_firm: "Law firm", chambers: "Chambers", court: "Court", tribunal: "Tribunal", platform: "Platform",
};

export type CaseRole = "judge" | "court_staff" | "party" | "solicitor" | "barrister" | "expert" | "external" | "registry";
export type Side = "claimant" | "defendant";

export const CASE_ROLE_LABEL: Record<CaseRole, string> = {
  judge: "Judge", court_staff: "Court staff", party: "Party", solicitor: "Solicitor", barrister: "Barrister",
  expert: "Expert", external: "External participant", registry: "Court registry",
};

/** "Claimant's solicitor", "Judge", "Defendant (party)" … */
export function roleInCase(role: CaseRole, side: Side | null): string {
  if (!side) return CASE_ROLE_LABEL[role];
  const owner = side === "claimant" ? "Claimant" : "Defendant";
  if (role === "party") return owner;
  return `${owner}'s ${CASE_ROLE_LABEL[role].toLowerCase()}`;
}

export const CASE_STATUS_LABEL: Record<string, string> = {
  pre_action: "Pre-action", issued: "Issued", stayed: "Stayed", settled: "Settled", closed: "Closed",
};
export const CASE_CATEGORY_LABEL: Record<string, string> = {
  commercial: "Commercial Court", chancery: "Chancery", technology_construction: "Technology and Construction",
  kings_bench: "King's Bench", county_court: "County Court", other: "Other",
};

/** Members of a law firm, court or tribunal can open cases (the API enforces this). */
export const canOpenCases = (me: { organisations: { type: string }[] }) =>
  me.organisations.some((o) => ["law_firm", "court", "tribunal"].includes(o.type));
