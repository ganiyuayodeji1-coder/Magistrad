"use client";

import { FolderLock, Home, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** The left-hand sections from the sketch. Only sections that work are shown. */
export function CaseNav({ caseId }: { caseId: string }) {
  const path = usePathname();
  const base = `/cases/${caseId}`;
  const items = [
    { href: base, label: "Home", icon: Home, exact: true },
    { href: `${base}/files`, label: "Files", icon: FolderLock },
    { href: `${base}/members`, label: "Members", icon: Users },
  ];
  return (
    <nav aria-label="Case sections" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-navy text-white" : "text-ink-soft hover:bg-surface hover:text-ink")}>
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
