import { describe, expect, it } from "vitest";
import { canInCase, type CaseAction, type CaseFacts } from "./cases";
import { CASE_SUBJECTS, PHASE1_MATRIX, type CaseMatrixCase, type CaseSubject } from "./case-matrix";

// Symbolic version of the fictional case (mirrors packages/db seedCaseWorld).
const FACTS: Record<CaseSubject, CaseFacts> = {
  claimantSolicitor: { me: { role: "solicitor", side: "claimant" }, isCourtAdmin: false },
  claimantColleague: { me: null, isCourtAdmin: false },
  claimantBarrister: { me: { role: "barrister", side: "claimant" }, isCourtAdmin: false },
  claimantExpert: { me: { role: "expert", side: "claimant" }, isCourtAdmin: false },
  claimantClient: { me: { role: "party", side: "claimant" }, isCourtAdmin: false },
  defendantSolicitor: { me: { role: "solicitor", side: "defendant" }, isCourtAdmin: false },
  judge: { me: { role: "judge", side: null }, isCourtAdmin: false },
  courtAdmin: { me: null, isCourtAdmin: true },
  outsider: { me: null, isCourtAdmin: false },
  superAdmin: { me: null, isCourtAdmin: false },
};

function toAction(c: CaseMatrixCase, subject: CaseSubject): CaseAction {
  switch (c.action) {
    case "case.view": case "case.update": return { type: c.action };
    case "space.read": {
      const map = { claimantPrivate: ["side_private", "claimant"], defendantPrivate: ["side_private", "defendant"], shared: ["shared", null], record: ["court_record", null] } as const;
      const [kind, side] = map[c.space];
      return { type: "space.read", kind, side };
    }
    case "participant.add":
      return { type: "participant.add", role: c.role, side: c.side, targetUserId: c.target === "self" ? subject : "someone-else",
        sideHasMembers: true, targetInCaseCourt: c.target === "courtMember", caseHasCourt: true };
    case "participant.remove":
      return { type: "participant.remove", role: "expert", side: "claimant", targetUserId: "claimantExpert", targetInCaseCourt: false, caseHasCourt: true };
    case "participant.see":
      return { type: "participant.see", role: c.target === "claimantExpert" ? "expert" : "solicitor", side: "claimant", userId: c.target };
    case "party.add": return { type: "party.add", side: c.side };
    case "timeline.readSide": return { type: "timeline.readSide", side: c.side };
  }
}

describe("case permission matrix — policy layer", () => {
  for (const row of PHASE1_MATRIX) {
    for (const subject of CASE_SUBJECTS) {
      const expected = row.allowed.includes(subject);
      it(`${row.label}: ${subject} → ${expected ? "allowed" : "denied"}`, () => {
        // participant.see of yourself is always allowed (you can see your own entry).
        const self = row.case.action === "participant.see" && row.case.target === subject;
        expect(canInCase(subject, FACTS[subject], toAction(row.case, subject)).allowed).toBe(expected || self);
      });
    }
  }

  it("lets a solicitor invite the other side's first representative, and only then", () => {
    const base = { type: "participant.add" as const, role: "solicitor" as const, side: "defendant" as const, targetUserId: "x", targetInCaseCourt: false, caseHasCourt: false };
    expect(canInCase("a", FACTS.claimantSolicitor, { ...base, sideHasMembers: false }).allowed).toBe(true);
    expect(canInCase("a", FACTS.claimantSolicitor, { ...base, sideHasMembers: true }).allowed).toBe(false);
    expect(canInCase("a", FACTS.claimantSolicitor, { ...base, role: "barrister", sideHasMembers: false }).allowed).toBe(false);
  });

  it("never lets a court assign someone from outside that court, or before the case is linked", () => {
    const base = { type: "participant.add" as const, role: "judge" as const, side: null, targetUserId: "x", sideHasMembers: true };
    expect(canInCase("a", FACTS.courtAdmin, { ...base, targetInCaseCourt: false, caseHasCourt: true }).allowed).toBe(false);
    expect(canInCase("a", FACTS.courtAdmin, { ...base, targetInCaseCourt: true, caseHasCourt: false }).allowed).toBe(false);
  });
});
