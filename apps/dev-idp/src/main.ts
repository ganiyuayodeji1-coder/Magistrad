import { loadRootEnv, requireEnv } from "@magistrad/db";
import { startDevIdp } from "./index";

loadRootEnv();
const issuer = requireEnv("OIDC_ISSUER");
const web = requireEnv("WEB_ORIGIN");
await startDevIdp({
  port: Number(process.env.DEV_IDP_PORT ?? 4400),
  issuer,
  clientId: requireEnv("OIDC_CLIENT_ID"),
  clientSecret: requireEnv("OIDC_CLIENT_SECRET"),
  redirectUris: [`${requireEnv("API_PUBLIC_URL")}/auth/callback`],
  postLogoutRedirectUris: [`${web}/signed-out`],
});
console.log(`Development identity provider running at ${issuer} (fictional accounts only)`);
