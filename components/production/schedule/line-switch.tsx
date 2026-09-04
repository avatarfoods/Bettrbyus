"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Which line's week you are planning.
 *
 * Not a filter. Each line has its own live plan and its own drafts, so
 * switching line changes which plan is on screen, what "confirm" would merge
 * into, and whose drafts you can see. Bettr Bowl and Pizza Cupcake are
 * separate operations that share a building; planning one says nothing about
 * the other.
 *
 * It sits with the page title rather than in the toolbar because it is the
 * biggest thing on the page - everything below it is about the line it names.
 */
export function LineSwitch({
  lines,
  current,
  areas,
  currentArea,
}: {
  lines: string[];
  current: string | null;
  /** Departments inside this line, so the pair reads line then area. */
  areas: string[];
  currentArea: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(name: string) {
    const search = new URLSearchParams(params.toString());
    search.set("line", name);
    // The plan is a different plan now, so which draft was on screen and
    // whether it was open for typing do not carry across.
    search.delete("view");
    search.delete("edit");
    // The areas are the other line's departments; this one has its own.
    search.delete("dept");
    router.push(`/production/schedule?${search}`);
  }

  /** The area narrows the rows; the line changes the plan. */
  function goArea(next: string) {
    const search = new URLSearchParams(params.toString());
    search.set("dept", next);
    router.push(`/production/schedule?${search}`);
  }

  return (
    <span className="flex items-center gap-1.5">
      {lines.length > 1 && (
        <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
          {lines.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => go(name)}
              aria-pressed={name === current}
              className={cn(
                "h-7 px-2 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                name === current
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {name}
            </button>
          ))}
        </span>
      )}

      <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />

      {/* Line, then the area inside it - the same pairing the dashboard uses,
          because it is the same question asked of a different page. */}
      <select
        value={currentArea}
        onChange={(event) => goArea(event.target.value)}
        aria-label="Area"
        className="h-7 max-w-40 rounded-sm bg-card px-1.5 text-xs font-semibold ring-1 ring-foreground/15 focus:ring-1 focus:ring-primary focus:outline-none"
      >
        <option value="__finished__">Finished products</option>
        <option value="__all__">All areas</option>
        {areas.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </span>
  );
}
