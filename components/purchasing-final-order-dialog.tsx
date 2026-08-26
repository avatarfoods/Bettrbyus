"use client";

import { Download, Loader2, Printer } from "lucide-react";
import type { FinalOrderSnapshot } from "@/lib/purchasing/finalize-order";
import { downloadFinalOrderExcel } from "@/lib/purchasing/download-final-order";
import { printFinalOrder } from "@/lib/purchasing/print-final-order";
import { PurchasingFinalOrderView } from "@/components/purchasing-final-order-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: FinalOrderSnapshot | null;
  isLoading?: boolean;
};

export function PurchasingFinalOrderDialog({
  open,
  onOpenChange,
  snapshot,
  isLoading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="purchasing-final-order-dialog flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none">
        <DialogHeader className="print:hidden border-b px-6 py-4">
          <DialogTitle>Final Order PO</DialogTitle>
          <DialogDescription>
            Printable order with Req. to order, production week, required date, and
            order number. Items are grouped by item # prefix (22xxx, 31xxx, …).
          </DialogDescription>
        </DialogHeader>

        <div className="purchasing-final-order-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4 print:overflow-visible print:px-0 print:py-0">
          {isLoading ? (
            <div className="flex min-h-40 items-center justify-center print:hidden">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !snapshot ? (
            <p className="text-sm text-muted-foreground print:hidden">
              No final order yet.
            </p>
          ) : (
            <PurchasingFinalOrderView snapshot={snapshot} />
          )}
        </div>

        <DialogFooter className="print:hidden border-t px-6 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!snapshot}
            onClick={() => {
              if (snapshot) downloadFinalOrderExcel(snapshot);
            }}
          >
            <Download />
            Download Excel
          </Button>
          <Button
            type="button"
            disabled={!snapshot}
            onClick={() => {
              if (snapshot) printFinalOrder(snapshot);
            }}
          >
            <Printer />
            Print order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
