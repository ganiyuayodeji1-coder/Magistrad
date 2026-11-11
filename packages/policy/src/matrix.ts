/**
 * The permission matrix: the single statement of who may do what.
 *
 * Subjects and resources are symbolic so the same table can be checked against
 * (1) the policy module, (2) the API over HTTP, and (3) the database directly.
 * Later phases add rows for cases, sides and spaces.
 */
import type { ActionType, OrgRole } from "./policy";

export const SUBJECTS = ["superAdmin", "adminA", "memberA", "adminB", "outsider"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  superAdmin: "Super Administrator",
  adminA: "Admin of Firm A",
  memberA: "Member of Firm A",
  adminB: "Admin of Firm B",
  outsider: "User with no organisation",
};

/** Symbolic references resolved to real ids by each test layer. */
export type OrgRef = "orgA" | "orgB";
/** "self" means the subject acting on themselves; resolved per subject. */
export type UserRef = Subject | "newUser" | "self";
export type ConcreteUserRef = Exclude<UserRef, "self">;

export type MatrixCase =
  | { action: "organisation.create" }
  | { action: "organisation.view" | "organisation.update" | "member.list" | "audit.viewOrganisation"; org: OrgRef }
  | { action: "member.add"; org: OrgRef; target: UserRef; role: OrgRole }
  | { action: "member.remove" | "member.changeRole"; org: OrgRef; target: UserRef }
  | { action: "user.suspend" | "user.reinstate"; target: UserRef }
  | { action: "audit.viewPlatform" | "audit.verify" | "user.list" };

export interface MatrixRow {
  label: string;
  case: MatrixCase;
  allowed: ReadonlyArray<Subject>;
}

const ONLY_SUPER = ["superAdmin"] as const;

export const PHASE0_MATRIX: ReadonlyArray<MatrixRow> = [
  { label: "Create an organisation", case: { action: "organisation.create" }, allowed: ONLY_SUPER },
  { label: "View Firm A", case: { action: "organisation.view", org: "orgA" }, allowed: ["superAdmin", "adminA", "memberA"] },
  { label: "Rename Firm A", case: { action: "organisation.update", org: "orgA" }, allowed: ["superAdmin", "adminA"] },
  { label: "List Firm A's members", case: { action: "member.list", org: "orgA" }, allowed: ["superAdmin", "adminA", "memberA"] },
  { label: "Add a new user to Firm A", case: { action: "member.add", org: "orgA", target: "newUser", role: "member" }, allowed: ["superAdmin", "adminA"] },
  { label: "Add yourself to Firm A as admin", case: { action: "member.add", org: "orgA", target: "self", role: "org_admin" }, allowed: [] },
  { label: "Make Firm A's member an admin", case: { action: "member.changeRole", org: "orgA", target: "memberA" }, allowed: ["superAdmin", "adminA"] },
  { label: "Remove Firm A's member", case: { action: "member.remove", org: "orgA", target: "memberA" }, allowed: ["superAdmin", "adminA"] },
  { label: "Remove Firm B's admin", case: { action: "member.remove", org: "orgB", target: "adminB" }, allowed: ["superAdmin"] },
  { label: "List every account on the platform", case: { action: "user.list" }, allowed: ONLY_SUPER },
  { label: "Suspend Firm A's member", case: { action: "user.suspend", target: "memberA" }, allowed: ONLY_SUPER },
  { label: "View platform audit log", case: { action: "audit.viewPlatform" }, allowed: ONLY_SUPER },
  { label: "Verify audit chain", case: { action: "audit.verify" }, allowed: ONLY_SUPER },
  { label: "View Firm A's audit log", case: { action: "audit.viewOrganisation", org: "orgA" }, allowed: ["superAdmin", "adminA"] },
];

export const resolveTarget = (target: UserRef, subject: Subject): ConcreteUserRef =>
  target === "self" ? subject : target;
