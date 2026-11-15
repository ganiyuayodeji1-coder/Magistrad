import Link from "next/link";
import { apiGet, type CaseSummary, type Me } from "@/lib/api";
import { CaseSwitcher } from "@/components/case/case-switcher";
import { canOpenCases } from "@/lib/labels";
import { Nav } from "@/components/app/nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { Wordmark } from "@/components/wordmark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, { cases }] = await Promise.all([apiGet<Me>("/me"), apiGet<{ cases: CaseSummary[] }>("/cases")]);
  const canOpen = canOpenCases(me);
  const items = [{ href: "/", label: "My cases" }, { href: "/organisations", label: "My organisations" }];
  if (me.isSuperAdmin) {
    items.push({ href: "/admin/organisations", label: "All organisations" }, { href: "/admin/users", label: "Accounts" }, { href: "/admin/audit", label: "Audit log" });
  }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-8">
          <Link href="/" aria-label="Magistrad home" className="shrink-0"><Wordmark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" /></Link>
          <div className="min-w-0 flex-1 sm:max-w-[420px]"><CaseSwitcher cases={cases.map(({ id, reference, title }) => ({ id, reference, title }))} canOpen={canOpen} /></div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink" data-testid="current-user">{me.user.fullName}</p>
              <p className="text-xs text-muted">{me.isSuperAdmin ? "Super Administrator" : me.user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-8"><Nav items={items} /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
