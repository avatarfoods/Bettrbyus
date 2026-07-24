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
import { ThawWarningBadge } from "@/components/thaw-warning-badge";
import { formatTimeInFreezer } from "@/lib/movings/format-freezer-duration";
import { formatStorageType } from "@/lib/movings/format-storage-type";
import { canTransferToContainer } from "@/lib/movings/transfer-to-container";
import { MovingTransferDialog } from "@/components/moving-transfer-dialog";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

function formatIsoDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

export function AvailableLotsTable() {
  const [movings, setMovings] = useState<MovingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [transferMoving, setTransferMoving] = useState<MovingRecord | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const supabase = createClient();
      const result = await fetchMovingsForOut(supabase);
      if (!active) return;
      if (result.error) setLoadError(result.error);
      setMovings(result.data);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const filteredMovings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return movings;

    return movings.filter((moving) => {
      const item = getMovingItem(moving);
      const itemLabel = `${item?.code ?? ""} ${item?.item_name ?? ""}`.toLowerCase();
      return (
        moving.po_number.toLowerCase().includes(query) ||
        (moving.lot_number ?? "").toLowerCase().includes(query) ||
        itemLabel.includes(query)
      );
    });
  }, [movings, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="available-lots-search">Search lots</Label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="available-lots-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="PO, lot, item…"
            className="h-10 pl-9"
          />
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-destructive">Could not load lots: {loadError}</p>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Prep</TableHead>
              <TableHead>Best by</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>In freezer</TableHead>
              <TableHead>Warning</TableHead>
              <TableHead className="w-[130px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMovings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  No lots in thaw match your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredMovings.map((moving) => {
                const item = getMovingItem(moving);
                const warning = getThawExpiryWarning(
                  moving.prep_date,
                  moving.best_by,
                  getItemThawRangeDays(moving)
                );

                return (
                  <TableRow
                    key={moving.id}
                    className={cn(warning && "bg-amber-500/5")}
                  >
                    <TableCell className="font-medium">{moving.po_number}</TableCell>
                    <TableCell>
                      {item ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}` : "—"}
                    </TableCell>
                    <TableCell>{moving.amount}</TableCell>
                    <TableCell>{formatIsoDateTime(moving.prep_date)}</TableCell>
                    <TableCell>{formatIsoDateTime(moving.best_by)}</TableCell>
                    <TableCell>{moving.lot_number ?? "—"}</TableCell>
                    <TableCell>{formatStorageType(moving.storage_type)}</TableCell>
                    <TableCell>
                      {formatTimeInFreezer(moving.prep_date)}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <ThawWarningBadge message={warning} />
                    </TableCell>
                    <TableCell>
                      {canTransferToContainer(moving) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTransferMoving(moving);
                            setTransferOpen(true);
                          }}
                        >
                          To container
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filteredMovings.length} of {movings.length} lot
        {movings.length === 1 ? "" : "s"} in thaw. Warnings appear when a lot is
        within 3 days of its move out date (prep + thaw range).
      </p>

      <MovingTransferDialog
        moving={transferMoving}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransferred={() => setRefreshKey((key) => key + 1)}
      />
    </div>
  );
}
