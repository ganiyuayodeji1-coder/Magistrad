import type { FastifyRequest } from "fastify";
import { appendAudit, withActor, type Pool } from "@magistrad/db";
import { can, type Action } from "@magistrad/policy";
import { requireUser, type CurrentUser } from "../auth/session";
import { forbidden } from "./errors";

/**
 * First enforcement layer. Denials are recorded in the audit log, then refused.
 * The database's row-level security remains the second, independent layer.
 */
export async function authorize(req: FastifyRequest, pool: Pool, action: Action): Promise<CurrentUser> {
  const current = requireUser(req);
  const decision = can(current.actor, action);
  if (!decision.allowed) {
    const organisationId = "organisationId" in action ? action.organisationId : null;
    await withActor(pool, current.user.id, (tx) => appendAudit(tx, {
      action: action.type, outcome: "denied", ipAddress: req.ip,
      // Denials are logged against the platform, not the target organisation,
      // so a firm's admins don't see probing noise as their own activity.
      metadata: { reason: decision.reason, targetOrganisationId: organisationId },
    }));
    throw forbidden(`You do not have permission to do that: ${decision.reason}.`);
  }
  return current;
}
