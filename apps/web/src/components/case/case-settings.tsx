"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";
import { CASE_STATUS_LABEL } from "@/lib/labels";

export function CaseDetailsForm({ caseId, claimNumber, status }: { caseId: string; claimNumber: string | null; status: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string; saved?: boolean }>({ busy: false });
  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const nextClaim = String(fd.get("claimNumber") ?? "").trim();
      const nextStatus = String(fd.get("status"));
      const body: Record<string, unknown> = {};
      if (nextClaim !== (claimNumber ?? "")) body.claimNumber = nextClaim || null;
      if (nextStatus !== status) body.status = nextStatus;
      if (Object.keys(body).length === 0) return setState({ busy: false, error: "Nothing has changed." });
      setState({ busy: true });
      const res = await apiSend("PATCH", `/cases/${caseId}`, body);
      if (!res.ok) return setState({ busy: false, error: res.message });
      setState({ busy: false, saved: true });
      router.refresh();
    }}>
      <Field label="Court claim number" htmlFor="claimNumber"><Input id="claimNumber" name="claimNumber" defaultValue={claimNumber ?? ""} maxLength={40} /></Field>
      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" defaultValue={status}>
          {Object.entries(CASE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" disabled={state.busy}>{state.busy ? "Saving…" : "Save"}</Button>
      {state.error && <Alert tone="error" className="sm:col-span-3">{state.error}</Alert>}
      {state.saved && <Alert tone="success" className="sm:col-span-3">Saved. Both sides can see this change in the activity list.</Alert>}
    </form>
  );
}

export function LinkCourtForm({ caseId, courts }: { caseId: string; courts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  if (courts.length === 0) return <p className="text-sm text-muted">No courts are on Magistrad yet, so this case can't be linked to one.</p>;
  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      const courtOrganisationId = String(new FormData(e.currentTarget).get("court"));
      if (!window.confirm("Link this case to that court? Its registry will then be able to see the case exists and assign a judge. Only the court can change this afterwards.")) return;
      setState({ busy: true });
      const res = await apiSend("PATCH", `/cases/${caseId}`, { courtOrganisationId });
      if (!res.ok) return setState({ busy: false, error: res.message });
      setState({ busy: false });
      router.refresh();
    }}>
      <Field label="Court on Magistrad" htmlFor="court">
        <Select id="court" name="court">{courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </Field>
      <Button type="submit" variant="secondary" disabled={state.busy}>Link court</Button>
      {state.error && <Alert tone="error" className="sm:col-span-2">{state.error}</Alert>}
    </form>
  );
}
