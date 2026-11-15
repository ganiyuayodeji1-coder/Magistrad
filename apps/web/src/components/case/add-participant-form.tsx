"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";
import { roleInCase, type CaseRole, type Side } from "@/lib/labels";

export interface AddOption { role: CaseRole; side: Side | null; hint: string }

export function AddParticipantForm({ caseId, options }: { caseId: string; options: AddOption[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState(0);
  const [state, setState] = useState<{ busy: boolean; error?: string; done?: string }>({ busy: false });
  // The available choices change after someone is added (e.g. the other side becomes staffed),
  // so never point past the end of the list.
  const index = choice < options.length ? choice : 0;
  const option = options[index]!;
  const labels = useMemo(() => options.map((o) => roleInCase(o.role, o.side)), [options]);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setState({ busy: true });
      const res = await apiSend("POST", `/cases/${caseId}/participants`, {
        email: fd.get("email"), fullName: fd.get("fullName"), role: option.role, side: option.side,
      });
      if (!res.ok) return setState({ busy: false, error: res.message });
      form.reset();
      setState({ busy: false, done: (res.data as { invited: boolean }).invited ? "Added. They have been invited and can sign in with that email." : "Added." });
      router.refresh();
    }}>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr_1fr]">
        <Field label="Adding as" htmlFor="as">
          <Select id="as" value={index} onChange={(e) => setChoice(Number(e.target.value))}>
            {labels.map((l, i) => <option key={l} value={i}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Full name" htmlFor="p-name"><Input id="p-name" name="fullName" required minLength={2} autoComplete="off" /></Field>
        <Field label="Email" htmlFor="p-email"><Input id="p-email" name="email" type="email" required autoComplete="off" /></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{option.hint}</p>
        <Button type="submit" disabled={state.busy}>{state.busy ? "Adding…" : "Add to case"}</Button>
      </div>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.done && <Alert tone="success">{state.done}</Alert>}
    </form>
  );
}

export function RemoveParticipantButton({ caseId, userId, name }: { caseId: string; userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      <Button size="sm" variant="danger" disabled={busy} onClick={async () => {
        if (!window.confirm(`Remove ${name} from this case? They lose access immediately.`)) return;
        setBusy(true);
        const res = await apiSend("PATCH", `/cases/${caseId}/participants/${userId}`, { status: "removed" });
        setBusy(false);
        if (!res.ok) setError(res.message);
        else router.refresh();
      }}>Remove</Button>
    </span>
  );
}
