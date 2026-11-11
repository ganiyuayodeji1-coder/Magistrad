/**
 * Magistrad authorisation rules — the API's first enforcement layer.
 * PostgreSQL row-level security (packages/db/migrations) is the second and
 * independent layer; the permission matrix is tested against both.
 *
 * Deny by default: anything not explicitly allowed here is refused.
 */

export type PlatformRole = "none" | "super_admin";
export type OrgRole = "org_admin" | "member";

export interface Actor {
  userId: string;
  platformRole: PlatformRole;
  memberships: ReadonlyArray<{ organisationId: string; role: OrgRole }>;
}

export type Action =
  | { type: "organisation.create" }
  | { type: "organisation.view"; organisationId: string }
  | { type: "organisation.update"; organisationId: string }
  | { type: "member.list"; organisationId: string }
  | { type: "member.add"; organisationId: string; targetUserId?: string; role: OrgRole }
  | { type: "member.remove"; organisationId: string; targetUserId: string }
  | { type: "member.changeRole"; organisationId: string; targetUserId: string }
  | { type: "user.list" }
  | { type: "user.suspend"; targetUserId: string }
  | { type: "user.reinstate"; targetUserId: string }
  | { type: "audit.viewPlatform" }
  | { type: "audit.viewOrganisation"; organisationId: string }
  | { type: "audit.verify" };

export type ActionType = Action["type"];

export interface Decision {
  allowed: boolean;
  /** Safe to show to the user and to record in the audit log. */
  reason: string;
}

const allow = (reason: string): Decision => ({ allowed: true, reason });
const deny = (reason: string): Decision => ({ allowed: false, reason });

const isSuper = (a: Actor) => a.platformRole === "super_admin";
const roleIn = (a: Actor, org: string) => a.memberships.find((m) => m.organisationId === org)?.role;
const isOrgAdmin = (a: Actor, org: string) => roleIn(a, org) === "org_admin";
const isMember = (a: Actor, org: string) => roleIn(a, org) !== undefined;

export function can(actor: Actor, action: Action): Decision {
  switch (action.type) {
    case "organisation.create":
      return isSuper(actor) ? allow("super administrator") : deny("only a super administrator can create organisations");

    case "organisation.view":
    case "member.list":
      if (isSuper(actor)) return allow("super administrator");
      return isMember(actor, action.organisationId) ? allow("member of the organisation") : deny("not a member of this organisation");

    case "organisation.update":
      if (isSuper(actor)) return allow("super administrator");
      return isOrgAdmin(actor, action.organisationId) ? allow("organisation administrator") : deny("not an administrator of this organisation");

    case "member.add":
    case "member.remove":
    case "member.changeRole": {
      // Nobody grants, changes or removes their own access — not even a super administrator.
      if ("targetUserId" in action && action.targetUserId === actor.userId) {
        return deny("you cannot change your own membership");
      }
      if (isSuper(actor)) return allow("super administrator");
      return isOrgAdmin(actor, action.organisationId)
        ? allow("organisation administrator")
        : deny("not an administrator of this organisation");
    }

    case "user.suspend":
    case "user.reinstate":
      if (action.targetUserId === actor.userId) return deny("you cannot change your own account status");
      return isSuper(actor) ? allow("super administrator") : deny("only a super administrator can change account status");

    case "user.list":
      return isSuper(actor) ? allow("super administrator") : deny("only a super administrator can list all accounts");

    case "audit.viewPlatform":
    case "audit.verify":
      return isSuper(actor) ? allow("super administrator") : deny("only a super administrator can see platform audit records");

    case "audit.viewOrganisation":
      if (isSuper(actor)) return allow("super administrator");
      return isOrgAdmin(actor, action.organisationId)
        ? allow("organisation administrator")
        : deny("only the organisation's administrators can see its audit records");

    default: {
      const unreachable: never = action;
      return deny(`unknown action ${(unreachable as Action).type}`);
    }
  }
}
