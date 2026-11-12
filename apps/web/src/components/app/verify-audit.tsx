"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";

export function VerifyAudit() {
  const [state, setState] = useState<{ busy: boolean; result?: { intact: boolean; checked: number; firstBrokenSeq: number | null }; error?: string }>({ busy: false });
  return (
    <div className="space-y-3">
      <Button variant="secondary" disabled={state.busy} onClick={async () => {
        setState({ busy: true });
        const res = await fetch("/api/audit/verify", { credentials: "same-origin" });
        const data = await res.json();
        setState(res.ok ? { busy: false, result: data } : { busy: false, error: data.message ?? "Verification failed to run." });
      }}>{state.busy ? "Checking every entry…" : "Verify the whole chain"}</Button>
      {state.result && (state.result.intact
        ? <Alert tone="success">Intact. All {state.result.checked.toLocaleString("en-GB")} entries match their fingerprints and are in unbroken order.</Alert>
        : <Alert tone="error">Broken at entry #{state.result.firstBrokenSeq}. The log has been altered from that point. Treat this as a security incident.</Alert>)}
      {state.error && <Alert tone="error">{state.error}</Alert>}
    </div>
  );
}
