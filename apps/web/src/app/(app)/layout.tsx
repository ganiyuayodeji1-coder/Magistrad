import Link from "next/link";
import { apiGet, type Me } from "@/lib/api";
import { Nav } from "@/components/app/nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { Wordmark } from "@/components/wordmark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await apiGet<Me>("/me");
  const items = [{ href: "/", label: "Overview" }];
  if (me.isSuperAdmin) {
    items.push({ href: "/admin/organisations", label: "Organisations" }, { href: "/admin/users", label: "Accounts" }, { href: "/admin/audit", label: "Audit log" });
  }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-8">
          <Link href="/" aria-label="Magistrad home"><Wordmark /></Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink" data-testid="current-user">{me.user.fullName}</p>
              <p className="text-xs text-muted">{me.isSuperAdmin ? "Super Administrator" : me.user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-8"><Nav items={items} /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
