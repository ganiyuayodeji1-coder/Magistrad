"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";

/** PREVIEW ONLY: pick a fictional person. Shown only when the server runs in preview mode. */
export function PreviewSignIn({ accounts }: { accounts: { email: string; name: string; hint: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  return (
    <div className="mt-8 rounded-lg border border-brass/40 bg-brass-soft/40 p-4">
      <p className="text-sm font-medium text-ink">Preview: sign in as a fictional person</p>
      <p className="mt-1 text-xs text-ink-soft">This shortcut exists only in preview mode and cannot be switched on in production. Each person sees only what their role allows.</p>
      <ul className="mt-3 space-y-1.5">
        {accounts.map((a) => (
          <li key={a.email}>
            <button type="button" disabled={!!busy} onClick={async () => {
              setBusy(a.email);
              setError(undefined);
              const res = await apiSend("POST", "/dev/preview-session", { email: a.email });
              if (!res.ok) { setBusy(undefined); return setError(res.message); }
              router.push("/");
              router.refresh();
            }} className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm hover:border-navy disabled:opacity-60">
              <span className="min-w-0"><span className="block font-medium text-ink">{a.name}</span><span className="text-xs text-muted">{a.hint}</span></span>
              <span className="shrink-0 text-xs text-navy">{busy === a.email ? "Signing in…" : "Sign in"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </div>
  );
}
