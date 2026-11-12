import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet, type Me } from "@/lib/api";
import { ORG_TYPE_LABEL, ROLE_LABEL } from "@/lib/labels";
import { AddMemberForm } from "@/components/app/add-member-form";
import { MemberActions } from "@/components/app/member-actions";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Organisation" };

interface Org { id: string; name: string; type: string; regulatorId: string | null }
interface Member { userId: string; email: string; fullName: string; accountStatus: string; role: "org_admin" | "member"; status: "active" | "removed" }

export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await apiGet<Me>("/me");
  let org: Org, members: Member[];
  try {
    [org, { members }] = await Promise.all([apiGet<Org>(`/organisations/${id}`), apiGet<{ members: Member[] }>(`/organisations/${id}/members`)]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const myRole = me.organisations.find((o) => o.id === id)?.role;
  const canManage = me.isSuperAdmin || myRole === "org_admin";
  const active = members.filter((m) => m.status === "active");

  return (
    <>
      <PageHeader eyebrow={ORG_TYPE_LABEL[org.type] ?? org.type} title={org.name}
        description={org.regulatorId ? `Regulator number ${org.regulatorId}` : undefined}
        action={canManage ? <Button asChild variant="secondary"><Link href={`/organisations/${id}/audit`}>Activity log</Link></Button> : undefined} />

      {canManage && (
        <Card className="mb-6">
          <CardHeader title="Add a person" description="If they don't have an account yet, they are invited and can sign in with this email. You cannot add yourself." />
          <CardBody><AddMemberForm organisationId={id} /></CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={`People (${active.length})`} description={canManage ? "Changes take effect immediately and are recorded." : "Only administrators can change membership."} />
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th>{canManage && <Th className="text-right">Manage</Th>}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className={m.status === "removed" ? "text-muted" : undefined}>
                <Td className="font-medium">{m.fullName}{m.userId === me.user.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</Td>
                <Td>{m.email}</Td>
                <Td><Badge tone={m.role === "org_admin" ? "brass" : "neutral"}>{ROLE_LABEL[m.role]}</Badge></Td>
                <Td>
                  {m.status === "removed" ? <Badge>Removed</Badge>
                    : m.accountStatus === "invited" ? <Badge tone="navy">Invited</Badge>
                    : m.accountStatus === "suspended" ? <Badge tone="danger">Suspended</Badge>
                    : <Badge tone="success">Active</Badge>}
                </Td>
                {canManage && (
                  <Td className="text-right">
                    {m.status === "active" && m.userId !== me.user.id
                      ? <MemberActions organisationId={id} userId={m.userId} name={m.fullName} role={m.role} />
                      : <span className="text-xs text-muted">—</span>}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
