"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickingPlace = { id: number; name: string };

/**
 * Line, then place - the same pair the plan and the recipes use.
 *
 * The line decides whose plan and whose orders are exploded; the place is
 * which Odoo company the materials are bought under, Yaya's for the bowls.
 * Both live in the URL so a link carries what somebody was looking at.
 */
export function PickingScope({
  lines,
  currentLine,
  places,
  currentPlace,
  basePath = "/production/picking",
  allLinesLabel = "All lines",
}: {
  lines: string[];
  currentLine: string | null;
  places: PickingPlace[];
  currentPlace: number | null;
  /** Which page the buttons rewrite the URL of. */
  basePath?: string;
  /** The "every line" button's label; null leaves it out for pages that need one line. */
  allLinesLabel?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(mutate: (search: URLSearchParams) => void) {
    const search = new URLSearchParams(params.toString());
    mutate(search);
    const query = search.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
        {[...(allLinesLabel === null ? [] : [null]), ...lines].map((name) => (
          <button
            key={name ?? "__all__"}
            type="button"
            onClick={() =>
              push((search) => {
                if (name) search.set("line", name);
                else search.delete("line");
              })
            }
            aria-pressed={name === currentLine}
            className={cn(
              "h-7 px-2 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
              name === currentLine
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {name ?? allLinesLabel}
          </button>
        ))}
      </span>

      {places.length > 0 && (
      <>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />

      <select
        value={currentPlace === null ? "" : String(currentPlace)}
        onChange={(event) =>
          push((search) => {
            if (event.target.value) search.set("place", event.target.value);
            else search.delete("place");
          })
        }
        aria-label="Place"
        title="Which Odoo company the materials are bought under"
        className="h-7 max-w-44 rounded-sm bg-card px-1.5 text-xs font-semibold ring-1 ring-foreground/15 focus:ring-1 focus:ring-primary focus:outline-none"
      >
        <option value="">All places</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </select>
      </>
      )}
    </span>
  );
}
