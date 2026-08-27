"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer, ShoppingCart } from "lucide-react";
import type { LineStatus } from "@/lib/purchasing/fetch-cycles";
import {
  loadFinalOrder,
  sliceFinalOrderToGroup,
  updateFinalOrderGroupStatus,
  type FinalOrderSnapshot,
} from "@/lib/purchasing/finalize-order";
import { downloadFinalOrderExcel } from "@/lib/purchasing/download-final-order";
import { printFinalOrder } from "@/lib/purchasing/print-final-order";
import { PurchasingEmailCategoryDialog } from "@/components/purchasing-email-category-dialog";
import { PurchasingFinalOrderView } from "@/components/purchasing-final-order-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  cycleId: string;
};

export function PurchasingOrderDetailPage({ cycleId }: Props) {
  const [snapshot, setSnapshot] = useState<FinalOrderSnapshot | null | undefined>(
    undefined
  );
  const [emailGroupKey, setEmailGroupKey] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(loadFinalOrder(cycleId));
  }, [cycleId]);

  function handleGroupStatusChange(groupKey: string, status: LineStatus) {
    setSnapshot((current) => {
      if (!current) return current;
      return updateFinalOrderGroupStatus(current, groupKey, status);
    });
  }

  function handlePrintGroup(groupKey: string) {
    if (!snapshot) return;
    const part = sliceFinalOrderToGroup(snapshot, groupKey);
    if (!part) {
      window.alert("Category not found on this order.");
      return;
    }
    printFinalOrder(part);
  }

  if (snapshot === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 items-center justify-center px-3 py-10 text-sm text-muted-foreground">
        Loading order…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
        <Link
          href="/purchasing/orders"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}
        >
          <ArrowLeft />
          Back to Orders list
        </Link>
        <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Order not found in this browser. It may have been cleared, or was created
          on another device.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="size-4" />
          </div>
          <div>
            <Link
              href="/purchasing/orders"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Orders list
            </Link>
            <h1 className="font-mono text-lg font-semibold tracking-tight">
              {snapshot.orderNumber}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/purchasing/orders"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft />
            Orders list
          </Link>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadFinalOrderExcel(snapshot)}
          >
            <Download />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => printFinalOrder(snapshot)}
          >
            <Printer />
            Print all
          </Button>
        </div>
      </header>

      <div className="rounded-md border bg-background p-4 sm:p-6">
        <PurchasingFinalOrderView
          snapshot={snapshot}
          interactive
          onGroupStatusChange={handleGroupStatusChange}
          onPrintGroup={handlePrintGroup}
          onEmailGroup={setEmailGroupKey}
        />
      </div>

      <PurchasingEmailCategoryDialog
        open={emailGroupKey != null}
        onOpenChange={(open) => {
          if (!open) setEmailGroupKey(null);
        }}
        snapshot={snapshot}
        groupKey={emailGroupKey}
      />
    </div>
  );
}
