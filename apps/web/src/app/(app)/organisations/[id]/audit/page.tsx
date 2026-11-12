import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api";
import { AuditTable, type AuditEvent } from "@/components/app/audit-table";
import { Card, CardHeader, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Activity log" };

export default async function OrganisationAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let org: { name: string }, events: AuditEvent[];
  try {
    [org, { events }] = await Promise.all([
      apiGet<{ name: string }>(`/organisations/${id}`),
      apiGet<{ events: AuditEvent[] }>(`/audit?organisationId=${id}&limit=100`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  return (
    <>
      <PageHeader eyebrow={org.name} title="Activity log"
        description={<>Every change to this organisation, newest first. <Link className="text-navy underline underline-offset-4" href={`/organisations/${id}`}>Back to people</Link></>} />
      <Card><CardHeader title="Recorded events" description="Entries cannot be edited or deleted." /><AuditTable events={events} /></Card>
    </>
  );
}
