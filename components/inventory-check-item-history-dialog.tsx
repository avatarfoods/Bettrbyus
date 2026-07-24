"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchInventoryCheckItemHistory } from "@/lib/inventory-checks/fetch-item-history";
import {
  computeVariance,
  formatQuantity,
} from "@/lib/inventory-checks/format-department";
import type {
  InventoryCheckItem,
  InventoryCheckItemHistoryRecord,
} from "@/lib/inventory-checks/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type InventoryCheckItemHistoryDialogProps = {
  item: InventoryCheckItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatCheckDate(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function formatVariance(value: number | null) {
  if (value == null) return "—";
  if (value > 0) return `+${formatQuantity(value)}`;
  return formatQuantity(value);
}

export function InventoryCheckItemHistoryDialog({
  item,
  open,
  onOpenChange,
}: InventoryCheckItemHistoryDialogProps) {
  const [history, setHistory] = useState<InventoryCheckItemHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;

    let active = true;

    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const supabase = createClient();
      const result = await fetchInventoryCheckItemHistory(supabase, item.id);

      if (!active) return;

      if (result.error) {
        setLoadError(result.error);
        setHistory([]);
      } else {
        setHistory(result.data);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [open, item]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,640px)] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Item history</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.item_code} · ${item.item_name}`
              : "Past inventory check entries for this item."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex min-h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">
              Could not load history: {loadError}
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No inventory checks recorded for this item yet.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Recorded by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => {
                    const variance = computeVariance(
                      entry.actualQuantity,
                      item?.par_quantity
                    );

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="align-top whitespace-nowrap">
                          {formatCheckDate(entry.checkDate)}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {formatQuantity(entry.actualQuantity)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right align-top font-medium",
                            variance != null &&
                              variance !== 0 &&
                              (variance > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-destructive")
                          )}
                        >
                          {formatVariance(variance)}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="text-sm">{entry.checkerName}</p>
                            {entry.notes && (
                              <p className="text-xs text-muted-foreground">
                                {entry.notes}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
