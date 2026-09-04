"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScopeDepartment = { name: string; lineName: string | null };
export type ScopeFinished = { id: string; wipCode: string; name: string };

/**
 * Line, then the area inside it - the same pair the plan and the dashboard
 * use, so the question "which part of the plant" is asked the same way on
 * every page.
 *
 * Recipes belong to every line at once, so unlike Planning there is an "All"
 * on the line side. Changing line clears the area: the departments are the
 * other line's.
 */
export function RecipeScope({
  lines,
  currentLine,
  departments,
  currentArea,
  finished = [],
  currentTree = null,
}: {
  lines: string[];
  /** Null means every line. */
  currentLine: string | null;
  departments: ScopeDepartment[];
  currentArea: string;
  /** Finished products that can be opened as a tree. */
  finished?: ScopeFinished[];
  /** The finished product whose family is being shown, or null. */
  currentTree?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(mutate: (search: URLSearchParams) => void) {
    const search = new URLSearchParams(params.toString());
    mutate(search);
    const query = search.toString();
    router.push(query ? `/recipes?${query}` : "/recipes");
  }

  function goLine(name: string | null) {
    push((search) => {
      if (name) search.set("line", name);
      else search.delete("line");
      search.delete("dept");
    });
  }

  function goArea(next: string) {
    push((search) => {
      if (next === "__all__") search.delete("dept");
      else search.set("dept", next);
    });
  }

  /** A tree is a different question from an area, so it clears the area. */
  function goTree(next: string) {
    push((search) => {
      if (next) {
        search.set("tree", next);
        search.delete("dept");
      } else search.delete("tree");
    });
  }

  const areas = departments
    .filter((entry) => !currentLine || entry.lineName === currentLine)
    // "Finished products" below already is this department.
    .filter((entry) => !/finished/i.test(entry.name));

  return (
    <span className="flex items-center gap-1.5">
      <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
        {[null, ...lines].map((name) => (
          <button
            key={name ?? "__all__"}
            type="button"
            onClick={() => goLine(name)}
            aria-pressed={name === currentLine}
            className={cn(
              "h-7 px-2 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
              name === currentLine
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {name ?? "All lines"}
          </button>
        ))}
      </span>

      <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />

      <select
        value={currentArea}
        onChange={(event) => goArea(event.target.value)}
        aria-label="Area"
        className="h-7 max-w-44 rounded-sm bg-card px-1.5 text-xs font-semibold ring-1 ring-foreground/15 focus:ring-1 focus:ring-primary focus:outline-none"
      >
        <option value="__all__">All departments</option>
        <option value="__finished__">Finished products</option>
        {areas.map((entry) => (
          <option key={entry.name} value={entry.name}>
            {entry.name}
          </option>
        ))}
      </select>

      {finished.length > 0 && (
        <>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
          {/*
            The family tree of one finished product: the bowl, what it is
            assembled from, what that is mixed from, down to the cuts. For
            fixing a recipe and seeing what else it touches.
          */}
          <select
            value={currentTree ?? ""}
            onChange={(event) => goTree(event.target.value)}
            aria-label="Tree"
            title="Show one finished product's whole family tree"
            className={cn(
              "h-7 max-w-56 rounded-sm px-1.5 text-xs font-semibold ring-1 focus:ring-1 focus:ring-primary focus:outline-none",
              currentTree
                ? "bg-foreground text-background ring-foreground"
                : "bg-card ring-foreground/15"
            )}
          >
            <option value="">Tree…</option>
            {finished.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.wipCode} · {entry.name}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  );
}
