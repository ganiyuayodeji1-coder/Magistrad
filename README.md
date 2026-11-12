# Magistrad

A secure digital workspace for court matters in England & Wales. Each side's preparation stays
private to that side, shared material is exchanged under the rules, and every action is recorded
in a tamper-evident audit log.

**Status:** Phase 0 (foundations) is complete and awaiting review. See [`docs/phase-0-report.md`](docs/phase-0-report.md).
The product, architecture and roadmap are in the Magistrad plan document; key engineering decisions are in
[`docs/decisions.md`](docs/decisions.md). The permission matrix is in [`docs/permission-matrix.md`](docs/permission-matrix.md).

## Layout

```
apps/web        Next.js screens. No business rules; talks to the API through a same-origin /api gateway.
apps/api        Fastify API. Every request: policy check, then queries run as the user under row-level security.
apps/dev-idp    Development-only OpenID Connect provider with fictional accounts. Never deployed.
packages/db     PostgreSQL migrations (roles, row-level security, audit chain), migration runner, test helpers.
packages/policy Authorisation rules and the permission matrix shared by every test layer.
infra/azure     Terraform for one environment in UK South / UK West (written, not yet deployed).
```

## Run it locally

Needs Node 22+, pnpm 10 and PostgreSQL 16 with a superuser you can use locally.

```bash
cp .env.example .env            # then edit DATABASE_ADMIN_URL for your local superuser
pnpm install
pnpm db:bootstrap               # creates the owner and application roles and the database
pnpm db:migrate
SEED_SUPER_ADMIN_EMAIL=admin@magistrad.test SEED_SUPER_ADMIN_NAME="Morgan Platform" pnpm db:seed

pnpm dev:idp                    # terminal 1 — http://localhost:4400 (fictional accounts)
pnpm dev:api                    # terminal 2 — http://localhost:4000
pnpm dev:web                    # terminal 3 — http://localhost:3000
```

Sign in as `admin@magistrad.test` / `dev-password-1`. The development sign-in page shows the current
authenticator code for each fictional account.

## Tests

```bash
export TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres
pnpm typecheck
pnpm test          # database security, policy, API and permission-matrix tests (each run uses throwaway *_test databases)
pnpm --filter @magistrad/web build && pnpm test:e2e   # real browser through the whole stack
pnpm matrix:report # regenerates docs/permission-matrix.md
```

Test helpers refuse to create or drop any database whose name does not end in `_test`.
No real people, documents or case data are used anywhere in development or testing.
