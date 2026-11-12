"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";

export function CreateOrganisationForm() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_180px_180px_auto] sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setState({ busy: true });
      const res = await apiSend("POST", "/organisations", {
        name: fd.get("name"), type: fd.get("type"), regulatorId: (fd.get("regulatorId") as string) || null,
      });
      if (!res.ok) return setState({ busy: false, error: res.message });
      router.push(`/organisations/${(res.data as { id: string }).id}`);
    }}>
      <Field label="Name" htmlFor="org-name"><Input id="org-name" name="name" required minLength={2} /></Field>
      <Field label="Type" htmlFor="org-type">
        <Select id="org-type" name="type" defaultValue="law_firm">
          <option value="law_firm">Law firm</option>
          <option value="chambers">Chambers</option>
          <option value="court">Court</option>
          <option value="tribunal">Tribunal</option>
        </Select>
      </Field>
      <Field label="Regulator number" htmlFor="org-reg" hint="Optional, e.g. SRA number"><Input id="org-reg" name="regulatorId" maxLength={64} /></Field>
      <Button type="submit" disabled={state.busy}>{state.busy ? "Creating…" : "Create"}</Button>
      {state.error && <Alert tone="error" className="sm:col-span-4">{state.error}</Alert>}
    </form>
  );
}
