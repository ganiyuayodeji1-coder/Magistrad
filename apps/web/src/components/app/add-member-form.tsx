"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { apiSend } from "@/lib/client";

export function AddMemberForm({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string; done?: string }>({ busy: false });
  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setState({ busy: true });
      const res = await apiSend("POST", `/organisations/${organisationId}/members`, {
        fullName: fd.get("fullName"), email: fd.get("email"), role: fd.get("role"),
      });
      if (!res.ok) return setState({ busy: false, error: res.message });
      const invited = (res.data as { invited: boolean }).invited;
      form.reset();
      setState({ busy: false, done: invited ? "Invitation recorded. They can sign in with that email." : "Existing account added." });
      router.refresh();
    }}>
      <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" required minLength={2} autoComplete="off" /></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="off" /></Field>
      <Field label="Role" htmlFor="role">
        <Select id="role" name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="org_admin">Administrator</option>
        </Select>
      </Field>
      <Button type="submit" disabled={state.busy}>{state.busy ? "Adding…" : "Add person"}</Button>
      {state.error && <Alert tone="error" className="sm:col-span-4">{state.error}</Alert>}
      {state.done && <Alert tone="success" className="sm:col-span-4">{state.done}</Alert>}
    </form>
  );
}
