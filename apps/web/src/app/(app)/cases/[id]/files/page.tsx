import type { Metadata } from "next";
import { FileLock2, Gavel, Landmark, Share2 } from "lucide-react";
import { loadCase } from "@/lib/case";
import { Alert, Card } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Files" };

/**
 * The Files section from the sketch. It lists only the spaces the server says this
 * person may open; another side's private folder is never sent to the browser at all.
 */
export default async function FilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await loadCase(id);
  const has = (kind: string) => c.spaces.some((s) => s.kind === kind);
  const own = c.spaces.find((s) => s.kind === "side_private");
  const sideName = own?.side === "claimant" ? "Claimant" : "Defendant";

  const folders = [
    own && { key: "private", icon: FileLock2, title: `${sideName} — private workspace`, who: `Only the ${sideName.toLowerCase()}'s team: the party, their solicitors and counsel. Never the other side or the court.`, tone: "brass" as const },
    has("shared") && { key: "shared", icon: Share2, title: "Shared documents", who: "Documents served on the other side. Everyone on the case can see these, including the judge." },
    has("court_record") && { key: "filings", icon: Landmark, title: "Court filings", who: "Documents filed with the court. A copy of the court record (the official record is held by HMCTS until a court adopts Magistrad)." },
    has("court_record") && { key: "orders", icon: Gavel, title: "Orders and judgments", who: "Orders and judgments made by the court in this case." },
  ].filter(Boolean) as { key: string; icon: typeof FileLock2; title: string; who: string; tone?: "brass" }[];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass">Files</p>
        <h1 className="mt-1 font-serif text-[28px] text-ink sm:text-[32px]">Files</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">Each area is kept separate by the database itself, not just hidden on screen.</p>
      </header>

      {folders.length === 0 ? (
        <Alert>Your role does not include access to any document areas yet. Your solicitor can share specific folders with you once document sharing arrives.</Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {folders.map((f) => (
            <Card key={f.key} data-testid={`folder-${f.key}`} className={f.tone === "brass" ? "border-brass/40" : undefined}>
              <div className="flex gap-4 px-5 py-5 sm:px-6">
                <span className={f.tone === "brass" ? "grid size-10 shrink-0 place-items-center rounded-md bg-brass-soft text-brass" : "grid size-10 shrink-0 place-items-center rounded-md bg-navy/6 text-navy"}>
                  <f.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="font-medium text-ink">{f.title}</h2>
                  <p className="mt-1 text-sm text-ink-soft">{f.who}</p>
                  <p className="mt-3 text-xs text-muted">No documents yet.</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-sm text-muted">Uploading, versions and integrity checks for documents are the next phase of work.</p>
    </div>
  );
}
