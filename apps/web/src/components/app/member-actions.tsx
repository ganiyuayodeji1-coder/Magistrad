"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client";

/** Role change and removal for one membership. The API re-checks every request. */
export function MemberActions({ organisationId, userId, name, role }: { organisationId: string; userId: string; name: string; role: "org_admin" | "member" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async (body: object, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(undefined);
    const res = await apiSend("PATCH", `/organisations/${organisationId}/members/${userId}`, body);
    setBusy(false);
    if (!res.ok) setError(res.message);
    else router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      <Button size="sm" variant="secondary" disabled={busy}
        onClick={() => send({ role: role === "org_admin" ? "member" : "org_admin" })}>
        {role === "org_admin" ? "Make member" : "Make administrator"}
      </Button>
      <Button size="sm" variant="danger" disabled={busy}
        onClick={() => send({ status: "removed" }, `Remove ${name} from this organisation? They lose access immediately.`)}>
        Remove
      </Button>
    </div>
  );
}
