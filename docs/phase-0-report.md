# Phase 0 report — Foundations

**Status:** complete, awaiting review. Nothing from Phase 1 (cases) has been started.

## What was built

| Area | Delivered |
| --- | --- |
| Repository and CI | pnpm monorepo, strict TypeScript, GitHub Actions: typecheck, dependency audit, all test suites, production build, browser tests, Terraform format and validate |
| Sign-in | OpenID Connect with PKCE, state and nonce; forced re-authentication (`prompt=login`); MFA required via the `amr` claim; invited users activate on first verified sign-in; unknown and suspended people refused |
| Sessions | Random 256-bit tokens, only their SHA-256 stored; 30-minute idle and 12-hour absolute limits; immediate revocation on sign-out or suspension; `HttpOnly`, `SameSite=Lax`, `__Host-` and `Secure` in production |
| Organisations and people | Firms, chambers, courts and tribunals; organisation admins manage their own members; admin-provisioned accounts only; nobody can add, promote or remove themselves |
| Permission system | Policy module (deny by default) in the API, and PostgreSQL row-level security as an independent second layer |
| Audit log | Every sign-in, change and refusal recorded; SHA-256 hash chain computed inside the database under a lock; append-only (writes only through a function, updates and deletes blocked by triggers); full-chain verification; checkpoints for later write-once anchoring |
| Permission-matrix harness | One table of who may do what (`packages/policy/src/matrix.ts`), tested against the policy module, the API over HTTP and the database alone; human-readable copy in `docs/permission-matrix.md` |
| Screens | Sign-in, overview, organisation members (add, change role, remove), activity log, and super-admin pages for organisations, accounts (suspend/reinstate) and the platform audit log with integrity check |
| Web security | Per-request nonce Content-Security-Policy (no inline scripts), no framing, CSRF protection by origin check plus JSON-only bodies, client IP taken from forwarding headers only for a configured number of trusted proxies |
| Infrastructure | Terraform for Azure UK South with UK West recovery: private PostgreSQL 16 (HA, 35-day PITR, geo-redundant backups), HSM-backed Key Vault, documents storage with customer-managed key, containers per space kind, write-once policy for the record and audit-checkpoint containers, Container Apps with no public API |

## Test results (this session)

| Suite | Result |
| --- | --- |
| Database security (run as the application role, no API) | 22 passed |
| Policy module incl. matrix | 71 passed |
| API: sign-in, HTTP security, permission matrix via HTTP and via database | 151 passed, 5 skipped by design (account listing has no database rule) |
| Browser end-to-end (real Chromium, whole stack) | 8 passed |
| Dependency audit | No known vulnerabilities |
| Terraform | Formatting and syntax pass; full `validate` blocked here (no access to the provider registry) and runs in CI |

## Problems found and fixed during the phase

1. Guard triggers ran with owner rights, which would have let every change through. Fixed to run as the caller.
2. Row-level security was forced onto the owner, which broke the database's own functions. Fixed by exempting only the owner, which the app never uses.
3. Parallel test runs reset shared database-role passwords. Fixed with a lock and configured passwords.
4. The identity provider did not include the MFA marker; the API correctly refused every sign-in (fail-safe) until fixed.
5. The matrix tests found two API defects (action names rejected by the audit log, causing server errors instead of clean refusals). Fixed.
6. The browser tests found that the API address was fixed at build time. Replaced with a runtime gateway (decision D6).

## Security review: known limitations

| # | Limitation | Risk | Plan |
| --- | --- | --- | --- |
| 1 | The database trusts the API to have verified the identity token before calling the sign-in function | A compromised API process could activate an invited account | Inherent to any app-verified sign-in; mitigated by keeping the API private and minimal. Revisit with signed assertions if needed |
| 2 | Rate limiting is per API instance, in memory | Limits multiply with replicas | Front Door WAF rate limiting before pilot (infra TODO) |
| 3 | Audit checkpoints are recorded but not yet copied to write-once storage | A full rewrite of the chain by someone with owner credentials would not be detected externally | Copy checkpoints to the immutable `audit-checkpoints` container in Phase 2 |
| 4 | Email lookup by admins is not itself audited | An admin could test which emails have accounts | Add an audit event for lookups (small, Phase 1) |
| 5 | Signing out does not end the identity-provider session | Shared computers | Every Magistrad sign-in forces re-authentication, which limits the impact; add provider logout with the real provider |
| 6 | Not yet in Terraform: Front Door + WAF, Defender for Storage, alert rules, deployment pipeline | Needed before any pilot | Scheduled before the Phase 3 gate |
| 7 | Terraform has not been validated against the Azure provider in this environment | Attribute names may need small corrections | CI runs `terraform validate` on every push |

## Decisions needed from you

- The managed identity provider (Microsoft Entra External ID, Auth0 or WorkOS), so the real sign-in can replace the development one.
- An Azure subscription when you want the first environment deployed.
