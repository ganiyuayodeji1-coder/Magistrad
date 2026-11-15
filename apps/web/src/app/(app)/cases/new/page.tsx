import type { Metadata } from "next";
import { apiGet, type Me } from "@/lib/api";
import { OpenCaseForm } from "@/components/case/open-case-form";
import { Alert, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Open a case" };

export default async function OpenCasePage() {
  const me = await apiGet<Me>("/me");
  const orgs = me.organisations.filter((o) => ["law_firm", "court", "tribunal"].includes(o.type));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="New case" title="Open a case"
        description="This creates the case workspace: a private area for each side, a shared area and the court record. You can then invite the other side and your team." />
      {orgs.length === 0
        ? <Alert>Only members of a law firm, court or tribunal can open cases.</Alert>
        : <OpenCaseForm organisations={orgs.map(({ id, name, type }) => ({ id, name, type }))} />}
    </div>
  );
}
