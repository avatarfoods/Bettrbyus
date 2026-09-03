"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { saveWipContainerDefault } from "@/lib/production/wip/actions";
import { CONTAINER_LABELS, isContainerLabel } from "@/lib/production/wip/containers";
import type { ContainerDefaultRow } from "@/lib/production/wip/fetch";
import {
  Notice,
  SettingsPage,
  inputClass,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Default container size for every product the floor counts as WIP.
 *
 * Visual language matches the schedule grid: compact rows, small fonts,
 * brand-muted header band, the same border/zebra rules. The two screens
 * sit side by side in people's heads, so they should read the same way.
 */
export function ContainerSizesSettings({
  data,
}: {
  data: { recipes: ContainerDefaultRow[]; missingColumns: boolean };
}) {
  const { run, pending, notice } = useConfigRunner();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.recipes;
    return data.recipes.filter((row) => {
      const hay = `${row.name} ${row.wipCode} ${row.department ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data.recipes, query]);

  const groups = useMemo(() => {
    const map = new Map<string, ContainerDefaultRow[]>();
    for (const row of shown) {
      const key = row.department?.trim() || "No department";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <SettingsPage intro="Usual amount in one container, per product. The count screen starts on this so the floor only taps how many.">
      {data.missingColumns && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            These columns do not exist yet, so nothing saved here will stick.
            Run the <code>20260902_recipe_container_defaults</code> migration
            first.
          </span>
        </div>
      )}
      <Notice notice={notice} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or code…"
          className={cn(inputClass, "pl-8")}
        />
      </div>

      {groups.length === 0 ? (
        <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <Header />
            <tbody>
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {query
                    ? "Nothing matches that search."
                    : "No WIP products to set a size on."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        groups.map(([department, rows]) => (
          <section key={department} className="flex flex-col gap-1">
            {/* Department heading — same spine language as the schedule totals */}
            <div className="flex items-center gap-1.5 px-1 py-0.5">
              <span className="h-3 w-1 shrink-0 rounded-[1px] bg-primary/60" />
              <span className="text-[0.625rem] font-bold tracking-wide text-primary uppercase">
                {department}
              </span>
              <span className="text-[0.5625rem] text-muted-foreground">
                {rows.length}
              </span>
            </div>

            <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <Header />
                <tbody>
                  {rows.map((row, index) => (
                    <DefaultRow
                      key={row.id}
                      row={row}
                      even={index % 2 === 1}
                      disabled={pending || data.missingColumns}
                      onSave={(size, label) =>
                        run(
                          () =>
                            saveWipContainerDefault({
                              recipeId: row.id,
                              size,
                              label,
                            }),
                          `${row.name} default saved`
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </SettingsPage>
  );
}

/** Column header — matches schedule grid: brand-muted, compact, uppercase. */
function Header() {
  return (
    <thead>
      <tr>
        <th
          scope="col"
          className="sticky top-0 z-10 border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
          style={{ width: "4.5rem", minWidth: "4.5rem" }}
        >
          Code
        </th>
        <th
          scope="col"
          className="sticky top-0 z-10 border-b border-border border-l border-l-border/40 bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
        >
          Product
        </th>
        <th
          scope="col"
          className="sticky top-0 z-10 border-b border-border border-l border-l-border/40 bg-brand-muted px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
          style={{ width: "5rem", minWidth: "5rem" }}
        >
          Default size
        </th>
        <th
          scope="col"
          className="sticky top-0 z-10 border-b border-border border-l border-l-border/40 bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
          style={{ width: "6rem", minWidth: "6rem" }}
        >
          Container
        </th>
        <th
          scope="col"
          className="sticky top-0 z-10 border-b border-border border-l border-l-border/40 bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
          style={{ width: "3rem", minWidth: "3rem" }}
        >
          Unit
        </th>
      </tr>
    </thead>
  );
}

function DefaultRow({
  row,
  even,
  disabled,
  onSave,
}: {
  row: ContainerDefaultRow;
  even: boolean;
  disabled: boolean;
  onSave: (size: number | null, label: string) => void;
}) {
  const [size, setSize] = useState(
    row.defaultContainerSize != null ? String(row.defaultContainerSize) : ""
  );
  const [label, setLabel] = useState(row.defaultContainerLabel);

  function parsedSize(): number | null {
    if (size.trim() === "") return null;
    const n = Number(size);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function commit(nextSize = parsedSize(), nextLabel = label) {
    const currentSize = row.defaultContainerSize;
    if (nextSize === currentSize && nextLabel === row.defaultContainerLabel) {
      return;
    }
    if (size.trim() !== "" && nextSize == null) return;
    onSave(nextSize, nextLabel);
  }

  const zebra = even ? "bg-muted/25" : "bg-background";

  return (
    <tr className="group hover:bg-accent/25">
      {/* Code — mono, muted, same as schedule ITEM column */}
      <td
        className={cn(
          "border-b border-border/60 px-2 py-0.5 text-left font-mono text-[0.625rem] text-muted-foreground",
          zebra
        )}
      >
        {row.wipCode || "—"}
      </td>

      {/* Product name — semibold, same size as schedule recipe column */}
      <td
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-left text-[0.8125rem] font-medium text-foreground",
          zebra
        )}
      >
        {row.name}
      </td>

      {/* Default size — compact inline input matching schedule cell density */}
      <td
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-1 py-0.5",
          zebra
        )}
      >
        <input
          value={size}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) =>
            setSize(event.target.value.replace(/[^\d.]/g, ""))
          }
          onBlur={() => commit()}
          placeholder="—"
          aria-label={`Default size for ${row.name}`}
          className="h-6 w-full min-w-0 rounded-sm border-0 bg-transparent px-1.5 text-right text-[0.8125rem] font-semibold tabular-nums text-foreground focus:bg-card focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </td>

      {/* Container type — compact select */}
      <td
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-1 py-0.5",
          zebra
        )}
      >
        <select
          value={label}
          disabled={disabled}
          aria-label={`Container type for ${row.name}`}
          onChange={(event) => {
            const next = event.target.value;
            if (!isContainerLabel(next)) return;
            setLabel(next);
            commit(parsedSize(), next);
          }}
          className="h-6 w-full rounded-sm border-0 bg-transparent px-1 text-[0.6875rem] text-muted-foreground focus:bg-card focus:ring-1 focus:ring-primary focus:outline-none"
        >
          {CONTAINER_LABELS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </td>

      {/* Unit — small uppercase, same as schedule U/M column */}
      <td
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-center text-[0.5625rem] uppercase text-muted-foreground",
          zebra
        )}
      >
        {row.uom ?? "lb"}
      </td>
    </tr>
  );
}
