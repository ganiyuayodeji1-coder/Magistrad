/** The Phase 1 permission matrix: one fictional case, ten kinds of person. */
export const CASE_SUBJECTS = [
  "claimantSolicitor", "claimantColleague", "claimantBarrister", "claimantExpert", "claimantClient",
  "defendantSolicitor", "judge", "courtAdmin", "outsider", "superAdmin",
] as const;
export type CaseSubject = (typeof CASE_SUBJECTS)[number];

export const CASE_SUBJECT_LABELS: Record<CaseSubject, string> = {
  claimantSolicitor: "Claimant's solicitor",
  claimantColleague: "Colleague at claimant's firm, not on the case",
  claimantBarrister: "Claimant's barrister",
  claimantExpert: "Claimant's expert",
  claimantClient: "Claimant (client)",
  defendantSolicitor: "Defendant's solicitor",
  judge: "Judge",
  courtAdmin: "Court registry (not on the case)",
  outsider: "Unconnected user",
  superAdmin: "Super Administrator",
};

export type CaseMatrixCase =
  | { action: "case.view" | "case.update" }
  | { action: "space.read"; space: "claimantPrivate" | "defendantPrivate" | "shared" | "record" }
  | { action: "participant.add"; target: "newPerson" | "self" | "courtMember"; role: "barrister" | "solicitor" | "judge"; side: "claimant" | "defendant" | null }
  | { action: "participant.remove"; target: "claimantExpert" }
  | { action: "participant.see"; target: "claimantExpert" | "claimantSolicitor" }
  | { action: "party.add"; side: "claimant" }
  | { action: "timeline.readSide"; side: "claimant" };

export interface CaseMatrixRow { label: string; case: CaseMatrixCase; allowed: ReadonlyArray<CaseSubject> }

const CLAIMANT_TEAM = ["claimantSolicitor", "claimantBarrister", "claimantClient"] as const;
const ON_CASE_READERS = [...CLAIMANT_TEAM, "defendantSolicitor", "judge"] as const;

export const PHASE1_MATRIX: ReadonlyArray<CaseMatrixRow> = [
  { label: "Open the case", case: { action: "case.view" }, allowed: [...ON_CASE_READERS, "claimantExpert", "courtAdmin"] },
  { label: "Claimant's private folder", case: { action: "space.read", space: "claimantPrivate" }, allowed: CLAIMANT_TEAM },
  { label: "Defendant's private folder", case: { action: "space.read", space: "defendantPrivate" }, allowed: ["defendantSolicitor"] },
  { label: "Shared documents", case: { action: "space.read", space: "shared" }, allowed: ON_CASE_READERS },
  { label: "Court record (filings, orders, judgments)", case: { action: "space.read", space: "record" }, allowed: ON_CASE_READERS },
  { label: "See the claimant's expert in Members", case: { action: "participant.see", target: "claimantExpert" }, allowed: [...CLAIMANT_TEAM, "claimantExpert", "judge"] },
  { label: "See the claimant's solicitor in Members", case: { action: "participant.see", target: "claimantSolicitor" }, allowed: [...ON_CASE_READERS, "claimantExpert"] },
  { label: "See the claimant side's private activity", case: { action: "timeline.readSide", side: "claimant" }, allowed: [...CLAIMANT_TEAM, "claimantExpert"] },
  { label: "Instruct a barrister for the claimant", case: { action: "participant.add", target: "newPerson", role: "barrister", side: "claimant" }, allowed: ["claimantSolicitor"] },
  { label: "Add a solicitor to the (already staffed) defendant side", case: { action: "participant.add", target: "newPerson", role: "solicitor", side: "defendant" }, allowed: ["defendantSolicitor"] },
  { label: "Assign a judge from the linked court", case: { action: "participant.add", target: "courtMember", role: "judge", side: null }, allowed: ["courtAdmin"] },
  { label: "Add yourself to the case", case: { action: "participant.add", target: "self", role: "solicitor", side: "claimant" }, allowed: [] },
  { label: "Remove the claimant's expert", case: { action: "participant.remove", target: "claimantExpert" }, allowed: ["claimantSolicitor"] },
  { label: "Add a party to the claimant side", case: { action: "party.add", side: "claimant" }, allowed: ["claimantSolicitor"] },
  { label: "Change case details", case: { action: "case.update" }, allowed: ["claimantSolicitor", "defendantSolicitor"] },
];
