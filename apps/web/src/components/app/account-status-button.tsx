"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client";

export function AccountStatusButton({ userId, name, status }: { userId: string; name: string; status: "active" | "suspended" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const suspend = status === "active";
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      <Button size="sm" variant={suspend ? "danger" : "secondary"} disabled={busy} onClick={async () => {
        if (suspend && !window.confirm(`Suspend ${name}? They are signed out everywhere immediately.`)) return;
        setBusy(true);
        const res = await apiSend("POST", `/users/${userId}/${suspend ? "suspend" : "reinstate"}`);
        setBusy(false);
        if (!res.ok) setError(res.message);
        else router.refresh();
      }}>{suspend ? "Suspend" : "Reinstate"}</Button>
    </span>
  );
}
