import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { apiGet, type Me } from "@/lib/api";
import { ORG_TYPE_LABEL, ROLE_LABEL } from "@/lib/labels";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrganisationsPage() {
  const me = await apiGet<Me>("/me");
  const first = me.user.fullName.split(" ")[0];
  return (
    <>
      <PageHeader eyebrow="Organisations" title="Your organisations"
        description={`${first}, these are the firms, chambers or courts you belong to. Administrators manage their people here.`} />

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

    </>
  );
}
