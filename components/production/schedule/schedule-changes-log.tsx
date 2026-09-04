"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { ScheduleChange } from "@/lib/production/schedule/change-log";
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
 * Every confirm into the live plan, newest first.
 *
 * Drafts are not here on purpose: nothing runs off a draft, so a list that
 * included them would bury the handful of moments that actually changed what
 * the floor was told to make.
 */
export function ScheduleChangesLog({
  changes,
}: {
  changes: ScheduleChange[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return changes;
    return changes.filter((change) =>
      `${change.lineName ?? ""} ${change.changedByName ?? ""} ${change.summary}`
        .toLowerCase()
        .includes(query)
    );
  }, [changes, search]);

  const last = changes[0];

  return (
    <div className="flex min-h-full flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
      {last && (
        <p className="rounded-sm bg-card px-3 py-2 text-xs ring-1 ring-foreground/10">
          <span className="text-muted-foreground">Last changed:</span>{" "}
          <strong>{last.changedByName ?? "Unknown"}</strong>
          {last.lineName ? ` on ${last.lineName}` : ""} ·{" "}
          {formatWhen(last.changedAt)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchPanel
          query={search}
          onQueryChange={setSearch}
          placeholder="Find a line, a person, a change…"
          aria-label="Search plan changes"
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
            { label: "Line", className: "w-40" },
            { label: "Who", className: "w-44" },
            { label: "What changed" },
          ]}
        />
        <TBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={4}>
              {changes.length === 0
                ? "No confirms recorded yet. Every confirm into the live plan from here on will be listed."
                : "No changes match that search."}
            </TableEmpty>
          ) : (
            filtered.map((change) => (
              <TR key={change.id}>
                <TD muted>{formatWhen(change.changedAt)}</TD>
                <TD>{change.lineName ?? "—"}</TD>
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
