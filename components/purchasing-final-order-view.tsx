"use client";

import { format, parseISO } from "date-fns";
import { Mail, Printer } from "lucide-react";
import type { LineStatus } from "@/lib/purchasing/fetch-cycles";
import {
  GROUP_STATUS_OPTIONS,
  groupStatusLabel,
  type FinalOrderGroup,
  type FinalOrderSnapshot,
} from "@/lib/purchasing/finalize-order";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function groupCases(group: FinalOrderGroup) {
  return group.lines.reduce((sum, line) => sum + line.requiredToOrder, 0);
}

type Props = {
  snapshot: FinalOrderSnapshot;
  className?: string;
  /** When set, each category shows status + print/email controls. */
  interactive?: boolean;
  onGroupStatusChange?: (groupKey: string, status: LineStatus) => void;
  onPrintGroup?: (groupKey: string) => void;
  onEmailGroup?: (groupKey: string) => void;
};

/** Full Final Order PO body (header + item groups). */
export function PurchasingFinalOrderView({
  snapshot,
  className,
  interactive = false,
  onGroupStatusChange,
  onPrintGroup,
  onEmailGroup,
}: Props) {
  return (
    <div className={className ?? "space-y-4 text-sm"}>
      <div className="space-y-1 border-b pb-3">
        <p className="text-2xl font-semibold tracking-tight">
          {snapshot.orderNumber}
        </p>
        <p>
          <span className="text-muted-foreground">Arrival date:</span>{" "}
          <strong>{formatDate(snapshot.requiredDate)}</strong>
        </p>
        <p>
          <span className="text-muted-foreground">Production week:</span>{" "}
          <strong>{snapshot.productionWeek || "—"}</strong>
        </p>
        <p>
          <span className="text-muted-foreground">Finalized:</span>{" "}
          {formatDate(snapshot.finalizedAt.slice(0, 10))}
        </p>
        <p className="text-muted-foreground">
          {snapshot.groups.length} categor
          {snapshot.groups.length === 1 ? "y" : "ies"} ·{" "}
          {snapshot.totals.lineCount} lines ·{" "}
          {snapshot.totals.casesToOrder.toLocaleString()} cases to order
        </p>
      </div>

      {snapshot.groups.map((group) => {
        const cases = groupCases(group);
        return (
          <section
            key={group.key}
            className={cn(
              "space-y-2 break-inside-avoid",
              interactive && "rounded-md border bg-muted/20 p-3 sm:p-4"
            )}
          >
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 border-b pb-2",
                !interactive && "pb-1"
              )}
            >
              <div className="min-w-0">
                <h3 className="font-semibold uppercase tracking-wide">
                  {group.label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {group.lines.length} line
                  {group.lines.length === 1 ? "" : "s"} ·{" "}
                  {cases.toLocaleString()} cases
                  {group.earliestOrderBy ? (
                    <> · Order by {formatDate(group.earliestOrderBy)}</>
                  ) : null}
                  {!interactive ? (
                    <>
                      {" "}
                      · {groupStatusLabel(group.status)}
                    </>
                  ) : null}
                </p>
              </div>

              {interactive ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Select
                    value={group.status}
                    onValueChange={(value) => {
                      if (value == null) return;
                      onGroupStatusChange?.(group.key, value as LineStatus);
                    }}
                  >
                    <SelectTrigger size="sm" className="min-w-[8.5rem]">
                      <SelectValue>
                        {(value) =>
                          value
                            ? groupStatusLabel(value as LineStatus)
                            : "Status"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end">
                      {GROUP_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onPrintGroup?.(group.key)}
                  >
                    <Printer />
                    Print
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onEmailGroup?.(group.key)}
                  >
                    <Mail />
                    Email
                  </Button>
                </div>
              ) : null}
            </div>

            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[32%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Item #</th>
                  <th className="py-1 pr-2 font-medium">Description</th>
                  <th className="py-1 pr-2 text-right font-medium">Req. to order</th>
                  <th className="py-1 pr-2 text-right font-medium">Cases req.</th>
                  <th className="py-1 pr-2 text-right font-medium">On hand</th>
                  <th className="py-1 text-right font-medium">Order by</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr
                    key={`${group.key}-${line.itemCode}`}
                    className="border-b border-border/60"
                  >
                    <td className="py-1 pr-2 align-top font-mono break-all">
                      {line.itemCode}
                    </td>
                    <td className="py-1 pr-2 align-top break-words">
                      {line.name}
                      {line.isEmergency ? " (emergency)" : ""}
                    </td>
                    <td className="py-1 pr-2 align-top text-right font-semibold tabular-nums">
                      {line.requiredToOrder.toLocaleString()}
                    </td>
                    <td className="py-1 pr-2 align-top text-right tabular-nums">
                      {line.casesRequired.toLocaleString()}
                    </td>
                    <td className="py-1 pr-2 align-top text-right tabular-nums text-muted-foreground">
                      {line.onHandCases != null
                        ? line.onHandCases.toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1 align-top text-right tabular-nums text-muted-foreground">
                      {formatDate(line.orderByDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
