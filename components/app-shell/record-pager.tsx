import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Odoo's record pager: "12 / 199" with an arrow either side.
 *
 * Stepping to the next record without going back to the list is the difference
 * between reviewing 199 recipes and giving up after ten. Position is 1-based
 * because it is read by people, not indexed by code.
 */
export function RecordPager({
  index,
  total,
  prevHref,
  nextHref,
  label = "record",
}: {
  /** Zero-based position of the current record. */
  index: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
  label?: string;
}) {
  if (total <= 1) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      <PagerButton
        href={prevHref}
        label={`Previous ${label}`}
        icon={<ChevronLeft className="size-4" />}
      />
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        <b className="text-foreground">{index + 1}</b> / {total}
      </span>
      <PagerButton
        href={nextHref}
        label={`Next ${label}`}
        icon={<ChevronRight className="size-4" />}
      />
    </span>
  );
}

function PagerButton({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
}) {
  const base =
    "inline-flex size-7 items-center justify-center rounded-md border border-border transition-colors";

  // At either end the arrow stays in place but stops being a link, so the
  // control does not shift width as you page through.
  if (!href) {
    return (
      <span
        aria-hidden
        className={cn(base, "cursor-not-allowed bg-muted/50 text-muted-foreground/40")}
      >
        {icon}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        base,
        "bg-card text-muted-foreground hover:bg-accent hover:text-primary"
      )}
    >
      {icon}
    </Link>
  );
}
