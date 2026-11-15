"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface SwitcherCase { id: string; reference: string; title: string }

/** The case switcher from the sketch: a dropdown of only the cases you have access to. */
export function CaseSwitcher({ cases, canOpen }: { cases: SwitcherCase[]; canOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const currentId = usePathname().match(/^\/cases\/([0-9a-f-]{36})/)?.[1];
  const ref = useRef<HTMLDivElement>(null);
  const current = cases.find((c) => c.id === currentId);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full min-w-0 max-w-[420px] items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm hover:bg-paper">
        <span className="min-w-0 flex-1 truncate">
          {current ? <><span className="font-mono text-xs text-muted">{current.reference}</span> <span className="font-medium">{current.title}</span></> : <span className="text-ink-soft">Choose a case…</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Your cases" className="absolute left-0 top-12 z-30 w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-lg shadow-ink/5">
          <p className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">Cases you have access to</p>
          <ul className="max-h-80 overflow-y-auto py-1">
            {cases.length === 0 && <li className="px-4 py-3 text-sm text-muted">You are not on any cases yet.</li>}
            {cases.map((c) => (
              <li key={c.id}>
                <Link role="menuitem" href={`/cases/${c.id}`} onClick={() => setOpen(false)}
                  className={cn("flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper", c.id === currentId && "bg-paper")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{c.title}</span>
                    <span className="font-mono text-xs text-muted">{c.reference}</span>
                  </span>
                  {c.id === currentId && <Check className="size-4 text-navy" aria-hidden />}
                </Link>
              </li>
            ))}
          </ul>
          {canOpen && (
            <Link role="menuitem" href="/cases/new" onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm font-medium text-navy hover:bg-paper">
              <Plus className="size-4" aria-hidden /> Open a new case
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
