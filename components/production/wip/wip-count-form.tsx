"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { saveWipCount } from "@/lib/production/wip/actions";
import { ageLot, dateToLot, lotToDate } from "@/lib/production/wip/model";
import type { WipRecipeRow } from "@/lib/production/wip/fetch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * WIP Count, as used on a phone at four in the morning.
 *
 * The list is what was scheduled the day before, not all 199 recipes, so it
 * is ten or fifteen lines rather than a walk through the whole cooler.
 *
 * Nobody weighs. They count buckets of a known size, so the fields are "how
 * many" and "how big" and the app multiplies - arithmetic done half asleep is
 * where a wrong number comes from.
 *
 * One line per lot, because five buckets are not necessarily one lot, and a
 * single expiry cannot describe a mixed pile. The lot is a date, so it also
 * tells the app which day the stock came from.
 */

type Draft = {
  key: string;
  lotCode: string;
  containers: string;
  containerSize: string;
  containerLabel: string;
  note: string;
};

const CONTAINERS = ["bucket", "cart", "pan", "bin", "case", "bag"];

function blankLot(defaultLot: string): Draft {
  return {
    key: Math.random().toString(36).slice(2),
    lotCode: defaultLot,
    containers: "",
    containerSize: "",
    containerLabel: "bucket",
    note: "",
  };
}

export function WipCountForm({
  recipes,
  listedIds,
  planned,
  today,
  yesterday,
  missingTable,
}: {
  recipes: WipRecipeRow[];
  /** What was scheduled the day being counted. */
  listedIds: string[];
  planned: Record<string, number>;
  today: string;
  yesterday: string;
  missingTable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  // The scheduled list, plus anything added by hand for a batch nobody asked
  // for - which happens, and would otherwise go unrecorded.
  const [shown, setShown] = useState<string[]>(listedIds);
  const [lots, setLots] = useState<Record<string, Draft[]>>(() =>
    Object.fromEntries(listedIds.map((id) => [id, [blankLot(dateToLot(yesterday))]]))
  );

  function update(recipeId: string, key: string, patch: Partial<Draft>) {
    setLots((prev) => ({
      ...prev,
      [recipeId]: (prev[recipeId] ?? []).map((lot) =>
        lot.key === key ? { ...lot, ...patch } : lot
      ),
    }));
  }

  function addLot(recipeId: string) {
    setLots((prev) => ({
      ...prev,
      [recipeId]: [...(prev[recipeId] ?? []), blankLot(dateToLot(yesterday))],
    }));
  }

  function removeLot(recipeId: string, key: string) {
    setLots((prev) => ({
      ...prev,
      [recipeId]: (prev[recipeId] ?? []).filter((lot) => lot.key !== key),
    }));
  }

  function addRecipe(recipeId: string) {
    if (shown.includes(recipeId)) return;
    setShown((prev) => [...prev, recipeId]);
    setLots((prev) => ({
      ...prev,
      [recipeId]: [blankLot(dateToLot(yesterday))],
    }));
    setAdding(false);
  }

  /** Only lots with a real quantity are worth sending. */
  const ready = useMemo(() => {
    const out: {
      recipeId: string;
      lotCode: string;
      containers: number;
      containerSize: number;
      containerLabel: string;
      note: string | null;
    }[] = [];

    for (const recipeId of shown) {
      for (const lot of lots[recipeId] ?? []) {
        const containers = Number(lot.containers);
        const size = Number(lot.containerSize);
        if (!Number.isFinite(containers) || containers <= 0) continue;
        if (!Number.isFinite(size) || size <= 0) continue;
        out.push({
          recipeId,
          lotCode: lot.lotCode.trim(),
          containers,
          containerSize: size,
          containerLabel: lot.containerLabel,
          note: lot.note.trim() || null,
        });
      }
    }
    return out;
  }, [shown, lots]);

  function submit() {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await saveWipCount({ lots: ready });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(`Recorded ${result.saved} lots. Thank you.`);
      router.push("/production/wip");
      router.refresh();
    });
  }

  const notShown = recipes.filter((r) => !shown.includes(r.id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 px-3 py-3 sm:px-4">
      <div className="rounded-md bg-brand-muted px-3 py-2">
        <p className="text-sm font-semibold text-primary">
          Counting {yesterday}&rsquo;s production
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {listedIds.length > 0
            ? `${listedIds.length} items were scheduled. Count what you find — one line per lot number.`
            : "Nothing was scheduled that day. Add whatever you find below."}
        </p>
      </div>

      {missingTable && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Counts cannot be saved yet.</strong> Run the{" "}
            <code>20260830_wip_counts</code> migration.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm">{notice}</p>
      )}

      {shown.map((recipeId) => {
        const recipe = byId.get(recipeId);
        if (!recipe) return null;
        const want = planned[recipeId] ?? 0;
        const found = (lots[recipeId] ?? []).reduce((sum, lot) => {
          const c = Number(lot.containers);
          const s = Number(lot.containerSize);
          return sum + (Number.isFinite(c) && Number.isFinite(s) ? c * s : 0);
        }, 0);
        const short = want - found;

        return (
          <section
            key={recipeId}
            className="rounded-md bg-card ring-1 ring-foreground/10"
          >
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border px-3 py-2">
              <span className="font-mono text-[0.6875rem] text-muted-foreground">
                {recipe.wipCode}
              </span>
              <h2 className="text-[0.9375rem] font-semibold">{recipe.name}</h2>
              {want > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  asked for{" "}
                  <strong className="text-foreground tabular-nums">
                    {want.toLocaleString()}
                  </strong>
                </span>
              )}
            </header>

            <div className="flex flex-col gap-2 px-3 py-2">
              {(lots[recipeId] ?? []).map((lot) => {
                const age =
                  lot.lotCode.trim().length > 0
                    ? ageLot(lot.lotCode, recipe.shelfLife, today)
                    : null;
                const badLot =
                  lot.lotCode.trim().length > 0 && lotToDate(lot.lotCode) === null;

                return (
                  <div
                    key={lot.key}
                    className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2"
                  >
                    <Field label="How many" className="w-24">
                      <Stepper
                        value={lot.containers}
                        onChange={(v) => update(recipeId, lot.key, { containers: v })}
                      />
                    </Field>

                    <Field label="Each holds" className="w-20">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={lot.containerSize}
                        onChange={(e) =>
                          update(recipeId, lot.key, { containerSize: e.target.value })
                        }
                        placeholder="50"
                        aria-label="Container size"
                        className="h-10 w-full rounded-md border border-border bg-card px-2 text-right text-base tabular-nums"
                      />
                    </Field>

                    <Field label="Of" className="w-24">
                      <select
                        value={lot.containerLabel}
                        onChange={(e) =>
                          update(recipeId, lot.key, { containerLabel: e.target.value })
                        }
                        aria-label="Container type"
                        className="h-10 w-full rounded-md border border-border bg-card px-1.5 text-sm"
                      >
                        {CONTAINERS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Lot number" className="w-32">
                      <input
                        inputMode="numeric"
                        value={lot.lotCode}
                        onChange={(e) =>
                          update(recipeId, lot.key, { lotCode: e.target.value })
                        }
                        placeholder="MMDDYYYY"
                        aria-label="Lot number"
                        className={cn(
                          "h-10 w-full rounded-md border bg-card px-2 text-base tabular-nums",
                          badLot ? "border-destructive" : "border-border"
                        )}
                      />
                    </Field>

                    <div className="min-w-32 flex-1 pb-1 text-xs">
                      {badLot ? (
                        <span className="text-destructive">
                          Lots are MMDDYYYY — the day it was made
                        </span>
                      ) : age ? (
                        <span
                          title={age.reason}
                          className={cn(
                            "cursor-help",
                            age.freshness === "expired" || age.freshness === "last"
                              ? "font-medium text-destructive"
                              : age.freshness === "soon"
                                ? "font-medium text-warning-foreground"
                                : "text-muted-foreground"
                          )}
                        >
                          {age.expiresOn
                            ? `expires ${age.expiresOn}${
                                age.daysLeft === null
                                  ? ""
                                  : age.daysLeft < 0
                                    ? ` · ${Math.abs(age.daysLeft)}d over`
                                    : age.daysLeft === 0
                                      ? " · last day"
                                      : ` · ${age.daysLeft}d left`
                              }`
                            : "no shelf life set"}
                        </span>
                      ) : null}
                    </div>

                    {(lots[recipeId]?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLot(recipeId, lot.key)}
                        aria-label="Remove this lot"
                        className="mb-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addLot(recipeId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  <Plus className="size-3.5" />
                  Another lot
                </button>

                {found > 0 && (
                  <span className="ml-auto text-xs">
                    found{" "}
                    <strong className="text-[0.9375rem] tabular-nums">
                      {found.toLocaleString()}
                    </strong>
                    {want > 0 && short > 0.01 && (
                      <span className="ml-2 font-medium text-destructive tabular-nums">
                        {short.toLocaleString()} short
                      </span>
                    )}
                    {want > 0 && short < -0.01 && (
                      <span className="ml-2 text-muted-foreground tabular-nums">
                        {Math.abs(short).toLocaleString()} over
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground hover:bg-muted"
      >
        <Plus className="size-4" />
        Something else was made
      </button>

      <div className="sticky bottom-0 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <button
          type="button"
          onClick={submit}
          disabled={pending || ready.length === 0 || missingTable}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {ready.length === 0
            ? "Nothing counted yet"
            : `Record ${ready.length} ${ready.length === 1 ? "lot" : "lots"}`}
        </button>
      </div>

      <AddRecipeDialog
        open={adding}
        onOpenChange={setAdding}
        recipes={notShown}
        onPick={addRecipe}
      />
    </div>
  );
}

/** Big buttons, because this is used with cold hands on a phone. */
function Stepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const current = Number(value || 0);
  return (
    <span className="flex h-10 items-center rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, current - 1)))}
        aria-label="One fewer"
        className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label="How many containers"
        className="w-full min-w-0 bg-transparent text-center text-base font-semibold tabular-nums focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(String(current + 1))}
        aria-label="One more"
        className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function AddRecipeDialog({
  open,
  onOpenChange,
  recipes,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipes: WipRecipeRow[];
  onPick: (recipeId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recipes.slice(0, 50);
    return recipes
      .filter((r) => `${r.wipCode} ${r.name}`.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [recipes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Count something else</DialogTitle>
          <DialogDescription>
            For a batch nobody asked for, or a substitute. It gets counted the
            same way.
          </DialogDescription>
        </DialogHeader>

        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search recipes"
            autoFocus
            className="h-11 w-full bg-transparent pr-4 pl-10 text-sm focus:outline-none"
          />
        </div>

        <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
          {matches.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                onClick={() => onPick(recipe.id)}
                className="flex w-full items-baseline gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span className="w-20 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                  {recipe.wipCode}
                </span>
                <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                  {recipe.department}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing matches.
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
