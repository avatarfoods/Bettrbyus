"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMovingsHistory } from "@/lib/movings/fetch-movings-history";
import {
  getMovingItem,
  getProfileDisplayName,
  getProfileSummary,
  type MovingHistoryRecord,
} from "@/lib/movings/types";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
  TableTitle,
} from "@/components/ui/data-table";
import { AvailableItemsSummary } from "@/components/available-items-summary";
import { AvailableLotsTable } from "@/components/available-lots-table";
import { formatTimeInFreezer } from "@/lib/movings/format-freezer-duration";

function formatIsoDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

export function MovingHistoryTable() {
  const [movings, setMovings] = useState<MovingHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [removedByFilter, setRemovedByFilter] = useState("all");

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const supabase = createClient();
      const result = await fetchMovingsHistory(supabase);
      if (!active) return;
      if (result.error) setLoadError(result.error);
      setMovings(result.data);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const itemOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const moving of movings) {
      const item = getMovingItem(moving);
      if (!item) continue;
      map.set(item.id, `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movings]);

  const removedByOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const moving of movings) {
      const completer = getProfileSummary(moving.completer);
      if (!completer) continue;
      map.set(completer.id, getProfileDisplayName(completer));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movings]);

  const filteredMovings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return movings.filter((moving) => {
      const item = getMovingItem(moving);
      const itemLabel = `${item?.code ?? ""} ${item?.item_name ?? ""}`.toLowerCase();
      const completer = getProfileSummary(moving.completer);

      if (itemFilter !== "all" && item?.id !== itemFilter) {
        return false;
      }

      if (removedByFilter !== "all" && completer?.id !== removedByFilter) {
        return false;
      }

      if (!query) return true;

      return (
        moving.po_number.toLowerCase().includes(query) ||
        (moving.out_po_number ?? "").toLowerCase().includes(query) ||
        (moving.lot_number ?? "").toLowerCase().includes(query) ||
        itemLabel.includes(query) ||
        getProfileDisplayName(moving.starter).toLowerCase().includes(query) ||
        getProfileDisplayName(moving.completer).toLowerCase().includes(query)
      );
    });
  }, [movings, search, itemFilter, removedByFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="history-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="PO, lot, item, user…"
            aria-label="Search history"
            className="h-8 w-full rounded-sm bg-card ring-1 ring-foreground/10 pr-2 pl-8 text-sm"
          />
        </div>

        <select
          id="history-item-filter"
          value={itemFilter}
          onChange={(event) => setItemFilter(event.target.value)}
          aria-label="Filter by item"
          className="h-8 max-w-56 rounded-sm bg-card ring-1 ring-foreground/10 px-2 text-sm"
        >
          <option value="all">All items</option>
          {itemOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <select
          id="history-user-filter"
          value={removedByFilter}
          onChange={(event) => setRemovedByFilter(event.target.value)}
          aria-label="Filter by who removed it"
          className="h-8 max-w-56 rounded-sm bg-card ring-1 ring-foreground/10 px-2 text-sm"
        >
          <option value="all">All users</option>
          {removedByOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {filteredMovings.length} / {movings.length}
        </span>
      </div>

      {loadError && (
        <p className="text-sm text-destructive">
          Could not load history: {loadError}
        </p>
      )}

      <DataTable>
        <THead
          columns={[
            { label: "Removed" },
            { label: "Item" },
            { label: "Amount", numeric: true },
            { label: "Lot" },
            { label: "Time in freezer" },
            { label: "In PO" },
            { label: "Out PO" },
            { label: "Moved in by" },
            { label: "Removed by" },
          ]}
        />
        <TBody>
          {filteredMovings.length === 0 ? (
            <TableEmpty colSpan={9}>
              No removal history matches your search or filters.
            </TableEmpty>
          ) : (
            filteredMovings.map((moving) => {
              const item = getMovingItem(moving);

              return (
                <TR key={moving.id}>
                  <TD muted>{formatIsoDateTime(moving.moved_at)}</TD>
                  <TD strong>
                    {item
                      ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}`
                      : "—"}
                  </TD>
                  <TD numeric strong>
                    {moving.amount}
                  </TD>
                  <TD mono muted>
                    {moving.lot_number ?? "—"}
                  </TD>
                  <TD muted>
                    {formatTimeInFreezer(moving.prep_date, moving.moved_at)}
                  </TD>
                  <TD mono muted>
                    {moving.po_number}
                  </TD>
                  <TD mono muted>
                    {moving.out_po_number ?? "—"}
                  </TD>
                  <TD>
                    <span className="flex flex-col">
                      <span>{getProfileDisplayName(moving.starter)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatIsoDateTime(moving.created_at)}
                      </span>
                    </span>
                  </TD>
                  <TD muted>{getProfileDisplayName(moving.completer)}</TD>
                </TR>
              );
            })
          )}
        </TBody>
      </DataTable>
    </div>
  );
}

export function MovingHistoryPage() {
  return (
    <div className="flex flex-col gap-6 px-3 py-4 sm:px-4">
      <section>
        <TableTitle aside="Not yet moved out">Currently in thaw</TableTitle>
        <div className="flex flex-col gap-4">
          <AvailableItemsSummary />
          <AvailableLotsTable />
        </div>
      </section>

      <section>
        <TableTitle>Removal history</TableTitle>
        <MovingHistoryTable />
      </section>
    </div>
  );
}
