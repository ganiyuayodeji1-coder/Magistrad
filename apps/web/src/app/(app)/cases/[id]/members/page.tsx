import type { Metadata } from "next";
import { loadCase } from "@/lib/case";
import { apiGet, type Me } from "@/lib/api";
import { CASE_ROLE_LABEL, type CaseRole, type Side } from "@/lib/labels";
import { AddParticipantForm, RemoveParticipantButton, type AddOption } from "@/components/case/add-participant-form";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Members" };

interface Participant { userId: string; fullName: string; email: string; role: CaseRole; side: Side | null; status: "active" | "removed"; accountStatus: string; canRemove: boolean }

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, me, { participants }] = await Promise.all([
    loadCase(id), apiGet<Me>("/me"), apiGet<{ participants: Participant[] }>(`/cases/${id}/participants`),
  ]);

  // Offer only additions the server would accept; it re-checks every one regardless.
  const options: AddOption[] = [];
  const mySide = c.me.side;
  const active = participants.filter((p) => p.status === "active");
  if (c.permissions.manageOwnSide && mySide) {
    const own = mySide === "claimant" ? "claimant" : "defendant";
    options.push(
      { role: "solicitor", side: mySide, hint: `A colleague who will act for the ${own} with you.` },
      { role: "barrister", side: mySide, hint: `Counsel for the ${own}. The other side will not see them in this list.` },
      { role: "expert", side: mySide, hint: "Private to your side. Experts see no documents until you share specific folders with them." },
      { role: "party", side: mySide, hint: `Your client, or a contact at your client. They can see your side's private workspace.` },
      { role: "external", side: mySide, hint: "Someone helping your side, for example a costs draftsman. Sees nothing until you share folders." },
    );
    const other: Side = mySide === "claimant" ? "defendant" : "claimant";
    if (!active.some((p) => p.side === other)) {
      options.push(
        { role: "solicitor", side: other, hint: `Invite the ${other}'s solicitor. Once they join, only they can manage their side.` },
        { role: "party", side: other, hint: `If the ${other} is acting in person (no solicitor). Once they join, only they can manage their side.` },
      );
    }
  }
  if (c.permissions.manageCourtRoles) {
    options.push(
      { role: "judge", side: null, hint: "Must already be a member of the linked court on Magistrad." },
      { role: "court_staff", side: null, hint: "Must already be a member of the linked court on Magistrad." },
    );
  }

  const groups: { title: string; filter: (p: Participant) => boolean }[] = [
    { title: "Court", filter: (p) => p.side === null },
    { title: "Claimant", filter: (p) => p.side === "claimant" },
    { title: "Defendant", filter: (p) => p.side === "defendant" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass">Members</p>
        <h1 className="mt-1 font-serif text-[28px] text-ink sm:text-[32px]">Members</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">Everyone on this case. Each side's counsel, experts and helpers are visible only to that side and the court.</p>
      </header>

      {options.length > 0 && (
        <Card>
          <CardHeader title="Add someone to the case" description="People can never add themselves. Additions are recorded in the activity list and the audit log." />
          <CardBody><AddParticipantForm caseId={c.id} options={options} /></CardBody>
        </Card>
      )}

      {groups.map((g) => {
        const rows = participants.filter(g.filter);
        return (
          <Card key={g.title}>
            <CardHeader title={g.title} description={g.title !== "Court" && c.me.side === g.title.toLowerCase() ? "Your side" : undefined} />
            {rows.length === 0 ? <EmptyState title={g.title === "Court" ? "No judge or court staff assigned yet" : "Nobody visible to you on this side yet"} /> : (
              <Table>
                <thead><tr><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Status</Th><Th className="text-right">Manage</Th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.userId} className={p.status === "removed" ? "text-muted" : undefined}>
                      <Td className="font-medium">{p.fullName}{p.userId === me.user.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</Td>
                      <Td>{CASE_ROLE_LABEL[p.role]}</Td>
                      <Td>{p.email}</Td>
                      <Td>{p.status === "removed" ? <Badge>Removed</Badge> : p.accountStatus === "invited" ? <Badge tone="navy">Invited</Badge> : <Badge tone="success">Active</Badge>}</Td>
                      <Td className="text-right">{p.canRemove ? <RemoveParticipantButton caseId={c.id} userId={p.userId} name={p.fullName} /> : <span className="text-xs text-muted">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}
