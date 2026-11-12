import { cn } from "@/lib/cn";

/** Wordmark: a serif name with a small seal device. Pure SVG + text, no external assets. */
export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-brass" />
        <path d="M12 5.5v13M7 9h10M8.5 9l-2.2 5h4.4zM15.5 9l-2.2 5h4.4zM9 18.5h6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className={light ? "text-white" : "text-navy"} />
      </svg>
      <span className={cn("font-serif text-[19px] tracking-tight", light ? "text-white" : "text-navy")}>Magistrad</span>
    </span>
  );
}
