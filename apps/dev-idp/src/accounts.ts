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
];
