# Permission matrix (Phase 0)

Generated from `packages/policy/src/matrix.ts` by `pnpm matrix:report`. Do not edit by hand.

Every cell is tested three ways: against the policy module, against the API over HTTP,
and (for data access) directly against PostgreSQL row-level security as the application role.

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
