# Engineering decisions

Decisions that differ from, or add detail to, the approved plan. Newest first.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| D6 | 2026-11-11 | The web app forwards `/api/*` to the API at runtime through an allow-listed gateway route, not a build-time rewrite | A build-time rewrite fixed the API address into the build; one image must run in every environment. The gateway also limits which headers pass in each direction. |
| D5 | 2026-11-11 | Sign-in uses OpenID Connect against any provider; development uses a local provider with fictional accounts | The managed identity provider is still undecided. The API only needs an issuer URL, client ID and secret, and enforces MFA itself by checking the `amr` claim. |
| D4 | 2026-11-11 | Sessions, sign-in flows and audit writes are reachable only through database functions; the application role has no direct access to those tables | Even a bug in the API cannot read session tokens, forge audit rows or alter the chain. |
| D3 | 2026-11-11 | Two database roles: `magistrad_owner` (migrations only) and `magistrad_app` (the running app, owns nothing, cannot bypass row-level security) | Row-level security does not bind a table's owner. Keeping the owner credential out of the running app makes the database rules a genuine second layer. |
| D2 | 2026-11-11 | Plain SQL with typed helpers instead of an ORM (Drizzle was planned) | Security rules live in SQL (policies, triggers, functions). Keeping queries as visible SQL makes them easy to review against those rules. Can be revisited. |
| D1 | 2026-11-11 | Fastify instead of NestJS for the API | NestJS relies on decorator metadata, which needs an extra compile step and complicates testing. Fastify gives the same separate, modular service with fewer moving parts for a two-person team. |
