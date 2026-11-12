import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet, type Me } from "@/lib/api";
import { ORG_TYPE_LABEL } from "@/lib/labels";
import { CreateOrganisationForm } from "@/components/app/create-org-form";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Organisations" };

export default async function AdminOrganisationsPage() {
  const me = await apiGet<Me>("/me");
  if (!me.isSuperAdmin) notFound();
  const { organisations } = await apiGet<{ organisations: { id: string; name: string; type: string; status: string; regulatorId: string | null }[] }>("/organisations");
  return (
    <>
      <PageHeader eyebrow="Platform" title="Organisations" description="Firms, chambers, courts and tribunals on the platform. Their own administrators manage their people." />
      <Card className="mb-6"><CardHeader title="Create an organisation" /><CardBody><CreateOrganisationForm /></CardBody></Card>
      <Card>
        <CardHeader title={`All organisations (${organisations.length})`} />
        {organisations.length === 0 ? <EmptyState title="No organisations yet" /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Type</Th><Th>Regulator number</Th><Th>Status</Th></tr></thead>
            <tbody>
              {organisations.map((o) => (
                <tr key={o.id}>
                  <Td><Link className="font-medium text-navy hover:underline" href={`/organisations/${o.id}`}>{o.name}</Link></Td>
                  <Td>{ORG_TYPE_LABEL[o.type] ?? o.type}</Td>
                  <Td className="text-muted">{o.regulatorId ?? "—"}</Td>
                  <Td><Badge tone={o.status === "active" ? "success" : "danger"}>{o.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
