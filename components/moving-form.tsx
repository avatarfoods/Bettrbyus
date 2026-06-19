"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  Package,
  Snowflake,
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

type Step = "direction" | "item" | "amount" | "details" | "complete";
type Direction = MovingDirectionValues["direction"];

type ItemOption = {
  id: string;
  code: string | null;
  item_name: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepsFor(direction: Direction | null): Step[] {
  return direction === "in"
    ? ["direction", "item", "amount", "details"]
    : ["direction", "amount", "details"];
}

function formatDateStr(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function formatDateTimeStr(dateStr: string, timeStr: string) {
  try {
    return format(parseISO(`${dateStr}T${timeStr}`), "MMM d, yyyy · h:mm a");
  } catch {
    return `${dateStr} ${timeStr}`;
  }
}

// ─── Mobile-safe button ───────────────────────────────────────────────────────

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
      style={{ touchAction: "manipulation" }}
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

  // Amount
  const [amount, setAmount] = useState("");

  // Moving-in details
  const [prepDate, setPrepDate] = useState("");
  const [bestByDate, setBestByDate] = useState("");
  const [bestByTime, setBestByTime] = useState("");
  const [lotNumber, setLotNumber] = useState("");

  // Moving-out date/time
  const [movedOutDate, setMovedOutDate] = useState("");
  const [movedOutTime, setMovedOutTime] = useState("");

  // Errors
  const [directionError, setDirectionError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [prepDateError, setPrepDateError] = useState<string | null>(null);
  const [bestByDateError, setBestByDateError] = useState<string | null>(null);
  const [bestByTimeError, setBestByTimeError] = useState<string | null>(null);
  const [lotNumberError, setLotNumberError] = useState<string | null>(null);
  const [movedOutDateError, setMovedOutDateError] = useState<string | null>(null);
  const [movedOutTimeError, setMovedOutTimeError] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState<MovingFormData | null>(null);

  // Progress
  const inputSteps = stepsFor(step === "item" ? "in" : direction);
  const displayStep =
    step === "complete" ? inputSteps.length : inputSteps.indexOf(step) + 1;
  const progressValue =
    step === "complete"
      ? 100
      : ((inputSteps.indexOf(step) + 1) / inputSteps.length) * 100;

  const isMovingIn = direction === "in";
  const selectedItem = items.find((i) => i.id === itemId);

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
        .select("id, code, item_name")
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
    setStep(result.data.direction === "in" ? "item" : "amount");
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

  function handleDetailsNext() {
    if (!direction) return;

    if (isMovingIn) {
      const result = movingInDetailsSchema.safeParse({
        prepDate,
        bestByDate,
        bestByTime,
        lotNumber,
      });
      if (!result.success) {
        const issues = result.error.issues;
        setPrepDateError(issues.find((i) => i.path[0] === "prepDate")?.message ?? null);
        setBestByDateError(issues.find((i) => i.path[0] === "bestByDate")?.message ?? null);
        setBestByTimeError(issues.find((i) => i.path[0] === "bestByTime")?.message ?? null);
        setLotNumberError(issues.find((i) => i.path[0] === "lotNumber")?.message ?? null);
        return;
      }
      setPrepDateError(null);
      setBestByDateError(null);
      setBestByTimeError(null);
      setLotNumberError(null);
      setSubmitted({
        direction,
        itemId: selectedItem?.id,
        itemCode: selectedItem?.code,
        itemName: selectedItem?.item_name,
        amount: Number(amount),
        prepDate: result.data.prepDate,
        bestByDate: result.data.bestByDate,
        bestByTime: result.data.bestByTime,
        lotNumber: result.data.lotNumber,
      });
    } else {
      const result = movingOutDateTimeSchema.safeParse({ movedOutDate, movedOutTime });
      if (!result.success) {
        const issues = result.error.issues;
        setMovedOutDateError(issues.find((i) => i.path[0] === "movedOutDate")?.message ?? null);
        setMovedOutTimeError(issues.find((i) => i.path[0] === "movedOutTime")?.message ?? null);
        return;
      }
      setMovedOutDateError(null);
      setMovedOutTimeError(null);
      setSubmitted({
        direction,
        amount: Number(amount),
        movedOutDate: result.data.movedOutDate,
        movedOutTime: result.data.movedOutTime,
      });
    }

    setStep("complete");
  }

  function handleStartOver() {
    setStep("direction");
    setDirection(null);
    setItemId("");
    setAmount("");
    setPrepDate("");
    setBestByDate("");
    setBestByTime("");
    setLotNumber("");
    setMovedOutDate("");
    setMovedOutTime("");
    setDirectionError(null);
    setItemError(null);
    setItemsLoadError(null);
    setAmountError(null);
    setPrepDateError(null);
    setBestByDateError(null);
    setBestByTimeError(null);
    setLotNumberError(null);
    setMovedOutDateError(null);
    setMovedOutTimeError(null);
    setSubmitted(null);
  }

  function goBack() {
    if (step === "item") setStep("direction");
    else if (step === "amount") setStep(isMovingIn ? "item" : "direction");
    else if (step === "details") setStep("amount");
  }

  const showBack = step === "item" || step === "amount" || step === "details";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Snowflake className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">
                Step {displayStep} of {inputSteps.length}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {step === "direction" && "Direction"}
                {step === "item" && "Select item"}
                {step === "amount" && "Amount"}
                {step === "details" && (isMovingIn ? "Details" : "Date & time")}
                {step === "complete" && "Review"}
              </h1>
            </div>
          </div>
          <Progress value={progressValue}>
            <ProgressTrack className="h-1.5">
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">

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
                    Icon: ArrowDownToLine,
                  },
                  {
                    value: "out" as Direction,
                    label: "Moving out",
                    description: "Protein is leaving the freezer",
                    Icon: ArrowUpFromLine,
                  },
                ] as const
              ).map(({ value, label, description, Icon }) => {
                const isSelected = direction === value;
                return (
                  <label
                    key={value}
                    style={{ touchAction: "manipulation" }}
                    className={cn(
                      "flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-input hover:bg-muted/50 active:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="direction"
                      value={value}
                      checked={isSelected}
                      onChange={() => {
                        setDirection(value);
                        setDirectionError(null);
                      }}
                      className="sr-only"
                    />
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
                  </label>
                );
              })}
              {directionError && (
                <p className="text-sm text-destructive">{directionError}</p>
              )}
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
        {step === "amount" && (
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
                {[5, 10, 25].map((v) => (
                  <button
                    key={v}
                    type="button"
                    style={{ touchAction: "manipulation" }}
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
                Enter the prep date, best by date and time, and lot number.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Prep date */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="prep-date">Prep date</Label>
                <Input
                  id="prep-date"
                  type="date"
                  value={prepDate}
                  onChange={(e) => {
                    setPrepDate(e.target.value);
                    setPrepDateError(null);
                  }}
                  aria-invalid={!!prepDateError}
                  className={cn(
                    "h-12 text-base",
                    prepDateError && "border-destructive ring-3 ring-destructive/20"
                  )}
                />
                {prepDateError && <p className="text-sm text-destructive">{prepDateError}</p>}
              </div>

              {/* Best by date */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="best-by-date">Best by — date</Label>
                <Input
                  id="best-by-date"
                  type="date"
                  value={bestByDate}
                  onChange={(e) => {
                    setBestByDate(e.target.value);
                    setBestByDateError(null);
                  }}
                  aria-invalid={!!bestByDateError}
                  className={cn(
                    "h-12 text-base",
                    bestByDateError && "border-destructive ring-3 ring-destructive/20"
                  )}
                />
                {bestByDateError && <p className="text-sm text-destructive">{bestByDateError}</p>}
              </div>

              {/* Best by time */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="best-by-time">Best by — time</Label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="best-by-time"
                    type="time"
                    value={bestByTime}
                    onChange={(e) => {
                      setBestByTime(e.target.value);
                      setBestByTimeError(null);
                    }}
                    aria-invalid={!!bestByTimeError}
                    className={cn(
                      "h-12 pl-12 text-base",
                      bestByTimeError && "border-destructive ring-3 ring-destructive/20"
                    )}
                  />
                </div>
                {bestByTimeError && <p className="text-sm text-destructive">{bestByTimeError}</p>}
              </div>

              {/* Lot number */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="lot-number">Lot number</Label>
                <Input
                  id="lot-number"
                  type="text"
                  inputMode="text"
                  placeholder="e.g. LOT-2024-001"
                  value={lotNumber}
                  onChange={(e) => {
                    setLotNumber(e.target.value);
                    setLotNumberError(null);
                  }}
                  aria-invalid={!!lotNumberError}
                  className={cn(
                    "h-12 text-base",
                    lotNumberError && "border-destructive ring-3 ring-destructive/20"
                  )}
                />
                {lotNumberError && <p className="text-sm text-destructive">{lotNumberError}</p>}
              </div>
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
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="moved-out-date">Date</Label>
                <Input
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
                    "h-12 text-base",
                    movedOutDateError && "border-destructive ring-3 ring-destructive/20"
                  )}
                />
                {movedOutDateError && <p className="text-sm text-destructive">{movedOutDateError}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="moved-out-time">Time</Label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="moved-out-time"
                    type="time"
                    value={movedOutTime}
                    onChange={(e) => {
                      setMovedOutTime(e.target.value);
                      setMovedOutTimeError(null);
                    }}
                    aria-invalid={!!movedOutTimeError}
                    className={cn(
                      "h-12 pl-12 text-base",
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
              <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                <CheckCircle2 className="size-8" />
              </div>
              <CardTitle className="text-xl">Ready to save</CardTitle>
              <CardDescription>Review the details before confirming.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <dl className="flex flex-col gap-4">

                  <ReviewRow label="Direction">
                    {submitted.direction === "in" ? "Moving in" : "Moving out"}
                  </ReviewRow>

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
                  {submitted.lotNumber && (
                    <>
                      <Separator />
                      <ReviewRow label="Lot number">{submitted.lotNumber}</ReviewRow>
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

                  <Separator />
                  <ReviewRow label="Storage">Freezer</ReviewRow>
                </dl>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 border-t bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-lg gap-3">
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

          {step === "item" && (
            <ActionButton
              onClick={handleItemNext}
              disabled={isLoadingItems || !!itemsLoadError}
            >
              Next <ArrowRight className="size-4" />
            </ActionButton>
          )}

          {step === "amount" && (
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
              <ActionButton variant="outline" onClick={handleStartOver}>
                Start over
              </ActionButton>
              <ActionButton onClick={() => {}}>Confirm</ActionButton>
            </>
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
