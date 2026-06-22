"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, History, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMovingsHistory } from "@/lib/movings/fetch-movings-history";
import {
  getMovingItem,
  getProfileDisplayName,
  getProfileSummary,
  type MovingHistoryRecord,
} from "@/lib/movings/types";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AvailableItemsSummary } from "@/components/available-items-summary";
import { AvailableLotsTable } from "@/components/available-lots-table";

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
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="history-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="history-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO, lot, item, user…"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="history-item-filter">Item</Label>
          <select
            id="history-item-filter"
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
          <Label htmlFor="history-user-filter">Removed by</Label>
          <select
            id="history-user-filter"
            value={removedByFilter}
            onChange={(e) => setRemovedByFilter(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            <option value="all">All users</option>
            {removedByOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-destructive">Could not load history: {loadError}</p>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Removed</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>In PO</TableHead>
              <TableHead>Out PO</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Moved in by</TableHead>
              <TableHead>Removed by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMovings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No removal history matches your search or filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredMovings.map((moving) => {
                const item = getMovingItem(moving);

                return (
                  <TableRow key={moving.id}>
                    <TableCell>{formatIsoDateTime(moving.moved_at)}</TableCell>
                    <TableCell>
                      {item ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}` : "—"}
                    </TableCell>
                    <TableCell>{moving.amount}</TableCell>
                    <TableCell>{moving.po_number}</TableCell>
                    <TableCell>{moving.out_po_number ?? "—"}</TableCell>
                    <TableCell>{moving.lot_number ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{getProfileDisplayName(moving.starter)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatIsoDateTime(moving.created_at)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getProfileDisplayName(moving.completer)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filteredMovings.length} of {movings.length} removed moving
        {movings.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

export function MovingHistoryPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Link
            href="/movings/new"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to new moving"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <History className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              Removal history
            </h1>
            <p className="text-sm text-muted-foreground">
              Log of removed movings and who performed each action.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Currently available</CardTitle>
            <CardDescription>
              Total amount in thaw by item (not yet moved out).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AvailableItemsSummary />
            <AvailableLotsTable />
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">History & logs</CardTitle>
            <CardDescription>
              All protein lots that have been moved out of thaw, with original and out PO numbers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovingHistoryTable />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
