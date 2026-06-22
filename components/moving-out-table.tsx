"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMovingsForOut } from "@/lib/movings/fetch-movings-out";
import { getThawExpiryWarning } from "@/lib/thaw-range";
import {
  getItemThawRangeDays,
  getMovingItem,
  type MovingRecord,
} from "@/lib/movings/types";
import { AvailableItemsSummary } from "@/components/available-items-summary";
import { ThawWarningBadge } from "@/components/thaw-warning-badge";
import { formatMovingStatus } from "@/lib/movings/status";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StorageFilter = "all" | "original_case" | "black_container";

function formatIsoDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

function formatStorageType(value: string | null) {
  if (value === "original_case") return "Original case";
  if (value === "black_container") return "Black container";
  return "—";
}

type MovingOutTableProps = {
  selectedId: string | null;
  onSelect: (moving: MovingRecord) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
};

export function MovingOutTable({
  selectedId,
  onSelect,
  error,
  onErrorChange,
}: MovingOutTableProps) {
  const [movings, setMovings] = useState<MovingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [storageFilter, setStorageFilter] = useState<StorageFilter>("all");

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      onErrorChange(null);
      const supabase = createClient();
      const result = await fetchMovingsForOut(supabase);
      if (!active) return;
      if (result.error) onErrorChange(result.error);
      setMovings(result.data);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [onErrorChange]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const moving of movings) {
      const item = getMovingItem(moving);
      if (!item) continue;
      map.set(item.id, `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movings]);

  const filteredMovings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return movings.filter((moving) => {
      const item = getMovingItem(moving);
      const itemLabel = `${item?.code ?? ""} ${item?.item_name ?? ""}`.toLowerCase();

      if (itemFilter !== "all" && item?.id !== itemFilter) {
        return false;
      }

      if (storageFilter !== "all" && moving.storage_type !== storageFilter) {
        return false;
      }

      if (!query) return true;

      return (
        moving.po_number.toLowerCase().includes(query) ||
        (moving.lot_number ?? "").toLowerCase().includes(query) ||
        itemLabel.includes(query)
      );
    });
  }, [movings, search, itemFilter, storageFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AvailableItemsSummary movings={movings} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="moving-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="moving-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO, lot, item…"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="item-filter">Item</Label>
          <select
            id="item-filter"
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            <option value="all">All items</option>
            {itemOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="storage-filter">Storage type</Label>
          <select
            id="storage-filter"
            value={storageFilter}
            onChange={(e) => setStorageFilter(e.target.value as StorageFilter)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            <option value="all">All storage types</option>
            <option value="original_case">Original case</option>
            <option value="black_container">Black container</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">Could not load movings: {error}</p>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>PO</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Prep</TableHead>
              <TableHead>Best by</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Warning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMovings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  No movings match your search or filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredMovings.map((moving) => {
                const item = getMovingItem(moving);
                const isSelected = selectedId === moving.id;
                const warning = getThawExpiryWarning(
                  moving.prep_date,
                  moving.best_by,
                  getItemThawRangeDays(moving)
                );

                return (
                  <TableRow
                    key={moving.id}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      "cursor-pointer",
                      isSelected && "bg-primary/5",
                      warning && !isSelected && "bg-amber-500/5"
                    )}
                    onClick={() => onSelect(moving)}
                  >
                    <TableCell>
                      <input
                        type="radio"
                        name="moving-out-selection"
                        checked={isSelected}
                        onChange={() => onSelect(moving)}
                        className="size-4 accent-primary"
                        aria-label={`Select PO ${moving.po_number}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{moving.po_number}</TableCell>
                    <TableCell>
                      {item ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}` : "—"}
                    </TableCell>
                    <TableCell>{moving.amount}</TableCell>
                    <TableCell>{formatIsoDateTime(moving.prep_date)}</TableCell>
                    <TableCell>{formatIsoDateTime(moving.best_by)}</TableCell>
                    <TableCell>{moving.lot_number ?? "—"}</TableCell>
                    <TableCell>{formatStorageType(moving.storage_type)}</TableCell>
                    <TableCell className="capitalize">
                      {formatMovingStatus(moving.status)}
                    </TableCell>
                    <TableCell
                      className="max-w-xs whitespace-normal"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ThawWarningBadge message={warning} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filteredMovings.length} of {movings.length} available moving
        {movings.length === 1 ? "" : "s"} in thaw.
      </p>
    </div>
  );
}
