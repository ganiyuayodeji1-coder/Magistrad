# Permission matrix

Generated from `packages/policy/src/matrix.ts` by `pnpm matrix:report`. Do not edit by hand.

Every cell is tested three ways: against the policy module, against the API over HTTP,
and (for data access) directly against PostgreSQL row-level security as the application role.

## Platform (Phase 0)

| Action | Super Administrator | Admin of Firm A | Member of Firm A | Admin of Firm B | User with no organisation |
| --- | :---: | :---: | :---: | :---: | :---: |
| Create an organisation | ✅ | — | — | — | — |
| View Firm A | ✅ | ✅ | ✅ | — | — |
| Rename Firm A | ✅ | ✅ | — | — | — |
| List Firm A's members | ✅ | ✅ | ✅ | — | — |
| Add a new user to Firm A | ✅ | ✅ | — | — | — |
| Add yourself to Firm A as admin | — | — | — | — | — |
| Make Firm A's member an admin | ✅ | ✅ | — | — | — |
| Remove Firm A's member | ✅ | ✅ | — | — | — |
| Remove Firm B's admin | ✅ | — | — | — | — |
| List every account on the platform | ✅ | — | — | — | — |
| Suspend Firm A's member | ✅ | — | — | — | — |
| View platform audit log | ✅ | — | — | — | — |
| Verify audit chain | ✅ | — | — | — | — |
| View Firm A's audit log | ✅ | ✅ | — | — | — |

## Inside a case (Phase 1)

One fictional case: Acme Widgets Ltd v Bloggs Builders Ltd. The claimant's solicitor opened it,
instructed counsel and an expert, added the client and invited the defendant's solicitor; the case is
linked to a court whose registry assigned a judge.

| Action | Claimant's solicitor | Colleague at claimant's firm, not on the case | Claimant's barrister | Claimant's expert | Claimant (client) | Defendant's solicitor | Judge | Court registry (not on the case) | Unconnected user | Super Administrator |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Open the case | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Claimant's private folder | ✅ | — | ✅ | — | ✅ | — | — | — | — | — |
| Defendant's private folder | — | — | — | — | — | ✅ | — | — | — | — |
| Shared documents | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — |
| Court record (filings, orders, judgments) | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — | — | — |
| See the claimant's expert in Members | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| See the claimant's solicitor in Members | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| See the claimant side's private activity | ✅ | — | ✅ | ✅ | ✅ | — | — | — | — | — |
| Instruct a barrister for the claimant | ✅ | — | — | — | — | — | — | — | — | — |
| Add a solicitor to the (already staffed) defendant side | — | — | — | — | — | ✅ | — | — | — | — |
| Assign a judge from the linked court | — | — | — | — | — | — | — | ✅ | — | — |
| Add yourself to the case | — | — | — | — | — | — | — | — | — | — |
| Remove the claimant's expert | ✅ | — | — | — | — | — | — | — | — | — |
| Add a party to the claimant side | ✅ | — | — | — | — | — | — | — | — | — |
| Change case details | ✅ | — | — | — | — | ✅ | — | — | — | — |
