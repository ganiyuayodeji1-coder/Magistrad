"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={cn("shrink-0 border-b-2 px-3 py-3 text-sm transition-colors",
              active ? "border-brass font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink")}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
