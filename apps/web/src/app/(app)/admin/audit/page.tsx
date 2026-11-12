import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiGet, type Me } from "@/lib/api";
import { AuditTable, type AuditEvent } from "@/components/app/audit-table";
import { VerifyAudit } from "@/components/app/verify-audit";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  const me = await apiGet<Me>("/me");
  if (!me.isSuperAdmin) notFound();
  const { events } = await apiGet<{ events: AuditEvent[] }>("/audit?limit=100");
  return (
    <>
      <PageHeader eyebrow="Platform" title="Audit log"
        description="Every sign-in, change and refused attempt. Each entry includes the fingerprint of the one before it, so any alteration breaks the chain." />
      <Card className="mb-6">
        <CardHeader title="Integrity check" description="Recalculates every fingerprint from the first entry to the latest." />
        <CardBody><VerifyAudit /></CardBody>
      </Card>
      <Card><CardHeader title="Latest 100 events" /><AuditTable events={events} /></Card>
    </>
  );
}
