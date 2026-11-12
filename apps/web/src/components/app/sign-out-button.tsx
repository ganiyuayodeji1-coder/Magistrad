"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      await apiSend("POST", "/auth/logout");
      router.replace("/signed-out");
    }}>
      <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
