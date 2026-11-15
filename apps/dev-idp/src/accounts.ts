/**
 * Fictional development accounts. No real people, no real data.
 * `mfa: false` exists to prove that Magistrad rejects sign-ins without MFA.
 */
export interface DevAccount {
  sub: string;
  email: string;
  name: string;
  password: string;
  totpSecret: string | null;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { sub: "dev-super-admin", email: "admin@magistrad.test", name: "Morgan Platform (fictional)", password: "dev-password-1", totpSecret: "JBSWY3DPEHPK3PXP" },
  { sub: "dev-alpha-admin", email: "alice@alpha-llp.test", name: "Alice Admin (fictional)", password: "dev-password-1", totpSecret: "KRSXG5CTMVRXEZLU" },
  { sub: "dev-alpha-member", email: "ben@alpha-llp.test", name: "Ben Member (fictional)", password: "dev-password-1", totpSecret: "MFRGGZDFMZTWQ2LK" },
  { sub: "dev-beta-admin", email: "carol@beta-co.test", name: "Carol Beta (fictional)", password: "dev-password-1", totpSecret: "GEZDGNBVGY3TQOJQ" },
  { sub: "dev-no-mfa", email: "dan@nomfa.test", name: "Dan NoMFA (fictional)", password: "dev-password-1", totpSecret: null },
  // A fictional case cast (Phase 1)
  { sub: "dev-claimant-sol", email: "grace@northgate.test", name: "Grace Northgate (fictional)", password: "dev-password-1", totpSecret: "ONSWG4TFOQZDCMRT" },
  { sub: "dev-defendant-sol", email: "dave@defence-llp.test", name: "Dave Defence (fictional)", password: "dev-password-1", totpSecret: "MZXW6YTBOJRGC4TO" },
  { sub: "dev-barrister", email: "eve@chambers.test", name: "Eve Counsel (fictional)", password: "dev-password-1", totpSecret: "NBSWY3DPO5XXE3DE" },
  { sub: "dev-expert", email: "frank@experts.test", name: "Frank Expert (fictional)", password: "dev-password-1", totpSecret: "KRUGKIDROVUWG2ZA" },
  { sub: "dev-judge", email: "judge.ray@court.test", name: "HHJ Ray (fictional)", password: "dev-password-1", totpSecret: "IFBEGRCFIZDUQSKK" },
  { sub: "dev-registry", email: "registry@court.test", name: "Rita Registry (fictional)", password: "dev-password-1", totpSecret: "JBSWY3DPEB3W64TM" },
];
