"use client";

import { format, parseISO } from "date-fns";
import type { RecipeChange } from "@/lib/recipes/change-log";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";

/**
 * Who changed this recipe, and when. Admins only.
 *
 * A log, not a version history - it says a save happened and roughly what it
 * touched, so a number that looks wrong months later has somewhere to start.
 */
export function RecipeHistoryTab({ changes }: { changes: RecipeChange[] }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
      <p className="text-xs text-muted-foreground">
        Every save to this recipe, newest first. Kept for reference only —
        nothing here can be restored from.
      </p>
      <DataTable>
        <THead
          columns={[
            { label: "When", className: "w-44" },
            { label: "Who", className: "w-48" },
            { label: "What changed" },
          ]}
        />
        <TBody>
          {changes.length === 0 ? (
            <TableEmpty colSpan={3}>
              No changes recorded yet. Saves from here on will be listed.
            </TableEmpty>
          ) : (
            changes.map((change) => (
              <TR key={change.id}>
                <TD muted>{formatWhen(change.changedAt)}</TD>
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
