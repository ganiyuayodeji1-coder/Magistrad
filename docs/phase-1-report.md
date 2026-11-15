# Phase 1 report — Case workspaces

**Status:** complete, awaiting review. Nothing from Phase 2 (documents) has been started.

## What was built

| Area | Delivered |
| --- | --- |
| Cases | Open a case on behalf of a law firm (you join as that side's solicitor) or a court (you join as court staff). Each case gets a reference (MAG-YYYY-NNNNNN), title, court, category, status and optional claim number |
| Sides and parties | Claimant and defendant sides created with every case, with their parties; solicitors add parties to their own side |
| Spaces | Four areas per case, created automatically: the claimant's private workspace, the defendant's private workspace, shared documents and the court record (shown as "Court filings" and "Orders and judgments") |
| Members | Add and remove people by role (solicitor, barrister, expert, party, external; judge and court staff through the court only). Nobody can add themselves or change their own participation |
| Court link | Solicitors link a case to a court on Magistrad once; that court's registry can then assign a judge from its own members |
| Activity | An append-only case timeline. Entries about a side's counsel, experts or helpers are private to that side |
| Screens | The agreed layout from the client's sketch: case switcher at the top; Home, Files and Members down the left; "My cases" list and an "Open a case" form |

## The separation rules, and where they are enforced

| Rule | Policy module | Database | Browser test |
| --- | --- | --- | --- |
| A side's private workspace is visible only to that side's party, solicitors and counsel | ✅ | ✅ row-level security | ✅ |
| The judge and court staff never see either private workspace | ✅ | ✅ | ✅ |
| A colleague at the same firm who is not on the case sees nothing | ✅ | ✅ | — |
| The super administrator sees nothing (cases return "not found") | ✅ | ✅ | ✅ |
| The other side never sees your counsel, experts or helpers, or private timeline entries | ✅ | ✅ | ✅ |
| Only the linked court assigns judges, and only its own members | ✅ | ✅ | ✅ |
| Nobody adds themselves to a case | ✅ | ✅ | — |

## Test results (this session)

| Suite | Result |
| --- | --- |
| Database (application role, no API): identity, audit and 19 new case-separation tests | 41 passed |
| Policy module incl. both permission matrices | 223 passed |
| API incl. the Phase 1 matrix (15 actions × 10 people) through HTTP and through the database alone | 451 passed, 5 skipped by design |
| Browser end-to-end, Phases 0 and 1 (real Chromium, whole stack) | 14 passed |
| Dependency audit | No known vulnerabilities |

## Problems found and fixed during the phase

1. Linking a court was refused for everyone: the database check looked the court up as the solicitor, who cannot see other organisations. Fixed by checking against the public court directory.
2. The "Adding as" form crashed after the other side became staffed (its choices shrank). Fixed.
3. Two navigation links had the same name for super administrators. Renamed ("My organisations" / "All organisations").
4. Pages for cases a user cannot see logged server errors before returning "not found". Now a clean 404, and the attempt is recorded in the audit log.

## Known limitations

| # | Limitation | Plan |
| --- | --- | --- |
| 1 | A represented client can open their side's whole private workspace (decision D10). It holds no documents yet | Per-folder sharing in Phase 2, before any document can reach a client |
| 2 | Experts and external participants see no document areas at all | Per-folder sharing in Phase 2 |
| 3 | Solicitors of either side can change the case status and claim number (recorded in the timeline both sides see) | Review with a litigation lawyer; may restrict to the court once courts use Magistrad |
| 4 | Someone removed from a case cannot be added back | Small change in Phase 2 |
| 5 | Looking up whether an email has an account (when adding members) is not itself audited | Add with the Phase 0 limitation 4 |
| 6 | The person a solicitor invites for the other side stays on that side until the other side removes them | Acceptable; the other side controls its own team once anyone has joined |

## Next phase (needs approval)

Phase 2 — Documents and integrity: secure upload with malware scanning, versions, SHA-256 fingerprints and
verification, per-folder sharing (fixing limitations 1 and 2), serving to the shared area with written consent to
electronic service, recording court filings, and photo/video/audio evidence with exhibit numbers.
