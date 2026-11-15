import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { loadCase } from "@/lib/case";
import { apiGet } from "@/lib/api";
import { CASE_CATEGORY_LABEL, CASE_STATUS_LABEL, roleInCase } from "@/lib/labels";
import { CaseDetailsForm, LinkCourtForm } from "@/components/case/case-settings";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Case home" };

interface TimelineEvent { id: number; at: string; summary: string; privateToSide: boolean; actor: string | null }
const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 text-ink">{children}</dd></div>;
}

export default async function CaseHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, { events }] = await Promise.all([
    loadCase(id),
    apiGet<{ events: TimelineEvent[] }>(`/cases/${id}/timeline`).catch(() => ({ events: [] as TimelineEvent[] })),
  ]);
  const courts = c.permissions.linkCourt && !c.court ? (await apiGet<{ courts: { id: string; name: string }[] }>("/courts")).courts : [];
  const isRegistry = c.me.role === "registry";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass">Home</p>
        <h1 className="mt-1 font-serif text-[28px] leading-tight text-ink sm:text-[32px]">{c.title}</h1>
        <p className="mt-2 text-ink-soft">You are on this case as <strong className="font-medium text-ink">{roleInCase(c.me.role, c.me.side)}</strong>.</p>
      </header>

      <Card>
        <CardHeader title="Case details" />
        <CardBody>
          <dl className="grid gap-5 sm:grid-cols-3">
            <Detail label="Magistrad reference"><span className="font-mono text-sm">{c.reference}</span></Detail>
            <Detail label="Court claim number">{c.claimNumber ?? <span className="text-muted">Not yet issued</span>}</Detail>
            <Detail label="Status">{CASE_STATUS_LABEL[c.status] ?? c.status}</Detail>
            <Detail label="Court">{c.courtName}</Detail>
            <Detail label="Category">{CASE_CATEGORY_LABEL[c.category] ?? c.category}</Detail>
            <Detail label="Court on Magistrad">{c.court ? c.court.name : <span className="text-muted">Not linked</span>}</Detail>
          </dl>
        </CardBody>
        {c.permissions.update && (
          <CardBody className="border-t border-line"><CaseDetailsForm caseId={c.id} claimNumber={c.claimNumber} status={c.status} /></CardBody>
        )}
        {c.permissions.linkCourt && !c.court && (
          <CardBody className="border-t border-line">
            <p className="mb-3 text-sm text-ink-soft">Linking the court lets its registry assign a judge. The registry sees that the case exists and who the judges and court staff are. It cannot see any documents or either side's team.</p>
            <LinkCourtForm caseId={c.id} courts={courts} />
          </CardBody>
        )}
      </Card>

      {!isRegistry && (
        <div className="grid gap-6 md:grid-cols-2">
          {(["claimant", "defendant"] as const).map((side) => (
            <Card key={side}>
              <CardHeader title={side === "claimant" ? "Claimant" : "Defendant"} description={c.me.side === side ? "Your side" : undefined} />
              <ul className="divide-y divide-line">
                {c.parties.filter((p) => p.side === side).map((p) => (
                  <li key={p.id} className="px-5 py-3 text-sm sm:px-6"><span className="font-medium">{p.name}</span> <span className="text-muted">· {p.type === "individual" ? "Individual" : "Organisation"}</span></li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {!isRegistry && (
        <Card>
          <CardHeader title="Recent activity" description="What has happened on this case, newest first. Entries marked private are visible only to your side." />
          {events.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ol className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm sm:px-6">
                  <time className="w-36 shrink-0 text-xs text-muted" dateTime={e.at}>{fmt.format(new Date(e.at))}</time>
                  <span className="min-w-0 flex-1 text-ink">{e.summary}{e.actor && <span className="text-muted"> · {e.actor}</span>}</span>
                  {e.privateToSide && <span className="inline-flex items-center gap-1 text-xs text-brass"><Lock className="size-3" aria-hidden />Private to your side</span>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
