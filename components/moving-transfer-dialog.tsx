"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, Loader2, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  canTransferToContainer,
  transferToContainer,
  TRANSFER_AMOUNT_EXCEEDS_MESSAGE,
  TRANSFER_ERROR_MESSAGE,
} from "@/lib/movings/transfer-to-container";
import { formatStorageType } from "@/lib/movings/format-storage-type";
import { getMovingItem, type MovingRecord } from "@/lib/movings/types";
import { movingTransferAmountSchema } from "@/lib/validations/moving-transfer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type MovingTransferDialogProps = {
  moving: MovingRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: () => void;
};

function formatIsoDateTime(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function MovingTransferDialog({
  moving,
  open,
  onOpenChange,
  onTransferred,
}: MovingTransferDialogProps) {
  const [storageType, setStorageType] = useState<"original_case" | "black_container">(
    "black_container"
  );
  const [transferAmount, setTransferAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Reset while rendering, not in an effect.

    An effect runs after the browser has already painted, so the dialog
    flashes the previous transfer's numbers for a frame before clearing. React
    supports adjusting state during render for exactly this - a change of
    input calling for different state - and it re-renders before anything is
    shown.
  */
  const [lastOpened, setLastOpened] = useState<MovingRecord | null>(null);
  if (open && moving && moving !== lastOpened) {
    setLastOpened(moving);
    setStorageType("black_container");
    setTransferAmount(String(moving.amount));
    setAmountError(null);
    setError(null);
    setIsSubmitting(false);
  }

  const parsedTransferAmount = useMemo(() => {
    const value = Number(transferAmount);
    return Number.isFinite(value) ? value : null;
  }, [transferAmount]);

  const remainingAmount = useMemo(() => {
    if (!moving || parsedTransferAmount === null) return null;
    return moving.amount - parsedTransferAmount;
  }, [moving, parsedTransferAmount]);

  if (!moving) return null;

  const item = getMovingItem(moving);
  const canTransfer = canTransferToContainer(moving);

  function validateAmount(): number | null {
    if (parsedTransferAmount === null) {
      setAmountError("Enter an amount");
      return null;
    }

    const result = movingTransferAmountSchema.safeParse({
      amount: parsedTransferAmount,
    });

    if (!result.success) {
      setAmountError(result.error.issues[0]?.message ?? "Invalid amount");
      return null;
    }

    if (parsedTransferAmount > moving!.amount) {
      setAmountError(TRANSFER_AMOUNT_EXCEEDS_MESSAGE);
      return null;
    }

    setAmountError(null);
    return parsedTransferAmount;
  }

  async function handleConfirm() {
    if (!moving || !canTransfer || storageType !== "black_container") {
      setError(TRANSFER_ERROR_MESSAGE);
      return;
    }

    const amount = validateAmount();
    if (amount === null) return;

    setIsSubmitting(true);
    setError(null);

    const supabase = createClient();
    const result = await transferToContainer(supabase, moving.id, amount);

    setIsSubmitting(false);

    if (!result.success) {
      if (result.message === TRANSFER_AMOUNT_EXCEEDS_MESSAGE) {
        setAmountError(result.message);
      } else {
        setError(result.message);
      }
      return;
    }

    onOpenChange(false);
    onTransferred();
  }

  const canSubmit =
    canTransfer &&
    storageType === "black_container" &&
    parsedTransferAmount !== null &&
    parsedTransferAmount > 0 &&
    parsedTransferAmount <= moving.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to black container</DialogTitle>
          <DialogDescription>
            Review lot details and enter how much protein to move from the
            original case into a black container.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="mb-3 font-medium">Lot details</p>
          <dl className="grid gap-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">PO</dt>
              <dd className="font-medium">{moving.po_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Item</dt>
              <dd className="text-right">
                {item
                  ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">In original case</dt>
              <dd>{formatAmount(moving.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Lot</dt>
              <dd>{moving.lot_number ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Prep</dt>
              <dd>{formatIsoDateTime(moving.prep_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Best by</dt>
              <dd>{formatIsoDateTime(moving.best_by)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-amount">Amount to transfer</Label>
          <Input
            id="transfer-amount"
            type="number"
            inputMode="decimal"
            min="0"
            max={moving.amount}
            step="0.01"
            value={transferAmount}
            onChange={(e) => {
              setTransferAmount(e.target.value);
              setAmountError(null);
              setError(null);
            }}
            aria-invalid={!!amountError}
            className={cn(
              "h-12 text-center text-lg font-semibold tabular-nums",
              amountError && "border-destructive ring-3 ring-destructive/20"
            )}
          />
          {amountError ? (
            <p className="text-sm text-destructive">{amountError}</p>
          ) : (
            remainingAmount !== null &&
            parsedTransferAmount !== null &&
            parsedTransferAmount > 0 &&
            parsedTransferAmount <= moving.amount && (
              <p className="text-sm text-muted-foreground">
                {formatAmount(Math.max(remainingAmount, 0))} stays in original
                case · {formatAmount(parsedTransferAmount)} moves to black
                container
              </p>
            )
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>Storage type</Label>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: "original_case", label: "Original case" },
                { value: "black_container", label: "Black container" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={value === "original_case"}
                onClick={() => setStorageType(value)}
                className={cn(
                  "flex h-14 flex-col items-center justify-center rounded-xl border-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  storageType === value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-foreground hover:border-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>{formatStorageType(moving.storage_type)}</span>
            <ArrowRight className="size-4" />
            <span className="font-medium text-foreground">
              {formatStorageType(storageType)}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Package />
                Confirm transfer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
