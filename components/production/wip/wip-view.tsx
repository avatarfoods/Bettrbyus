"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  onHandByRecipe,
  type Freshness,
  type WipCount,
} from "@/lib/production/wip/model";
import type { WipRecipeRow } from "@/lib/production/wip/fetch";
import { DateScopePicker } from "@/components/ui/date-scope";
import { scopeToQuery, type DateScope } from "@/lib/date-scope";
import { deleteWipCount } from "@/lib/production/wip/actions";
import { departmentColor } from "@/lib/production/department-colors";
import { SearchPanel } from "@/components/ui/search-panel";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * WIP: what is in the cooler.
 *
 * Every recipe is listed, whether or not anything has been counted, because
 * "nothing counted" is itself worth seeing at four in the morning. Colour
 * carries the age - the point of the page is spotting what has to be used
 * today before it is thrown out - and a row opens to show the lots behind
 * its number.
 */

const FRESHNESS: Record<
  Freshness,
  { dot: string; text: string; label: string }
> = {
  expired: {
    dot: "bg-destructive",
    text: "text-destructive",
    label: "Expired",
  },
  last: { dot: "bg-destructive", text: "text-destructive", label: "Last day" },
  soon: {
    dot: "bg-warning-foreground",
    text: "text-warning-foreground",
    label: "Use soon",
  },
  fresh: { dot: "bg-success", text: "text-muted-foreground", label: "Fresh" },
  unknown: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    label: "No shelf life",
  },
};

function shortUom(uom: string | null): string {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "LBS" || value === "POUND") return "lb";
  if (value === "UNIT" || value === "EACH" || value === "EA") return "ea";
  if (value === "CASE" || value === "CS") return "cs";
  return value.toLowerCase();
}

function fmt(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function shortDate(iso: string | null): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "—";
}

export function WipView({
  recipes,
  counts,
  lineNames,
  today,
  asOf,
  scope,
  departmentColors,
  missingTable,
  windowsMissing,
}: {
  recipes: WipRecipeRow[];
  counts: WipCount[];
  lineNames: string[];
  today: string;
  asOf: string;
  scope: DateScope;
  /** Department name to the colour key chosen in Settings. */
  departmentColors: [string, string | null][];
  missingTable: boolean;
  windowsMissing: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  /** Line and department as pills inside the search field. */
  const [filters, setFilters] = useState<string[]>([]);
  const line = filters.find((id) => id.startsWith("line:"))?.slice(5) ?? "";
  const dept = filters.find((id) => id.startsWith("dept:"))?.slice(5) ?? "";
  /**
   * Opens on what is actually in the cooler.
   *
   * Two hundred rows of "not counted" is a list of everything the plant could
   * make, which is not a question anyone walks up to this page with. Stock is.
   */
  const [show, setShow] = useState<"held" | "attention" | "all">("held");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function removeCount(lot: {
    id: string;
    lotCode: string;
    quantity: number;
  }) {
    const ok = await confirm({
      title: `Remove the ${fmt(lot.quantity)} counted on lot ${lot.lotCode}?`,
      description: "It stops counting towards on hand.",
      confirmLabel: "OK",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setRemovingId(lot.id);
    startTransition(async () => {
      const result = await deleteWipCount({ id: lot.id });
      setRemovingId(null);
      if (result.ok) {
        router.refresh();
        return;
      }
      await confirm({
        title: "Could not remove the count",
        description: result.message,
        confirmLabel: "OK",
        cancelLabel: false,
        tone: "danger",
      });
    });
  }

  const shelfLifeByRecipe = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.shelfLife])),
    [recipes]
  );

  // Ages are judged against the day being asked about. Looking back at the
  // 31st should say what was good on the 31st, not what is good now.
  const onHand = useMemo(
    () => onHandByRecipe(counts, shelfLifeByRecipe, asOf),
    [counts, shelfLifeByRecipe, asOf]
  );

  const departmentsForLine = useMemo(() => {
    const names = new Set<string>();
    for (const recipe of recipes) {
      if (line && recipe.lineName !== line) continue;
      if (recipe.department) names.add(recipe.department);
    }
    return [...names].sort();
  }, [recipes, line]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes
      .filter((r) => !line || r.lineName === line)
      .filter((r) => !dept || r.department === dept)
      .filter((r) =>
        !needle ? true : `${r.wipCode} ${r.name}`.toLowerCase().includes(needle)
      )
      .map((recipe) => ({ recipe, held: onHand.get(recipe.id) ?? null }))
      .filter((row) => {
        if (show === "all") return true;
        if (!row.held) return false;
        if (show === "held") return true;
        return (
          row.held.worst === "expired" ||
          row.held.worst === "last" ||
          row.held.worst === "soon"
        );
      });
  }, [recipes, line, dept, query, show, onHand]);

  /**
   * Rows under a department heading.
   *
   * Two hundred lines sorted by name means hunting for one item by reading;
   * grouped by the room it lives in means you scan to the heading and stop.
   * The Department column comes out - the heading says it.
   */
  /**
   * The colour each department was given in Settings.
   *
   * The same department has to read the same on every page - looking for the
   * green band on the plan and a different green on WIP is worse than no
   * colour at all - so both pages take it from the one place it is set.
   */
  const colours = useMemo(() => {
    const chosen = new Map(departmentColors);
    const order = [...chosen.keys()];
    return (name: string) =>
      departmentColor(
        chosen.get(name),
        order.indexOf(name) >= 0 ? order.indexOf(name) : order.length
      );
  }, [departmentColors]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.recipe.department ?? "No department";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const heldCount = useMemo(
    () =>
      recipes.filter(
        (recipe) =>
          onHand.has(recipe.id) &&
          (!line || recipe.lineName === line) &&
          (!dept || recipe.department === dept)
      ).length,
    [recipes, onHand, line, dept]
  );

  const attention = rows.filter(
    (row) =>
      row.held &&
      (row.held.worst === "expired" ||
        row.held.worst === "last" ||
        row.held.worst === "soon")
  );

  function goScope(next: DateScope) {
    router.push(`/production/wip?${scopeToQuery(next)}`);
  }

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateScopePicker
          label="On hand as of"
          scope={scope}
          onChange={goScope}
          max={today}
          className="mb-0.5"
        />

        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          placeholder="Search recipe or item…"
          aria-label="Search recipes"
          filters={filters}
          onFiltersChange={setFilters}
          filterGroups={[
            {
              exclusive: true,
              items: lineNames.map((name) => ({
                id: `line:${name}`,
                label: name,
              })),
            },
            {
              exclusive: true,
              items: departmentsForLine.map((name) => ({
                id: `dept:${name}`,
                label: name,
              })),
            },
          ].filter((group) => group.items.length > 0)}
          className="mb-0.5 sm:max-w-md"
        />

        <div className="mb-0.5 flex overflow-hidden rounded-md border border-border">
          {(
            [
              ["held", `On hand${heldCount ? ` ${heldCount}` : ""}`],
              ["attention", `Needs using${attention.length ? ` ${attention.length}` : ""}`],
              ["all", "Everything"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setShow(key)}
              aria-pressed={show === key}
              className={cn(
                "h-8 px-2.5 text-sm transition-colors",
                show === key
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Link
          href="/production/wip/count"
          className="mb-0.5 ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <ClipboardCheck className="size-3.5" />
          Count WIP
        </Link>
      </div>

      {missingTable && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>No counts can be recorded yet.</strong> Run the{" "}
            <code>20260830_wip_counts</code> migration.
          </span>
        </div>
      )}

      {windowsMissing && !missingTable && (
        <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          No timing windows are set, so nothing has a shelf life and nothing
          will show red or yellow.
        </p>
      )}

      {attention.length > 0 && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs">
          <strong>{attention.length}</strong>{" "}
          {attention.length === 1 ? "item needs" : "items need"} using or
          throwing —{" "}
          {attention
            .slice(0, 4)
            .map((row) => row.recipe.name)
            .join(", ")}
          {attention.length > 4 && ` and ${attention.length - 4} more`}.
        </p>
      )}

      <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-muted">
              <Th className="w-8" />
              <Th className="w-24">Item #</Th>
              <Th>Recipe</Th>
              <Th numeric className="w-24">
                On hand
              </Th>
              <Th className="w-12">U/M</Th>
              <Th numeric className="w-16">
                Lots
              </Th>
              <Th className="w-28">Oldest</Th>
              <Th className="w-32">State</Th>
              <Th className="w-36">Last counted</Th>
            </tr>
          </thead>
          {groups.map(([department, list]) => (
            <tbody
              key={department}
              className="[&>tr:nth-child(even)]:bg-muted/20"
            >
              <tr>
                <th
                  colSpan={9}
                  className={cn(
                    "border-y border-border px-2 py-1 text-left text-[0.625rem] font-semibold tracking-wider uppercase",
                    colours(department).tint
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "block h-3 w-1 rounded-[1px]",
                        colours(department).dot
                      )}
                    />
                    {department}
                    <span className="font-normal opacity-60">{list.length}</span>
                  </span>
                </th>
              </tr>
              {list.map(({ recipe, held }) => {
                const isOpen = open.has(recipe.id);
                const state = held ? FRESHNESS[held.worst] : null;
                const oldest = held?.lots[0]?.age ?? null;

                return (
                  <FragmentRow
                    key={recipe.id}
                    recipe={recipe}
                    held={held}
                    isOpen={isOpen}
                    state={state}
                    oldest={oldest}
                    tint={colours(department).tint}
                    spine={colours(department).spine}
                    removingId={removingId}
                    onRemove={removeCount}
                    onToggle={() =>
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(recipe.id)) next.delete(recipe.id);
                        else next.add(recipe.id);
                        return next;
                      })
                    }
                  />
                );
              })}
            </tbody>
          ))}

          {groups.length === 0 && (
            <tbody>
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Nothing matches.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      <p className="text-[0.6875rem] text-muted-foreground">
        Showing {rows.length} of {recipes.length}.{" "}
        {scope.kind === "day"
          ? `What was in the cooler on ${asOf}: every count taken on or before that day.`
          : `Lots counted between ${scope.from} and ${scope.to}, aged against ${scope.to}. Lots nobody touched in that span are left out — switch to Day to see everything still on hand.`}{" "}
        Two counts of the same lot both stay on the list and add to on hand.
      </p>
    </div>
  );
}

function FragmentRow({
  recipe,
  held,
  isOpen,
  state,
  oldest,
  onToggle,
  tint,
  spine,
  removingId,
  onRemove,
}: {
  recipe: WipRecipeRow;
  held: ReturnType<typeof onHandByRecipe> extends Map<string, infer V>
    ? V | null
    : never;
  isOpen: boolean;
  state: { dot: string; text: string; label: string } | null;
  oldest: { producedOn: string | null; reason: string } | null;
  onToggle: () => void;
  tint: string;
  spine: string;
  removingId: string | null;
  onRemove: (lot: { id: string; lotCode: string; quantity: number }) => void;
}) {
  return (
    <>
      <tr
        className={cn(held && "cursor-pointer", isOpen && tint)}
        onClick={held ? onToggle : undefined}
      >
        <Td className="relative">
          {/* The department's colour carried down the row, so a block of
              them reads as one place without repeating the name. */}
          <span
            aria-hidden
            className={cn("absolute inset-y-0 left-0 w-0.5", spine)}
          />
          {held ? (
            isOpen ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )
          ) : null}
        </Td>
        <Td className="font-mono text-[0.6875rem] text-muted-foreground">
          {recipe.wipCode}
        </Td>
        <Td className="text-[0.8125rem]">{recipe.name}</Td>
        <Td numeric>
          {held ? (
            /* What is physically there. Stock past its date is still in the
               cooler taking up space, so it counts here and is called out
               beside rather than deducted into a zero. */
            <span className="text-[0.9375rem] font-bold tabular-nums">
              {fmt(held.total)}
              {held.expired > 0.01 && (
                <span
                  title={`${fmt(held.expired)} of it is expired — ${fmt(held.usable)} still usable`}
                  className="ml-1 cursor-help text-[0.625rem] font-normal text-destructive"
                >
                  {fmt(held.expired)} exp
                </span>
              )}
            </span>
          ) : (
            <span className="text-[0.6875rem] text-muted-foreground">
              not counted
            </span>
          )}
        </Td>
        <Td className="text-[0.625rem] text-muted-foreground uppercase">
          {shortUom(recipe.uom)}
        </Td>
        <Td numeric className="text-[0.6875rem] tabular-nums">
          {held ? held.lots.length : "—"}
        </Td>
        <Td className="text-[0.6875rem] tabular-nums text-muted-foreground">
          {shortDate(oldest?.producedOn ?? null)}
        </Td>
        <Td>
          {state ? (
            <span
              title={oldest?.reason}
              className={cn(
                "inline-flex cursor-help items-center gap-1.5 text-[0.6875rem] font-medium",
                state.text
              )}
            >
              <span className={cn("size-1.5 rounded-[1px]", state.dot)} />
              {state.label}
            </span>
          ) : recipe.shelfLife === null ? (
            <span className="text-[0.625rem] text-muted-foreground">
              no window
            </span>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">
              keeps {recipe.shelfLife}d
            </span>
          )}
        </Td>
        <Td className="text-[0.625rem] text-muted-foreground">
          {held?.lastCountedAt
            ? `${shortDate(held.lastCountedAt.slice(0, 10))} ${held.lastCountedAt.slice(11, 16)}${held.lastCountedBy ? ` · ${held.lastCountedBy}` : ""}`
            : "—"}
        </Td>
      </tr>

      {isOpen && held && (
        <tr>
          <td />
          <td colSpan={9} className="border-b border-border bg-card px-2 py-1.5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Lot
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Found
                  </th>
                  <th className="px-2 py-0.5 text-right text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Quantity
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Expires
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Counted by
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {held.lots.map((lot) => {
                  const look = FRESHNESS[lot.age.freshness];
                  return (
                    <tr key={lot.id}>
                      <td className="px-2 py-0.5 font-mono text-[0.6875rem]">
                        {lot.lotCode}
                      </td>
                      <td className="px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                        {lot.containers} × {lot.containerSize}{" "}
                        {lot.containerLabel}
                        {lot.containers === 1 ? "" : "s"}
                        {lot.partialQuantity > 0 &&
                          ` + ${fmt(lot.partialQuantity)} part`}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[0.75rem] font-semibold tabular-nums">
                        {fmt(lot.quantity)}
                      </td>
                      <td className="px-2 py-0.5">
                        <span
                          title={lot.age.reason}
                          className={cn(
                            "inline-flex cursor-help items-center gap-1.5 text-[0.6875rem] tabular-nums",
                            look.text
                          )}
                        >
                          <span
                            className={cn("size-1.5 rounded-[1px]", look.dot)}
                          />
                          {lot.age.expiresOn ?? "—"}
                          {lot.age.daysLeft !== null && (
                            <span className="opacity-70">
                              {lot.age.daysLeft < 0
                                ? `${Math.abs(lot.age.daysLeft)}d over`
                                : lot.age.daysLeft === 0
                                  ? "today"
                                  : `${lot.age.daysLeft}d left`}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-0.5 text-[0.625rem] text-muted-foreground">
                        {lot.countedByName ?? "—"}
                        {lot.note && ` · ${lot.note}`}
                      </td>
                      {/* A miscount keyed at four in the morning is the
                          normal case, and undoing it should not need anyone
                          else. Whoever counted it can remove it. */}
                      <td className="px-1 py-0.5 text-right">
                        <button
                          type="button"
                          disabled={removingId === lot.id}
                          onClick={() =>
                            onRemove({
                              id: lot.id,
                              lotCode: lot.lotCode,
                              quantity: lot.quantity,
                            })
                          }
                          aria-label={`Remove the count for lot ${lot.lotCode}`}
                          title="Remove this count"
                          className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        >
                          {removingId === lot.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}


function Th({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-2 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-primary uppercase",
        numeric ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-2 py-1",
        numeric && "text-right",
        className
      )}
    >
      {children}
    </td>
  );
}
