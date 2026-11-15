import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { Wordmark } from "@/components/wordmark";
import { PreviewSignIn } from "@/components/app/preview-sign-in";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  mfa_required: "Your sign-in did not include two-step verification. Sign in again and enter the code from your authenticator app.",
  no_account: "There is no Magistrad account for that sign-in. Ask your organisation's administrator to invite you.",
  suspended: "This account is suspended. Contact your organisation's administrator.",
  expired: "That sign-in took too long or was already used. Please start again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in could not be completed. Please try again.",
};

// What each fictional preview person is, so a visitor knows whose eyes they are looking through.
const PREVIEW_HINTS: Record<string, string> = {
  "admin@magistrad.test": "Super Administrator: manages firms and accounts, sees no case material",
  "grace@northgate.test": "Claimant's solicitor on Acme v Bloggs",
  "eve@chambers.test": "Claimant's barrister on Acme v Bloggs",
  "frank@experts.test": "Claimant's expert on Acme v Bloggs",
  "dave@defence-llp.test": "Defendant's solicitor on Acme v Bloggs",
  "judge.ray@court.test": "Judge on Acme v Bloggs",
  "registry@court.test": "Court registry: assigns judges, sees no documents",
  "alice@alpha-llp.test": "Administrator of Alpha LLP (no cases)",
};

async function previewAccounts() {
  if (process.env.MAGISTRAD_PREVIEW !== "1") return null;
  const api = process.env.API_INTERNAL_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
  const res = await fetch(`${api}/dev/preview-accounts`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const { accounts } = (await res.json()) as { accounts: { email: string; name: string }[] };
  return accounts.filter((a) => PREVIEW_HINTS[a.email]).map((a) => ({ ...a, name: a.name.replace(" (fictional)", ""), hint: PREVIEW_HINTS[a.email]! }));
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
  const preview = await previewAccounts();
  const href = `/api/auth/login${returnTo?.startsWith("/") && !returnTo.startsWith("//") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <section className="relative hidden overflow-hidden bg-navy px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Wordmark light />
        <div className="max-w-lg">
          <p className="font-serif text-[34px] leading-[1.2]">Every matter in one secure record — private where it must be, shared where the rules require.</p>
          <ul className="mt-8 space-y-3 text-[15px] text-white/75">
            <li>Each side's preparation stays private to that side.</li>
            <li>Every document and action is recorded in a tamper-evident log.</li>
            <li>Access is granted by your organisation, never by yourself.</li>
          </ul>
        </div>
        <p className="text-xs text-white/50">Authorised users only. Activity is monitored and recorded.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-12 lg:hidden" />
          <h1 className="font-serif text-[30px] text-ink">Sign in</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Use your organisation account. You will be asked for a code from your authenticator app.</p>
          {error && <Alert tone="error" className="mt-6">{ERRORS[error] ?? ERRORS.failed}</Alert>}
          <Button asChild size="lg" className="mt-8 w-full">
            <a href={href}>Continue to sign in</a>
          </Button>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            Accounts are created by an administrator. Magistrad never asks for your password on this page — you enter it only on your organisation's sign-in screen.
          </p>
          {preview && preview.length > 0 && <PreviewSignIn accounts={preview} />}
        </div>
      </section>
    </main>
  );
}
