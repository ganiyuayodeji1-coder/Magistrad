import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiGet, type Me } from "@/lib/api";
import { AccountStatusButton } from "@/components/app/account-status-button";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Accounts" };

interface Account { id: string; email: string; fullName: string; platformRole: string; status: "invited" | "active" | "suspended" }

export default async function AdminUsersPage() {
  const me = await apiGet<Me>("/me");
  if (!me.isSuperAdmin) notFound();
  const { users } = await apiGet<{ users: Account[] }>("/users");
  return (
    <>
      <PageHeader eyebrow="Platform" title="Accounts"
        description="Everyone with a Magistrad account. Suspending an account signs that person out everywhere at once. You cannot change your own account." />
      <Card>
        <CardHeader title={`${users.length} accounts`} />
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Platform role</Th><Th>Status</Th><Th className="text-right">Manage</Th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.fullName}</Td>
                <Td>{u.email}</Td>
                <Td>{u.platformRole === "super_admin" ? <Badge tone="brass">Super Administrator</Badge> : <span className="text-muted">—</span>}</Td>
                <Td><Badge tone={u.status === "active" ? "success" : u.status === "invited" ? "navy" : "danger"}>{u.status}</Badge></Td>
                <Td className="text-right">
                  {u.id !== me.user.id && u.status !== "invited"
                    ? <AccountStatusButton userId={u.id} name={u.fullName} status={u.status} />
                    : <span className="text-xs text-muted">—</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
