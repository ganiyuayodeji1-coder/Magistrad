import { describe, expect, it } from "vitest";
import { can, type Action, type Actor } from "./policy";
import { PHASE0_MATRIX, SUBJECTS, resolveTarget, type ConcreteUserRef, type MatrixCase, type Subject } from "./matrix";

// Symbolic world used for the pure policy check.
const ORG = { orgA: "org-a", orgB: "org-b" } as const;
const USER: Record<ConcreteUserRef, string> = {
  superAdmin: "u-super", adminA: "u-admin-a", memberA: "u-member-a", adminB: "u-admin-b", outsider: "u-outsider", newUser: "u-new",
};
const ACTORS: Record<Subject, Actor> = {
  superAdmin: { userId: USER.superAdmin, platformRole: "super_admin", memberships: [] },
  adminA: { userId: USER.adminA, platformRole: "none", memberships: [{ organisationId: ORG.orgA, role: "org_admin" }] },
  memberA: { userId: USER.memberA, platformRole: "none", memberships: [{ organisationId: ORG.orgA, role: "member" }] },
  adminB: { userId: USER.adminB, platformRole: "none", memberships: [{ organisationId: ORG.orgB, role: "org_admin" }] },
  outsider: { userId: USER.outsider, platformRole: "none", memberships: [] },
};

function toAction(c: MatrixCase, subject: Subject): Action {
  switch (c.action) {
    case "organisation.create": case "audit.viewPlatform": case "audit.verify": case "user.list":
      return { type: c.action };
    case "organisation.view": case "organisation.update": case "member.list": case "audit.viewOrganisation":
      return { type: c.action, organisationId: ORG[c.org] };
    case "member.add":
      return { type: c.action, organisationId: ORG[c.org], targetUserId: USER[resolveTarget(c.target, subject)], role: c.role };
    case "member.remove": case "member.changeRole":
      return { type: c.action, organisationId: ORG[c.org], targetUserId: USER[resolveTarget(c.target, subject)] };
    case "user.suspend": case "user.reinstate":
      return { type: c.action, targetUserId: USER[resolveTarget(c.target, subject)] };
  }
}

describe("permission matrix — policy layer", () => {
  for (const row of PHASE0_MATRIX) {
    for (const subject of SUBJECTS) {
      const expected = row.allowed.includes(subject);
      it(`${row.label}: ${subject} → ${expected ? "allowed" : "denied"}`, () => {
        const decision = can(ACTORS[subject], toAction(row.case, subject));
        expect(decision.allowed).toBe(expected);
        expect(decision.reason.length).toBeGreaterThan(0);
      });
    }
  }

  it("never lets anyone change their own access or status", () => {
    for (const subject of SUBJECTS) {
      const a = ACTORS[subject];
      for (const type of ["member.remove", "member.changeRole"] as const) {
        expect(can(a, { type, organisationId: ORG.orgA, targetUserId: a.userId }).allowed).toBe(false);
      }
      expect(can(a, { type: "user.suspend", targetUserId: a.userId }).allowed).toBe(false);
    }
  });
});
