import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const Card = ({ className, ...p }: ComponentProps<"section">) => (
  <section className={cn("rounded-lg border border-line bg-surface", className)} {...p} />
);

export function CardHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export const CardBody = ({ className, ...p }: ComponentProps<"div">) => <div className={cn("px-5 py-5 sm:px-6", className)} {...p} />;

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-brass">{eyebrow}</p>}
        <h1 className="font-serif text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">{description}</p>}
      </div>
      {action}
    </header>
  );
}

const badge = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-paper text-ink-soft ring-1 ring-line ring-inset",
      navy: "bg-navy/8 text-navy ring-1 ring-navy/15 ring-inset",
      brass: "bg-brass-soft text-brass ring-1 ring-brass/25 ring-inset",
      success: "bg-success-soft text-success",
      danger: "bg-danger-soft text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export const Badge = ({ className, tone, ...p }: ComponentProps<"span"> & VariantProps<typeof badge>) => (
  <span className={cn(badge({ tone }), className)} {...p} />
);

const alert = cva("rounded-md border px-4 py-3 text-sm", {
  variants: {
    tone: {
      error: "border-danger/25 bg-danger-soft text-danger",
      success: "border-success/25 bg-success-soft text-success",
      info: "border-line bg-paper text-ink-soft",
    },
  },
  defaultVariants: { tone: "info" },
});
export const Alert = ({ className, tone, ...p }: ComponentProps<"div"> & VariantProps<typeof alert>) => (
  <div role={tone === "error" ? "alert" : "status"} className={cn(alert({ tone }), className)} {...p} />
);

export const Table = ({ className, ...p }: ComponentProps<"table">) => (
  <div className="overflow-x-auto"><table className={cn("w-full min-w-[560px] text-left text-sm", className)} {...p} /></div>
);
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cn("border-b border-line bg-paper/60 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted sm:px-6", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("border-b border-line px-5 py-3 align-middle sm:px-6 [tr:last-child_&]:border-b-0", className)} {...p} />
);

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
