import { Hint } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The summary card every page opens with, and the big numbers in it.
 *
 * One implementation, so a number on the picking sheet is drawn the same way
 * as a number on the HR dashboard: large and bold, a small label beside it,
 * a "?" where the label needs a sentence. Blue for what is planned, green for
 * what is right, amber for what needs a look, grey for the rest.
 */
export function SummaryCard({
  children,
  actions,
  className,
}: {
  children: React.ReactNode;
  /** Buttons at the right end: Print, the gear, New. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
      {actions && <span className="ml-auto flex items-center gap-2 print:hidden">{actions}</span>}
    </div>
  );
}

export type BigTone = "blue" | "green" | "amber" | "muted";

export function Big({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: BigTone;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "blue" && "text-primary",
          tone === "green" && "text-success",
          tone === "amber" && "text-warning-foreground",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value === "" ? "0" : value}
      </span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </span>
  );
}

/** The thin vertical rule between groups of toolbar controls. */
export function Hairline() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

/** One toolbar row: h-7 controls, wrapping, the same gap everywhere. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 print:hidden", className)}>{children}</div>
  );
}

/**
 * A segmented control: the Day | Range, Daily usage | Open order, line
 * buttons. One look for all of them.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: T; label: string; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <span role="group" aria-label={ariaLabel} className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.title}
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
            value === option.id
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/** The shared classes for the small controls in a toolbar. */
export const TOOLBAR = {
  step: "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-muted",
  date: "h-7 rounded-sm border border-border bg-card px-1.5 text-xs tabular-nums focus:ring-1 focus:ring-primary focus:outline-none",
  select:
    "h-7 rounded-sm bg-card px-1.5 text-xs font-semibold ring-1 ring-foreground/15 focus:ring-1 focus:ring-primary focus:outline-none",
  button:
    "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  quiet: "bg-card text-muted-foreground ring-1 ring-foreground/15 hover:bg-muted",
  active: "bg-foreground text-background",
  th: "border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase",
  td: "border-b border-border/60 px-2 py-1 text-[0.8125rem]",
  groupRow: "border-y border-primary/15 bg-brand-muted/40",
  totals: "border-t-2 border-t-success/40 bg-success/10",
} as const;
