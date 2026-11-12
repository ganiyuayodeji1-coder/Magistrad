import { Badge, EmptyState, Table, Td, Th } from "@/components/ui/surface";

export interface AuditEvent {
  seq: number;
  occurredAt: string;
  action: string;
  outcome: "success" | "denied" | "failure";
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  hash: string;
  actor: { name: string; email: string } | null;
}

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/London" });
const TONE = { success: "success", denied: "danger", failure: "danger" } as const;

export function AuditTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <EmptyState title="No audit events yet" />;
  return (
    <Table>
      <thead><tr><Th>#</Th><Th>When (UK time)</Th><Th>Who</Th><Th>Action</Th><Th>Outcome</Th><Th>Fingerprint</Th></tr></thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.seq}>
            <Td className="font-mono text-xs text-muted">{e.seq}</Td>
            <Td className="whitespace-nowrap">{fmt.format(new Date(e.occurredAt))}</Td>
            <Td>{e.actor ? <><span className="block">{e.actor.name}</span><span className="text-xs text-muted">{e.actor.email}</span></> : <span className="text-muted">—</span>}</Td>
            <Td>
              <code className="text-xs">{e.action}</code>
              {typeof e.metadata?.reason === "string" && <span className="block text-xs text-muted">{e.metadata.reason}</span>}
            </Td>
            <Td><Badge tone={TONE[e.outcome]}>{e.outcome}</Badge></Td>
            <Td><code className="font-mono text-xs text-muted" title={e.hash}>{e.hash.slice(0, 12)}…</code></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
