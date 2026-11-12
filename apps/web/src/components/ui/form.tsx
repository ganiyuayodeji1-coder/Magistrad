import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control = "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15";

export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cn(control, className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cn(control, "pr-8", className)} {...p} />;

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
