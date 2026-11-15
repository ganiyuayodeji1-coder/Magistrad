"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";
import { CASE_CATEGORY_LABEL } from "@/lib/labels";

export function OpenCaseForm({ organisations }: { organisations: { id: string; name: string; type: string }[] }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(organisations[0]?.id ?? "");
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const isFirm = organisations.find((o) => o.id === orgId)?.type === "law_firm";

  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const s = (k: string) => String(fd.get(k) ?? "");
      setState({ busy: true });
      const res = await apiSend("POST", "/cases", {
        organisationId: orgId, title: s("title"), courtName: s("courtName"), category: s("category"),
        claimNumber: s("claimNumber") || null, actingFor: isFirm ? s("actingFor") : null,
        claimant: { name: s("claimantName"), type: s("claimantType") },
        defendant: { name: s("defendantName"), type: s("defendantType") },
      });
      if (!res.ok) return setState({ busy: false, error: res.message });
      router.push(`/cases/${(res.data as { id: string }).id}`);
      router.refresh();
    }}>
      <Card>
        <CardHeader title="The matter" />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Case title" htmlFor="title" hint="As it will appear on the case, e.g. Acme Widgets Ltd v Bloggs Builders Ltd">
            <Input id="title" name="title" required minLength={3} maxLength={300} />
          </Field></div>
          <Field label="Opening on behalf of" htmlFor="org">
            <Select id="org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          {isFirm && (
            <Field label="Your firm acts for" htmlFor="actingFor" hint="You join the case as that side's solicitor.">
              <Select id="actingFor" name="actingFor" defaultValue="claimant">
                <option value="claimant">The claimant</option>
                <option value="defendant">The defendant</option>
              </Select>
            </Field>
          )}
          <Field label="Court" htmlFor="courtName" hint="e.g. County Court at Central London">
            <Input id="courtName" name="courtName" required minLength={2} maxLength={200} />
          </Field>
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue="commercial">
              {Object.entries(CASE_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Court claim number" htmlFor="claimNumber" hint="Optional. Add it later once issued.">
            <Input id="claimNumber" name="claimNumber" maxLength={40} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="The parties" description="You can add more parties to your own side later." />
        <CardBody className="grid gap-5 sm:grid-cols-[1fr_180px]">
          <Field label="Claimant" htmlFor="claimantName"><Input id="claimantName" name="claimantName" required minLength={2} /></Field>
          <Field label="Claimant is" htmlFor="claimantType">
            <Select id="claimantType" name="claimantType" defaultValue="organisation"><option value="organisation">A company or organisation</option><option value="individual">An individual</option></Select>
          </Field>
          <Field label="Defendant" htmlFor="defendantName"><Input id="defendantName" name="defendantName" required minLength={2} /></Field>
          <Field label="Defendant is" htmlFor="defendantType">
            <Select id="defendantType" name="defendantType" defaultValue="organisation"><option value="organisation">A company or organisation</option><option value="individual">An individual</option></Select>
          </Field>
        </CardBody>
      </Card>

      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={state.busy || !orgId}>{state.busy ? "Opening…" : "Open the case"}</Button></div>
    </form>
  );
}
