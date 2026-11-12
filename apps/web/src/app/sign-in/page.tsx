import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  mfa_required: "Your sign-in did not include two-step verification. Sign in again and enter the code from your authenticator app.",
  no_account: "There is no Magistrad account for that sign-in. Ask your organisation's administrator to invite you.",
  suspended: "This account is suspended. Contact your organisation's administrator.",
  expired: "That sign-in took too long or was already used. Please start again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in could not be completed. Please try again.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
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
        </div>
      </section>
    </main>
  );
}
