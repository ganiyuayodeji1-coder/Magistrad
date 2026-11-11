import http from "node:http";
import Provider, { type Configuration } from "oidc-provider";
import { DEV_ACCOUNTS } from "./accounts";
import { totp, verifyTotp } from "./totp";

export { DEV_ACCOUNTS } from "./accounts";
export { totp } from "./totp";

export interface DevIdpOptions {
  port: number;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:15px system-ui,sans-serif;background:#f5f5f4;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:32px;width:min(380px,90vw)}
.dev{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:8px 10px;font-size:13px;margin-bottom:20px}
label{display:block;font-weight:600;margin:14px 0 6px}input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #d6d3d1;border-radius:6px;font-size:15px}
button{margin-top:20px;width:100%;padding:10px;border:0;border-radius:6px;background:#1c1917;color:#fff;font-size:15px;cursor:pointer}
.err{color:#b91c1c;margin-top:12px}table{font-size:12px;border-collapse:collapse;margin-top:20px;width:100%}td{padding:3px 4px;border-top:1px solid #eee}code{font-size:12px}
</style></head><body><main>${body}</main></body></html>`;
}

function loginPage(uid: string, error?: string): string {
  const rows = DEV_ACCOUNTS.map((a) =>
    `<tr><td><code>${esc(a.email)}</code></td><td>${a.totpSecret ? `<code data-code-for="${esc(a.email)}">${totp(a.totpSecret)}</code>` : "no MFA"}</td></tr>`).join("");
  return page("Development sign-in", `
<div class="dev"><strong>Development identity provider.</strong> Fictional accounts only. Production uses the managed identity service.</div>
<form method="post" action="/interaction/${esc(uid)}/login">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<label for="code">Authenticator code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code">
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<button type="submit">Sign in</button></form>
<table><tr><td colspan="2">Test accounts (password <code>dev-password-1</code>), current codes:</td></tr>${rows}</table>`);
}

async function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("body too large");
  }
  return new URLSearchParams(body);
}

export async function startDevIdp(opts: DevIdpOptions): Promise<{ close: () => Promise<void>; issuer: string }> {
  if (process.env.NODE_ENV === "production") throw new Error("The development identity provider must never run in production.");

  const configuration: Configuration = {
    clients: [{
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uris: opts.redirectUris,
      post_logout_redirect_uris: opts.postLogoutRedirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }],
    pkce: { required: () => true },
    // `amr` (authentication methods) must be part of a scope, or it is silently left out of ID tokens.
    claims: { openid: ["sub", "amr"], email: ["email", "email_verified"], profile: ["name"] },
    conformIdTokenClaims: false, // put email/name in the ID token so the client needs no userinfo call
    findAccount: async (_ctx, id) => {
      const a = DEV_ACCOUNTS.find((x) => x.sub === id);
      if (!a) return undefined;
      return { accountId: a.sub, claims: async () => ({ sub: a.sub, email: a.email, email_verified: true, name: a.name }) };
    },
    features: { devInteractions: { enabled: false }, rpInitiatedLogout: { enabled: true } },
    cookies: { keys: ["dev-only-cookie-signing-key"] },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  };
  const provider = new Provider(opts.issuer, configuration);
  provider.proxy = true;
  const callback = provider.callback();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", opts.issuer);
      const login = url.pathname.match(/^\/interaction\/([\w-]+)\/login$/);
      const show = url.pathname.match(/^\/interaction\/([\w-]+)$/);
      if (show && req.method === "GET") {
        const details = await provider.interactionDetails(req, res);
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(loginPage(details.uid));
        return;
      }
      if (login && req.method === "POST") {
        const details = await provider.interactionDetails(req, res);
        const form = await readForm(req);
        const account = DEV_ACCOUNTS.find((a) => a.email === (form.get("email") ?? "").trim().toLowerCase());
        const passwordOk = account && account.password === form.get("password");
        const code = form.get("code") ?? "";
        const mfa = !!(account?.totpSecret && code && verifyTotp(account.totpSecret, code));
        if (!account || !passwordOk || (account.totpSecret && code && !mfa)) {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.statusCode = 401;
          res.end(loginPage(details.uid, "Those details are not right."));
          return;
        }
        const grant = new provider.Grant({ accountId: account.sub, clientId: details.params.client_id as string });
        grant.addOIDCScope(String(details.params.scope ?? "openid"));
        const grantId = await grant.save();
        await provider.interactionFinished(req, res, {
          login: { accountId: account.sub, amr: mfa ? ["pwd", "otp", "mfa"] : ["pwd"] },
          consent: { grantId },
        }, { mergeWithLastSubmission: false });
        return;
      }
      callback(req, res);
    } catch (err) {
      res.statusCode = 400;
      res.setHeader("content-type", "text/plain");
      res.end(`Sign-in error: ${(err as Error).message}`);
    }
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  return {
    issuer: opts.issuer,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
