import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { apiGet, type CaseSummary, type Me } from "@/lib/api";
import { canOpenCases, CASE_STATUS_LABEL, roleInCase } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "My cases" };

export default async function MyCasesPage() {
  const [me, { cases }] = await Promise.all([apiGet<Me>("/me"), apiGet<{ cases: CaseSummary[] }>("/cases")]);
  const first = me.user.fullName.split(" ")[0];
  return (
    <>
      <PageHeader eyebrow="My cases" title={`Welcome, ${first}`}
        description="Every case you are on. You see only what your role in each case allows."
        action={canOpenCases(me) ? <Button asChild><Link href="/cases/new"><Plus className="size-4" aria-hidden />Open a case</Link></Button> : undefined} />
      <Card>
        <CardHeader title={`Cases (${cases.length})`} />
        {cases.length === 0 ? (
          <EmptyState title="You are not on any cases yet">
            {canOpenCases(me) ? "Open a case for your client, or wait to be invited to one." : "You will see cases here once someone adds you to one."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${c.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-paper/60 sm:px-6">
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="block truncate font-medium text-ink">{c.title}</span>
                    <span className="text-sm text-muted"><span className="font-mono text-xs">{c.reference}</span>{c.claimNumber && <> · Claim {c.claimNumber}</>} · {c.courtName}</span>
                  </span>
                  <Badge tone="brass">{roleInCase(c.role, c.side)}</Badge>
                  <Badge>{CASE_STATUS_LABEL[c.status] ?? c.status}</Badge>
                  <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface px-5 py-4 text-sm text-ink-soft sm:px-6">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p>You signed in with two-step verification. Your session ends after 30 minutes of inactivity or 12 hours in total.</p>
      </div>
    </>
  );
}
