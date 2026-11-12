import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { apiGet, type Me } from "@/lib/api";
import { ORG_TYPE_LABEL, ROLE_LABEL } from "@/lib/labels";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const me = await apiGet<Me>("/me");
  const first = me.user.fullName.split(" ")[0];
  return (
    <>
      <PageHeader eyebrow="Overview" title={`Welcome, ${first}`}
        description="Your organisations and what you can manage in them." />

      <Card>
        <CardHeader title="Your organisations" description="Firms, chambers or courts that have given you access." />
        {me.organisations.length === 0 ? (
          <EmptyState title="You are not a member of any organisation yet">
            {me.isSuperAdmin ? "As Super Administrator you manage organisations and accounts, but you are not a member of any of them." : "An administrator needs to add you."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {me.organisations.map((o) => (
              <li key={o.id}>
                <Link href={`/organisations/${o.id}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-paper/60 sm:px-6">
                  <span className="grid size-9 place-items-center rounded-md bg-navy/6 text-navy"><Building2 className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{o.name}</span>
                    <span className="text-sm text-muted">{ORG_TYPE_LABEL[o.type] ?? o.type}</span>
                  </span>
                  <Badge tone={o.role === "org_admin" ? "brass" : "neutral"}>{ROLE_LABEL[o.role]}</Badge>
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
