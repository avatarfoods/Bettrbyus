"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Download, Package, Printer, ShoppingCart } from "lucide-react";
import {
  listFinalOrders,
  type FinalOrderSnapshot,
} from "@/lib/purchasing/finalize-order";
import { downloadFinalOrderExcel } from "@/lib/purchasing/download-final-order";
import { printFinalOrder } from "@/lib/purchasing/print-final-order";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatTabDate(value: string) {
  try {
    return format(parseISO(value), "MM/dd/yyyy");
  } catch {
    return value;
  }
}

export function PurchasingOpenOrdersPage() {
  const [orders, setOrders] = useState<FinalOrderSnapshot[]>([]);

  useEffect(() => {
    setOrders(listFinalOrders());
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col gap-4 px-3 py-4 sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[1px] bg-primary/10 text-primary">
            <ShoppingCart className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Orders list</h1>
            <p className="text-xs text-muted-foreground">
              Final Order POs saved in this browser — open an order for full details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/purchasing"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Total Orders
          </Link>
          <Link
            href="/purchasing/materials"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <Package />
            Materials
          </Link>
        </div>
      </header>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                Order #
              </TableHead>
              <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                Required date
              </TableHead>
              <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                Production week
              </TableHead>
              <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                Finalized
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                Lines
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No final orders yet. Create one from Total Orders with{" "}
                  <span className="font-medium">Create Final Order PO</span>.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const href = `/purchasing/orders/${order.cycleId}`;
                return (
                  <TableRow
                    key={order.cycleId}
                    className="h-10 cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell className="px-2 py-1 font-mono text-xs font-medium">
                      <Link
                        href={href}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs">
                      <Link href={href} className="block">
                        {formatTabDate(order.requiredDate)}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs text-muted-foreground">
                      <Link href={href} className="block">
                        {order.productionWeek || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs text-muted-foreground">
                      <Link href={href} className="block">
                        {formatTabDate(order.finalizedAt.slice(0, 10))}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-right text-xs tabular-nums">
                      <Link href={href} className="block">
                        {order.totals.lineCount}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-1">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={href}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 px-2 text-xs"
                          )}
                        >
                          Open
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(event) => {
                            event.preventDefault();
                            downloadFinalOrderExcel(order);
                          }}
                        >
                          <Download className="size-3.5" />
                          Excel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(event) => {
                            event.preventDefault();
                            printFinalOrder(order);
                          }}
                        >
                          <Printer className="size-3.5" />
                          Print
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
