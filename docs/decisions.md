# Engineering decisions

Decisions that differ from, or add detail to, the approved plan. Newest first.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| D11 | 2026-11-15 | Case workspace uses the layout from the client's construction-platform sketch: case switcher at the top, sections (Home, Files, Members, later Issues, Evidence, Requests, Meetings) on the left; role comes from the case, never from a menu | Familiar, simple for non-technical users including judges; a self-selected "profile" would let people choose privileges |
| D10 | 2026-11-15 | Until Phase 2 adds per-folder sharing, a represented party (the client) can open their side's whole private workspace | The plan says clients see only folders shared with them. Folder sharing needs documents to exist; it must be in place before any document reaches a client |
| D9 | 2026-11-15 | A solicitor may invite the first solicitor or litigant in person for the other side, but only while that side is empty; afterwards only that side (or the court) manages it | Mirrors how a claim brings the defendant in, without letting one side control the other's team |
| D8 | 2026-11-15 | A case is linked to a court organisation on Magistrad; that court's registry can see the case exists and assign judges and court staff from its own members, but sees no documents or party teams | Judges join only through their court, never at a party's invitation |
| D7 | 2026-11-15 | Members list: everyone sees the court and those on the record (parties and solicitors); a side's barristers, experts and helpers are visible only to that side and the court | Instructing counsel or an expert can itself be privileged information |
| D6 | 2026-11-11 | The web app forwards `/api/*` to the API at runtime through an allow-listed gateway route, not a build-time rewrite | A build-time rewrite fixed the API address into the build; one image must run in every environment. The gateway also limits which headers pass in each direction. |
| D5 | 2026-11-11 | Sign-in uses OpenID Connect against any provider; development uses a local provider with fictional accounts | The managed identity provider is still undecided. The API only needs an issuer URL, client ID and secret, and enforces MFA itself by checking the `amr` claim. |
| D4 | 2026-11-11 | Sessions, sign-in flows and audit writes are reachable only through database functions; the application role has no direct access to those tables | Even a bug in the API cannot read session tokens, forge audit rows or alter the chain. |
| D3 | 2026-11-11 | Two database roles: `magistrad_owner` (migrations only) and `magistrad_app` (the running app, owns nothing, cannot bypass row-level security) | Row-level security does not bind a table's owner. Keeping the owner credential out of the running app makes the database rules a genuine second layer. |
| D2 | 2026-11-11 | Plain SQL with typed helpers instead of an ORM (Drizzle was planned) | Security rules live in SQL (policies, triggers, functions). Keeping queries as visible SQL makes them easy to review against those rules. Can be revisited. |
| D1 | 2026-11-11 | Fastify instead of NestJS for the API | NestJS relies on decorator metadata, which needs an extra compile step and complicates testing. Fastify gives the same separate, modular service with fewer moving parts for a two-person team. |
