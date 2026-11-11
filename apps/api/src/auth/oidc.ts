import * as oidc from "openid-client";
import type { Config } from "../config";

export interface OidcClient {
  config: oidc.Configuration;
  redirectUri: string;
}

/** Discovers the identity provider. Plain-HTTP issuers are allowed only outside production. */
export async function createOidcClient(cfg: Config): Promise<OidcClient> {
  const insecure = cfg.OIDC_ISSUER.startsWith("http://");
  if (insecure && cfg.NODE_ENV === "production") throw new Error("OIDC issuer must use https in production");
  const config = await oidc.discovery(
    new URL(cfg.OIDC_ISSUER),
    cfg.OIDC_CLIENT_ID,
    cfg.OIDC_CLIENT_SECRET,
    undefined,
    insecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
  return { config, redirectUri: `${cfg.API_PUBLIC_URL}/auth/callback` };
}

export { oidc };
