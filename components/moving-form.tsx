"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarDays,
  ChevronLeft,
  Clock,
  Hash,
  Loader2,
  Package,
  CheckCircle2,
} from "lucide-react";
import {
  movingAmountSchema,
  movingDirectionSchema,
  movingInDetailsSchema,
  movingItemSchema,
  movingOutDateTimeSchema,
  type MovingDirectionValues,
  type MovingFormData,
} from "@/lib/validations/moving";
import { createClient } from "@/lib/supabase/client";
import {
  calculateBestByFromPrep,
  formatThawRangeLabel,
  validatePrepForMovingIn,
} from "@/lib/thaw-range";
import {
  MOVING_SUBMIT_ERROR_MESSAGE,
  MOVING_SUBMIT_SUCCESS_MESSAGE,
  submitMoving,
} from "@/lib/movings/submit-moving";
import { getMovingItem, type MovingRecord } from "@/lib/movings/types";
import { itemRequiresStorageType } from "@/lib/movings/storage-type-items";
import { MovingOutTable } from "@/components/moving-out-table";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "direction" | "po" | "item" | "amount" | "select" | "details" | "complete" | "saved";
type Direction = MovingDirectionValues["direction"];

type ItemOption = {
  id: string;
  code: string | null;
  item_name: string | null;
  thaw_range_days: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepsFor(direction: Direction | null): Step[] {
  return direction === "in"
    ? ["direction", "po", "item", "amount", "details"]
    : ["direction", "select", "po", "details"];
}

function formatDateStr(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function formatTimeStr(timeStr: string) {
  try {
    return format(parseISO(`1970-01-01T${timeStr}`), "h:mm a");
  } catch {
    return timeStr;
  }
}

function formatDateTimeStr(dateStr: string, timeStr: string) {
  try {
    return format(parseISO(`${dateStr}T${timeStr}`), "MMM d, yyyy · h:mm a");
  } catch {
    return `${dateStr} ${timeStr}`;
  }
}

function formatIsoDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · h:mm a");
  } catch {
    return value;
  }
}

function ActionButton({
  onClick,
  children,
  variant = "primary",
  disabled = false,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        variant === "outline" &&
          "border border-input bg-background text-foreground hover:bg-muted active:bg-muted/80",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MovingForm() {
  const [step, setStep] = useState<Step>("direction");
  const [direction, setDirection] = useState<Direction | null>(null);

  // Item (moving in)
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemId, setItemId] = useState("");
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // PO number
  const [poNumber, setPoNumber] = useState("");

  // Amount
  const [amount, setAmount] = useState("");

  // Moving-in details
  const [prepDate, setPrepDate] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [storageType, setStorageType] = useState<"original_case" | "black_container" | "">("");

  // Moving-out date/time
  const [movedOutDate, setMovedOutDate] = useState("");
  const [movedOutTime, setMovedOutTime] = useState("");

  // Errors
  const [directionError, setDirectionError] = useState<string | null>(null);
  const [poNumberError, setPoNumberError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [prepDateError, setPrepDateError] = useState<string | null>(null);
  const [prepTimeError, setPrepTimeError] = useState<string | null>(null);
  const [lotNumberError, setLotNumberError] = useState<string | null>(null);
  const [storageTypeError, setStorageTypeError] = useState<string | null>(null);
  const [movedOutDateError, setMovedOutDateError] = useState<string | null>(null);
  const [movedOutTimeError, setMovedOutTimeError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Moving out selection
  const [selectedMoving, setSelectedMoving] = useState<MovingRecord | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [movingsLoadError, setMovingsLoadError] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState<MovingFormData | null>(null);

  // Progress
  const inputSteps = stepsFor(step === "item" ? "in" : step === "po" ? direction : direction);
  const displayStep =
    step === "complete" || step === "saved"
      ? inputSteps.length
      : inputSteps.indexOf(step) + 1;
  const progressValue =
    step === "complete" || step === "saved"
      ? 100
      : ((inputSteps.indexOf(step) + 1) / inputSteps.length) * 100;

  const isMovingIn = direction === "in";
  const contentMaxWidth = step === "select" ? "max-w-none" : "max-w-lg";

  const selectedItem = items.find((i) => i.id === itemId);

  const requiresStorageType = itemRequiresStorageType(selectedItem?.id);
  const selectedThawRangeDays = selectedItem?.thaw_range_days ?? null;

  const calculatedBestBy = useMemo(() => {
    if (!prepDate || !prepTime || !selectedThawRangeDays) return null;
    return calculateBestByFromPrep(
      prepDate,
      prepTime,
      selectedThawRangeDays
    );
  }, [prepDate, prepTime, selectedThawRangeDays]);

  const thawRangeLabel = formatThawRangeLabel(selectedThawRangeDays);

  // Load items when entering the item step
  useEffect(() => {
    if (step !== "item" || items.length > 0 || isLoadingItems) return;
    let active = true;
    (async () => {
      setIsLoadingItems(true);
      setItemsLoadError(null);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("items")
        .select("id, code, item_name, thaw_range_days")
        .order("code", { ascending: true });
      if (!active) return;
      if (error) setItemsLoadError(error.message);
      else setItems(data ?? []);
      setIsLoadingItems(false);
    })();
    return () => { active = false; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleDirectionNext() {
    const result = movingDirectionSchema.safeParse({ direction });
    if (!result.success) {
      setDirectionError(result.error.issues[0]?.message ?? "Select a direction");
      return;
    }
    setDirectionError(null);
    setStep(result.data.direction === "in" ? "po" : "select");
  }

  function handleSelectNext() {
    if (!selectedMoving) {
      setSelectError("Select a moving from the table");
      return;
    }
    setSelectError(null);
    setPoNumber("");
    setPoNumberError(null);
    setStep("po");
  }

  function handlePoNext() {
    if (!poNumber.trim()) {
      setPoNumberError("Enter a PO number");
      return;
    }
    setPoNumberError(null);
    setStep(isMovingIn ? "item" : "details");
  }

  function handleItemNext() {
    const result = movingItemSchema.safeParse({ itemId });
    if (!result.success) {
      setItemError(result.error.issues[0]?.message ?? "Select an item");
      return;
    }
    setItemError(null);
    setStep("amount");
  }

  function handleAmountNext() {
    const result = movingAmountSchema.safeParse({ amount: Number(amount) });
    if (!result.success) {
      setAmountError(result.error.issues[0]?.message ?? "Invalid amount");
      return;
    }
    setAmountError(null);
    setStep("details");
  }

  function getMovingInThawRangeError(
    prepDateValue: string,
    prepTimeValue: string,
    item: ItemOption | undefined
  ) {
    if (!item) return { field: "prepDate" as const, message: "Select an item" };

    const prepError = validatePrepForMovingIn(
      prepDateValue,
      prepTimeValue,
      item.thaw_range_days
    );
    if (prepError) {
      return { field: "prepDate" as const, message: prepError };
    }

    const bestBy = calculateBestByFromPrep(
      prepDateValue,
      prepTimeValue,
      item.thaw_range_days
    );
    if (!bestBy) {
      return {
        field: "prepDate" as const,
        message: "Cannot calculate best by from thaw range",
      };
    }

    return null;
  }

  function handleDetailsNext() {
    if (!direction) return;

    if (isMovingIn) {
      const result = movingInDetailsSchema.safeParse({
        prepDate,
        prepTime,
        lotNumber,
      });
      if (!result.success) {
        const issues = result.error.issues;
        setPrepDateError(issues.find((i) => i.path[0] === "prepDate")?.message ?? null);
        setPrepTimeError(issues.find((i) => i.path[0] === "prepTime")?.message ?? null);
        setLotNumberError(issues.find((i) => i.path[0] === "lotNumber")?.message ?? null);
        return;
      }
      if (requiresStorageType && !storageType) {
        setStorageTypeError("Select a storage type");
        return;
      }
      const thawRangeError = getMovingInThawRangeError(
        result.data.prepDate,
        result.data.prepTime,
        selectedItem
      );
      if (thawRangeError) {
        setPrepDateError(thawRangeError.message);
        return;
      }
      const bestBy = calculateBestByFromPrep(
        result.data.prepDate,
        result.data.prepTime,
        selectedItem?.thaw_range_days
      );
      if (!bestBy) {
        setPrepDateError("Cannot calculate best by from thaw range");
        return;
      }
      setPrepDateError(null);
      setPrepTimeError(null);
      setLotNumberError(null);
      setStorageTypeError(null);
      setSubmitted({
        direction,
        poNumber,
        itemId: selectedItem?.id,
        itemCode: selectedItem?.code,
        itemName: selectedItem?.item_name,
        amount: Number(amount),
        prepDate: result.data.prepDate,
        prepTime: result.data.prepTime,
        bestByDate: bestBy.bestByDate,
        bestByTime: bestBy.bestByTime,
        lotNumber: result.data.lotNumber,
        storageType: requiresStorageType ? (storageType as "original_case" | "black_container") : undefined,
      });
    } else {
      if (!selectedMoving) {
        setSelectError("Select a moving from the table");
        setStep("select");
        return;
      }

      const result = movingOutDateTimeSchema.safeParse({ movedOutDate, movedOutTime });
      if (!result.success) {
        const issues = result.error.issues;
        setMovedOutDateError(issues.find((i) => i.path[0] === "movedOutDate")?.message ?? null);
        setMovedOutTimeError(issues.find((i) => i.path[0] === "movedOutTime")?.message ?? null);
        return;
      }
      setMovedOutDateError(null);
      setMovedOutTimeError(null);

      const item = getMovingItem(selectedMoving);
      setSubmitted({
        direction,
        movingId: selectedMoving.id,
        inPoNumber: selectedMoving.po_number,
        outPoNumber: poNumber.trim(),
        amount: selectedMoving.amount,
        itemId: item?.id,
        itemCode: item?.code,
        itemName: item?.item_name,
        lotNumber: selectedMoving.lot_number ?? undefined,
        storageType:
          selectedMoving.storage_type === "original_case" ||
          selectedMoving.storage_type === "black_container"
            ? selectedMoving.storage_type
            : undefined,
        prepDateIso: selectedMoving.prep_date,
        bestByIso: selectedMoving.best_by,
        movedOutDate: result.data.movedOutDate,
        movedOutTime: result.data.movedOutTime,
      });
    }

    setStep("complete");
  }

  function handleConfirm() {
    if (!submitted || isSubmitting) return;

    setConfirmError(null);

    if (
      submitted.direction === "in" &&
      submitted.prepDate &&
      submitted.prepTime &&
      submitted.itemId
    ) {
      const item = items.find((i) => i.id === submitted.itemId);
      const thawRangeError = getMovingInThawRangeError(
        submitted.prepDate,
        submitted.prepTime,
        item
      );
      if (thawRangeError) {
        setPrepDateError(thawRangeError.message);
        setConfirmError(thawRangeError.message);
        setStep("details");
        return;
      }
    }

    void (async () => {
      setIsSubmitting(true);
      const supabase = createClient();
      const result = await submitMoving(supabase, submitted);
      setIsSubmitting(false);

      if (result.success) {
        setConfirmError(null);
        setStep("saved");
        return;
      }

      setConfirmError(MOVING_SUBMIT_ERROR_MESSAGE);
    })();
  }

  function handleStartOver() {
    setStep("direction");
    setDirection(null);
    setPoNumber("");
    setItemId("");
    setAmount("");
    setPrepDate("");
    setPrepTime("");
    setStorageType("");
    setLotNumber("");
    setMovedOutDate("");
    setMovedOutTime("");
    setDirectionError(null);
    setPoNumberError(null);
    setItemError(null);
    setItemsLoadError(null);
    setAmountError(null);
    setPrepDateError(null);
    setLotNumberError(null);
    setMovedOutDateError(null);
    setMovedOutTimeError(null);
    setConfirmError(null);
    setIsSubmitting(false);
    setSelectedMoving(null);
    setSelectError(null);
    setMovingsLoadError(null);
    setSubmitted(null);
  }

  function goBack() {
    if (step === "po") setStep(isMovingIn ? "direction" : "select");
    else if (step === "select") setStep("direction");
    else if (step === "item") setStep("po");
    else if (step === "amount") setStep("item");
    else if (step === "details") setStep(isMovingIn ? "amount" : "po");
  }

  const showBack =
    step === "po" ||
    step === "select" ||
    step === "item" ||
    step === "amount" ||
    step === "details";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Step header. The wizard owns this - it is state, not chrome. */}
      <div className="border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className={cn("mx-auto flex w-full flex-col gap-2.5", contentMaxWidth)}>
          <div className="flex items-baseline gap-3">
            <h1 className="font-heading text-base font-semibold tracking-tight">
              {step === "direction" && "Direction"}
              {step === "po" && "PO number"}
              {step === "item" && "Select item"}
              {step === "select" && "Select moving"}
              {step === "amount" && "Amount"}
              {step === "details" && (isMovingIn ? "Details" : "Date & time")}
              {step === "complete" && "Review"}
              {step === "saved" && "Saved"}
            </h1>
            <span className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Step {displayStep} of {inputSteps.length}
            </span>
          </div>
          <Progress value={progressValue}>
            <ProgressTrack className="h-1">
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        </div>
      </div>

      {/* Main content */}
      <main className={cn("mx-auto flex w-full flex-1 flex-col px-4 py-6", contentMaxWidth)}>

        {/* ── Direction ─────────────────────────────────────────────────────── */}
        {step === "direction" && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Are you moving in or out?</CardTitle>
              <CardDescription>
                Choose whether protein is entering or leaving the freezer.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(
                [
                  {
                    value: "in" as Direction,
                    label: "Moving in",
                    description: "Protein is going into the freezer",
                    Icon: ArrowUpFromLine,
                  },
                  {
                    value: "out" as Direction,
                    label: "Moving out",
                    description: "Protein is leaving the freezer",
                    Icon: ArrowDownToLine,
                  },
                ] as const
              ).map(({ value, label, description, Icon }) => {
                const isSelected = direction === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setDirection(value);
                      setDirectionError(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-input hover:bg-muted/50 active:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-12 shrink-0 items-center justify-center rounded-full",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{label}</p>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </button>
                );
              })}
              {directionError && (
                <p className="text-sm text-destructive">{directionError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Select moving (moving out) ─────────────────────────────────────── */}
        {step === "select" && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Select a moving</CardTitle>
              <CardDescription>
                Choose the protein lot leaving the freezer. Use search and filters to find it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <MovingOutTable
                selectedId={selectedMoving?.id ?? null}
                onSelect={(moving) => {
                  setSelectedMoving(moving);
                  setSelectError(null);
                }}
                error={movingsLoadError}
                onErrorChange={setMovingsLoadError}
              />
              {selectError && (
                <p className="text-sm text-destructive">{selectError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PO number ─────────────────────────────────────────────────────── */}
        {step === "po" && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">PO number</CardTitle>
              <CardDescription>
                {isMovingIn
                  ? "Enter the purchase order number for this movement."
                  : "Enter the PO for this move out. It may differ from the original moving-in PO."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!isMovingIn && selectedMoving && (
                <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Original PO (moving in):{" "}
                  <span className="font-medium text-foreground">
                    {selectedMoving.po_number}
                  </span>
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="po-number">PO number</Label>
                <Input
                  id="po-number"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 12345"
                  value={poNumber}
                  onChange={(e) => {
                    setPoNumber(e.target.value);
                    setPoNumberError(null);
                  }}
                  aria-invalid={!!poNumberError}
                  className={cn(
                    "h-12 text-base",
                    poNumberError && "border-destructive ring-3 ring-destructive/20"
                  )}
                  autoFocus
                />
                {poNumberError && (
                  <p className="text-sm text-destructive">{poNumberError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Item (moving in only) ──────────────────────────────────────────── */}
        {step === "item" && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Which item are you moving in?</CardTitle>
              <CardDescription>
                Select the item that is entering the freezer.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-select">Item</Label>
                <div className="relative">
                  <select
                    id="item-select"
                    value={itemId}
                    onChange={(e) => {
                      setItemId(e.target.value);
                      setItemError(null);
                    }}
                    disabled={isLoadingItems || !!itemsLoadError}
                    aria-invalid={!!itemError}
                    style={{ touchAction: "manipulation" }}
                    className={cn(
                      "h-14 w-full appearance-none rounded-lg border border-input bg-background px-4 pr-10 text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
                      itemError && "border-destructive ring-3 ring-destructive/20"
                    )}
                  >
                    <option value="">
                      {isLoadingItems ? "Loading…" : "Select item"}
                    </option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code ?? "—"} – {item.item_name ?? "Unnamed"}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    {isLoadingItems ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : (
                      <svg className="size-5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                {itemError && <p className="text-sm text-destructive">{itemError}</p>}
                {itemsLoadError && (
                  <p className="text-sm text-destructive">Could not load items: {itemsLoadError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Amount ────────────────────────────────────────────────────────── */}
        {step === "amount" && isMovingIn && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Package className="size-5 text-primary" />
                {isMovingIn ? "How much are you moving in?" : "How much are you moving out?"}
              </CardTitle>
              <CardDescription>
                {isMovingIn
                  ? "Enter the total amount of protein going into the freezer."
                  : "Enter the total amount of protein leaving the freezer."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAmountError(null);
                  }}
                  aria-invalid={!!amountError}
                  className="h-14 text-center text-2xl font-semibold tabular-nums"
                  autoFocus
                />
                {amountError && <p className="text-sm text-destructive">{amountError}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[40, 60, 80].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setAmount(String(v));
                      setAmountError(null);
                    }}
                    className="h-11 rounded-lg border border-input bg-background text-base font-medium transition-colors hover:bg-muted active:bg-muted"
                  >
                    +{v}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Details (moving in) ────────────────────────────────────────────── */}
        {step === "details" && isMovingIn && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Details</CardTitle>
              <CardDescription>
                Enter prep date and lot number. Best by is calculated from the item thaw range.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pb-8">

              {/* ── Prep section ── */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Prep</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Prep date */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="prep-date">Date</Label>
                    <div className="relative grid grid-cols-1">
                      <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="prep-date"
                        type="date"
                        value={prepDate}
                        onChange={(e) => {
                          setPrepDate(e.target.value);
                          setPrepDateError(null);
                        }}
                        aria-invalid={!!prepDateError}
                        className={cn(
                          "h-12 min-w-0 rounded-lg border border-input bg-background pl-9 pr-2 text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50",
                          prepDateError && "border-destructive ring-3 ring-destructive/20"
                        )}
                      />
                    </div>
                    {prepDateError && <p className="text-xs text-destructive">{prepDateError}</p>}
                  </div>

                  {/* Prep time */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="prep-time">Time</Label>
                    <div className="relative grid grid-cols-1">
                      <Clock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="prep-time"
                        type="time"
                        value={prepTime}
                        onChange={(e) => {
                          setPrepTime(e.target.value);
                          setPrepTimeError(null);
                        }}
                        aria-invalid={!!prepTimeError}
                        className={cn(
                          "h-12 min-w-0 rounded-lg border border-input bg-background pl-9 pr-2 text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50",
                          prepTimeError && "border-destructive ring-3 ring-destructive/20"
                        )}
                      />
                    </div>
                    {prepTimeError && <p className="text-xs text-destructive">{prepTimeError}</p>}
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* ── Best by (auto-calculated) ── */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Best by
                </p>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  {calculatedBestBy ? (
                    <p className="text-base font-semibold">
                      {formatDateTimeStr(
                        calculatedBestBy.bestByDate,
                        calculatedBestBy.bestByTime
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Enter prep date and time to calculate best by.
                    </p>
                  )}
                  {thawRangeLabel && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Calculated from thaw range: {thawRangeLabel} after prep
                    </p>
                  )}
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* ── Lot number ── */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="lot-number">Lot#</Label>
                <div className="relative">
                  <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="lot-number"
                    type="text"
                    inputMode="text"
                    placeholder="e.g. 06122026"
                    value={lotNumber}
                    onChange={(e) => {
                      setLotNumber(e.target.value);
                      setLotNumberError(null);
                    }}
                    aria-invalid={!!lotNumberError}
                    className={cn(
                      "h-12 pl-9 text-base",
                      lotNumberError && "border-destructive ring-3 ring-destructive/20"
                    )}
                  />
                </div>
                {lotNumberError && <p className="text-sm text-destructive">{lotNumberError}</p>}
              </div>

              {/* ── Storage type (conditional) ── */}
              {requiresStorageType && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Storage type</p>
                      {storageTypeError && <p className="mt-1 text-sm text-destructive">{storageTypeError}</p>}
                    </div>
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
                          onClick={() => {
                            setStorageType(value);
                            setStorageTypeError(null);
                          }}
                          className={cn(
                            "flex h-14 flex-col items-center justify-center rounded-xl border-2 text-sm font-medium transition-colors",
                            storageType === value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border bg-background text-foreground hover:border-muted-foreground"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

            </CardContent>
          </Card>
        )}

        {/* ── Details (moving out — date & time) ────────────────────────────── */}
        {step === "details" && !isMovingIn && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">When did you move it out?</CardTitle>
              <CardDescription>
                Record when the protein was removed from the freezer.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pb-8">
              {selectedMoving && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="mb-2 font-medium">Selected moving</p>
                  <dl className="grid gap-1 text-muted-foreground">
                    <div>PO {selectedMoving.po_number} · Amount {selectedMoving.amount}</div>
                    <div>
                      {(() => {
                        const item = getMovingItem(selectedMoving);
                        return item
                          ? `${item.code ?? "—"} – ${item.item_name ?? "Unnamed"}`
                          : "—";
                      })()}
                    </div>
                    <div>Lot {selectedMoving.lot_number ?? "—"}</div>
                  </dl>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="moved-out-date">Date</Label>
                <div className="grid grid-cols-1">
                  <input
                    id="moved-out-date"
                    type="date"
                    value={movedOutDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => {
                      setMovedOutDate(e.target.value);
                      setMovedOutDateError(null);
                    }}
                    aria-invalid={!!movedOutDateError}
                    className={cn(
                      "h-12 min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50",
                      movedOutDateError && "border-destructive ring-3 ring-destructive/20"
                    )}
                  />
                </div>
                {movedOutDateError && <p className="text-sm text-destructive">{movedOutDateError}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="moved-out-time">Time</Label>
                <div className="relative grid grid-cols-1">
                  <Clock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="moved-out-time"
                    type="time"
                    value={movedOutTime}
                    onChange={(e) => {
                      setMovedOutTime(e.target.value);
                      setMovedOutTimeError(null);
                    }}
                    aria-invalid={!!movedOutTimeError}
                    className={cn(
                      "h-12 min-w-0 rounded-lg border border-input bg-background pl-12 pr-3 text-base outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50",
                      movedOutTimeError && "border-destructive ring-3 ring-destructive/20"
                    )}
                  />
                </div>
                {movedOutTimeError && <p className="text-sm text-destructive">{movedOutTimeError}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Review ────────────────────────────────────────────────────────── */}
        {step === "complete" && submitted && (
          <Card className="border shadow-sm">
            <CardHeader className="items-center text-center">
              <CardTitle className="text-xl">Ready to save</CardTitle>
              <CardDescription>Review the details before confirming.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {confirmError && (
                <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {confirmError}
                </p>
              )}
              <div className="rounded-lg border bg-muted/30 p-4">
                <dl className="flex flex-col gap-4">

                  <ReviewRow label="Direction">
                    {submitted.direction === "in" ? "Moving in" : "Moving out"}
                  </ReviewRow>

                  <Separator />
                  {submitted.direction === "in" ? (
                    <ReviewRow label="PO number">{submitted.poNumber}</ReviewRow>
                  ) : (
                    <>
                      <ReviewRow label="Original PO">{submitted.inPoNumber ?? "—"}</ReviewRow>
                      <Separator />
                      <ReviewRow label="Out PO">{submitted.outPoNumber ?? "—"}</ReviewRow>
                    </>
                  )}

                  {submitted.itemId && (
                    <>
                      <Separator />
                      <ReviewRow label="Item">
                        {submitted.itemCode ?? "—"} – {submitted.itemName ?? "Unnamed"}
                      </ReviewRow>
                    </>
                  )}

                  <Separator />
                  <ReviewRow label="Amount">{submitted.amount}</ReviewRow>

                  {/* Moving in fields */}
                  {submitted.prepDate && (
                    <>
                      <Separator />
                      <ReviewRow label="Prep date">
                        {formatDateStr(submitted.prepDate)}
                        {submitted.prepTime && ` at ${formatTimeStr(submitted.prepTime)}`}
                      </ReviewRow>
                    </>
                  )}
                  {submitted.prepDateIso && !submitted.prepDate && (
                    <>
                      <Separator />
                      <ReviewRow label="Prep date">
                        {formatIsoDateTime(submitted.prepDateIso)}
                      </ReviewRow>
                    </>
                  )}
                  {submitted.bestByDate && submitted.bestByTime && (
                    <>
                      <Separator />
                      <ReviewRow label="Best by">
                        {formatDateTimeStr(submitted.bestByDate, submitted.bestByTime)}
                      </ReviewRow>
                    </>
                  )}
                  {submitted.bestByIso && !submitted.bestByDate && (
                    <>
                      <Separator />
                      <ReviewRow label="Best by">
                        {formatIsoDateTime(submitted.bestByIso)}
                      </ReviewRow>
                    </>
                  )}
                  {submitted.lotNumber && (
                    <>
                      <Separator />
                      <ReviewRow label="Lot number">{submitted.lotNumber}</ReviewRow>
                    </>
                  )}
                  {submitted.storageType && (
                    <>
                      <Separator />
                      <ReviewRow label="Storage">
                        {submitted.storageType === "original_case" ? "Original case" : "Black container"}
                      </ReviewRow>
                    </>
                  )}

                  {/* Moving out fields */}
                  {submitted.movedOutDate && submitted.movedOutTime && (
                    <>
                      <Separator />
                      <ReviewRow label="Moved out">
                        {formatDateTimeStr(submitted.movedOutDate, submitted.movedOutTime)}
                      </ReviewRow>
                    </>
                  )}

                  {submitted.direction === "in" && (
                    <>
                      <Separator />
                      <ReviewRow label="Storage">Freezer</ReviewRow>
                    </>
                  )}
                </dl>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Success ───────────────────────────────────────────────────────── */}
        {step === "saved" && (
          <Card className="border shadow-sm">
            <CardHeader className="items-center text-center">
              <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                <CheckCircle2 className="size-8" />
              </div>
              <CardTitle className="text-xl">{MOVING_SUBMIT_SUCCESS_MESSAGE}</CardTitle>
              <CardDescription>
                Your moving has been recorded and saved to the system.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 border-t bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className={cn("mx-auto flex w-full gap-3", contentMaxWidth)}>
          {showBack && (
            <ActionButton variant="outline" onClick={goBack}>
              <ChevronLeft className="size-4" />
              Back
            </ActionButton>
          )}

          {step === "direction" && (
            <ActionButton onClick={handleDirectionNext}>
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "po" && (
            <ActionButton onClick={handlePoNext}>
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "select" && (
            <ActionButton
              onClick={handleSelectNext}
              disabled={!!movingsLoadError}
            >
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "item" && (
            <ActionButton
              onClick={handleItemNext}
              disabled={isLoadingItems || !!itemsLoadError}
            >
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "amount" && isMovingIn && (
            <ActionButton onClick={handleAmountNext}>
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "details" && (
            <ActionButton onClick={handleDetailsNext}>
              Review <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "complete" && (
            <>
              <ActionButton variant="outline" onClick={handleStartOver} disabled={isSubmitting}>
                Start over
              </ActionButton>
              <ActionButton onClick={handleConfirm} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Confirm"
                )}
              </ActionButton>
            </>
          )}

          {step === "saved" && (
            <ActionButton onClick={handleStartOver}>New moving</ActionButton>
          )}
        </div>
      </footer>
    </div>
  );
}

// ─── Small helper to keep review rows DRY ─────────────────────────────────────

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-base font-semibold">{children}</dd>
                                                                                  </div>
  );
}
