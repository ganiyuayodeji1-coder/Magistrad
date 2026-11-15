/**
 * Case-level authorisation: the API's first layer for everything inside a case.
 * Mirrors the row-level security in packages/db/migrations/0004_cases.sql;
 * the case permission matrix is tested against both.
 */
import type { Decision } from "./policy";

export type CaseRole = "judge" | "court_staff" | "party" | "solicitor" | "barrister" | "expert" | "external";
export type SideKind = "claimant" | "defendant";
export type SpaceKind = "side_private" | "shared" | "court_record";

export const COURT_ROLES: readonly CaseRole[] = ["judge", "court_staff"];
export const ON_THE_RECORD: readonly CaseRole[] = ["judge", "court_staff", "party", "solicitor"];

export interface CaseFacts {
  /** The actor's own active participation, if any. */
  me: { role: CaseRole; side: SideKind | null } | null;
  /** Actor administers the court organisation this case is linked to. */
  isCourtAdmin: boolean;
}

export type CaseAction =
  | { type: "case.view" }
  | { type: "case.update" }
  | { type: "case.linkCourt"; alreadyLinked: boolean }
  | { type: "space.read"; kind: SpaceKind; side: SideKind | null }
  | { type: "participant.add"; role: CaseRole; side: SideKind | null; targetUserId: string; sideHasMembers: boolean; targetInCaseCourt: boolean; caseHasCourt: boolean }
  | { type: "participant.remove"; role: CaseRole; side: SideKind | null; targetUserId: string; targetInCaseCourt: boolean; caseHasCourt: boolean }
  | { type: "participant.see"; role: CaseRole; side: SideKind | null; userId: string }
  | { type: "party.add"; side: SideKind }
  | { type: "timeline.readSide"; side: SideKind };

const allow = (reason: string): Decision => ({ allowed: true, reason });
const deny = (reason: string): Decision => ({ allowed: false, reason });

export function canInCase(actorId: string, facts: CaseFacts, action: CaseAction): Decision {
  const me = facts.me;
  switch (action.type) {
    case "case.view":
      if (me) return allow("participant in the case");
      return facts.isCourtAdmin ? allow("registry of the linked court") : deny("you are not on this case");

    case "case.update":
      return me && (me.role === "solicitor" || me.role === "court_staff")
        ? allow("solicitor or court staff on the case")
        : deny("only solicitors on the record or court staff can change case details");

    case "case.linkCourt":
      if (me?.role === "court_staff") return allow("court staff");
      if (me?.role === "solicitor" && !action.alreadyLinked) return allow("solicitor linking the court for the first time");
      return deny(action.alreadyLinked ? "only the court can change the court a case is linked to" : "only solicitors or court staff can link a court");

    case "space.read":
      if (!me) return deny("you are not on this case");
      if (action.kind === "side_private") {
        return (me.role === "party" || me.role === "solicitor" || me.role === "barrister") && me.side === action.side
          ? allow("your side's private workspace")
          : deny("this is another side's private workspace");
      }
      return ["judge", "court_staff", "party", "solicitor", "barrister"].includes(me.role)
        ? allow("shared with everyone on the case")
        : deny("experts and external participants see only folders shared with them");

    case "participant.see":
      if (!me) return deny("you are not on this case");
      if (action.userId === actorId || COURT_ROLES.includes(me.role) || ON_THE_RECORD.includes(action.role) || action.side === me.side) {
        return allow("visible to you");
      }
      return deny("another side's counsel and experts are private to that side");

    case "participant.add":
    case "participant.remove": {
      if (action.targetUserId === actorId) return deny("you cannot change your own participation");
      if (COURT_ROLES.includes(action.role)) {
        if (!action.caseHasCourt) return deny("the case is not linked to a court yet");
        if (!(me?.role === "court_staff" || facts.isCourtAdmin)) return deny("only the court can assign judges and court staff");
        return action.targetInCaseCourt ? allow("court assigning its own member") : deny("judges and court staff must belong to the linked court");
      }
      if (!action.side) return deny("say which side");
      if (me?.role === "court_staff") return allow("court staff");
      if (me?.role === "solicitor" && me.side === action.side) return allow("solicitor managing their own side");
      if (action.type === "participant.add" && me?.role === "solicitor" && me.side !== action.side
          && (action.role === "solicitor" || action.role === "party") && !action.sideHasMembers) {
        return allow("inviting the other side's first representative");
      }
      return deny("only that side's solicitor (or the court) can change who is on that side");
    }

    case "party.add":
      if (me?.role === "court_staff") return allow("court staff");
      return me?.role === "solicitor" && me.side === action.side ? allow("solicitor for that side") : deny("only that side's solicitor can add parties to it");

    case "timeline.readSide":
      return me && me.side === action.side ? allow("your side") : deny("another side's private activity");

    default: {
      const never: never = action;
      return deny(`unknown action ${(never as CaseAction).type}`);
    }
  }
}
