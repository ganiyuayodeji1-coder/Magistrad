import { loadCase } from "@/lib/case";
import { CASE_STATUS_LABEL, roleInCase } from "@/lib/labels";
import { CaseNav } from "@/components/case/case-nav";
import { Badge } from "@/components/ui/surface";

export default async function CaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await loadCase(id);
  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-6 lg:mb-0">
        <div className="mb-4 lg:mb-6">
          <p className="font-mono text-xs text-muted">{c.reference}</p>
          <p className="mt-0.5 font-serif text-lg leading-snug text-ink">{c.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brass" data-testid="my-case-role">{roleInCase(c.me.role, c.me.side)}</Badge>
            <Badge>{CASE_STATUS_LABEL[c.status] ?? c.status}</Badge>
          </div>
        </div>
        <CaseNav caseId={c.id} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
