"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import type { RecipeChangeWithRecipe } from "@/lib/recipes/change-log";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { SearchPanel } from "@/components/ui/search-panel";

/**
 * Every recipe change in one place, newest first.
 *
 * The per-recipe History tab answers "what happened to this one". This
 * answers "what has been happening at all" - which is the question you have
 * when you do not yet know which recipe went wrong.
 */
export function RecipeChangesLog({
  changes,
}: {
  changes: RecipeChangeWithRecipe[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return changes;
    return changes.filter((change) =>
      `${change.wipCode ?? ""} ${change.recipeName ?? ""} ${
        change.changedByName ?? ""
      } ${change.summary}`
        .toLowerCase()
        .includes(query)
    );
  }, [changes, search]);

  return (
    <div className="flex min-h-full flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchPanel
          query={search}
          onQueryChange={setSearch}
          placeholder="Find a recipe, a person, a change…"
          aria-label="Search recipe changes"
          filters={[]}
          onFiltersChange={() => {}}
          className="sm:max-w-xl"
        />
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {filtered.length} / {changes.length}
        </span>
      </div>

      <DataTable>
        <THead
          columns={[
            { label: "When", className: "w-44" },
            { label: "Recipe" },
            { label: "Who", className: "w-44" },
            { label: "What changed" },
          ]}
        />
        <TBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={4}>
              {changes.length === 0
                ? "No recipe changes recorded yet. Saves from here on will be listed."
                : "No changes match that search."}
            </TableEmpty>
          ) : (
            filtered.map((change) => (
              <TR key={change.id}>
                <TD muted>{formatWhen(change.changedAt)}</TD>
                <TD>
                  {change.recipeId ? (
                    <Link
                      href={`/recipes/${change.recipeId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {change.wipCode ?? "—"}
                      </span>{" "}
                      {change.recipeName ?? "Unknown recipe"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Deleted recipe</span>
                  )}
                </TD>
                <TD>{change.changedByName ?? "Unknown"}</TD>
                <TD muted>{change.summary}</TD>
              </TR>
            ))
          )}
        </TBody>
      </DataTable>
    </div>
  );
}

function formatWhen(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy h:mm a");
  } catch {
    return value;
  }
}
