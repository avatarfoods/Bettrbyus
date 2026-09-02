"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Search } from "lucide-react";
import { saveProductionWarehouses } from "@/lib/production/config-actions";
import {
  DELIVERY_PICKING_TYPE_IDS,
  FALLBACK_WAREHOUSES,
} from "@/lib/odoo/constants";
import type { OdooWarehouse } from "@/lib/odoo/orders";
import type { WarehouseSources } from "@/lib/production/warehouses";
import {
  Notice,
  SettingsPage,
  primaryButton,
  useConfigRunner,
} from "@/components/production/settings/shared";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type LiveWarehouse = {
  id: number | null;
  name: string;
  location: string;
};

/**
 * Which Odoo warehouses feed Planning → Orders.
 *
 * The table is the same idea as Odoo's warehouse list: one row per warehouse,
 * columns lined up, a switch for include/exclude. The band at the top names
 * what the order schedule is actually reading right now, so nobody has to
 * scan the table to answer "are we on Avatar?".
 */
export function WarehousesSettings({
  sources,
  odooWarehouses,
  odooError,
}: {
  sources: WarehouseSources;
  odooWarehouses: OdooWarehouse[];
  odooError: string | null;
}) {
  const { run, pending, notice } = useConfigRunner();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<number[] | null>(null);

  const savedIds = sources.warehouses.map((warehouse) => warehouse.odooId);
  const fallbackIds = odooWarehouses
    .filter((warehouse) =>
      (DELIVERY_PICKING_TYPE_IDS as readonly number[]).includes(
        warehouse.pickingTypeId
      )
    )
    .map((warehouse) => warehouse.id);

  const liveIds = sources.usingFallback ? fallbackIds : savedIds;
  const selected = draft ?? liveIds;

  const dirty = (() => {
    if (!draft) return false;
    return [...draft].sort().join(",") !== [...liveIds].sort().join(",");
  })();

  const liveWarehouses = useMemo<LiveWarehouse[]>(() => {
    if (odooWarehouses.length > 0 && liveIds.length > 0) {
      const wanted = new Set(liveIds);
      return odooWarehouses
        .filter((warehouse) => wanted.has(warehouse.id))
        .map((warehouse) => ({
          id: warehouse.id,
          name: warehouse.name,
          location: warehouse.stockLocationName ?? warehouse.code ?? "—",
        }));
    }

    if (!sources.usingFallback && sources.warehouses.length > 0) {
      return sources.warehouses.map((warehouse) => ({
        id: warehouse.odooId,
        name: warehouse.name,
        location: warehouse.code ?? "—",
      }));
    }

    return FALLBACK_WAREHOUSES.map((warehouse) => ({
      id: null,
      name: warehouse.name,
      location: warehouse.location,
    }));
  }, [liveIds, odooWarehouses, sources]);

  function setIncluded(id: number, included: boolean) {
    setDraft((prev) => {
      const current = prev ?? liveIds;
      if (included) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((value) => value !== id);
    });
  }

  function save() {
    const chosen = odooWarehouses.filter((warehouse) =>
      selected.includes(warehouse.id)
    );
    run(
      () =>
        saveProductionWarehouses(
          chosen.map((warehouse) => ({
            odooId: warehouse.id,
            name: warehouse.name,
            code: warehouse.code,
            pickingTypeId: warehouse.pickingTypeId,
            stockLocationId: warehouse.stockLocationId,
          }))
        ),
      "Warehouses updated"
    );
    setDraft(null);
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? odooWarehouses.filter((warehouse) =>
          `${warehouse.name} ${warehouse.code ?? ""} ${warehouse.stockLocationName ?? ""}`
            .toLowerCase()
            .includes(needle)
        )
      : odooWarehouses;

    return [...filtered].sort((a, b) => {
      const aLive = liveIds.includes(a.id) ? 0 : 1;
      const bLive = liveIds.includes(b.id) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a.id - b.id;
    });
  }, [odooWarehouses, query, liveIds]);

  return (
    <SettingsPage intro="Turn a warehouse on to pull its outgoing deliveries onto the order schedule. Turn one off and both its orders and its stock drop out of the plan.">
      {sources.tableMissing && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            The warehouses table does not exist yet, so nothing saved here will
            stick. Run the <code>20260901_production_warehouses</code> migration
            first.
          </span>
        </div>
      )}

      {odooError && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Could not read warehouses from Odoo: {odooError}</span>
        </div>
      )}

      <Notice notice={notice} />

      <section className="rounded-sm bg-card ring-1 ring-foreground/10">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="size-1.5 rounded-[1px] bg-success" />
          <h2 className="text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
            Pulling from Odoo now
          </h2>
        </header>
        <ul className="divide-y divide-border">
          {liveWarehouses.map((warehouse) => (
            <li
              key={warehouse.id ?? warehouse.name}
              className="grid grid-cols-1 items-baseline gap-x-6 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_12rem]"
            >
              <span className="truncate font-medium">{warehouse.name}</span>
              <span className="font-mono text-xs text-muted-foreground sm:text-right">
                {warehouse.location}
              </span>
            </li>
          ))}
          {liveWarehouses.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              No warehouse is selected. The order schedule will be empty.
            </li>
          )}
        </ul>
      </section>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search warehouses…"
            aria-label="Search warehouses"
            className="h-8 w-full rounded-sm bg-card ring-1 ring-foreground/10 pr-2 pl-8 text-sm"
          />
        </div>
        {dirty && (
          <button
            type="button"
            disabled={pending || selected.length === 0 || sources.tableMissing}
            onClick={save}
            className={cn(primaryButton, "ml-auto")}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </button>
        )}
      </div>

      {selected.length === 0 && dirty && (
        <p className="text-xs text-warning-foreground">
          Pick at least one warehouse before saving.
        </p>
      )}

      <DataTable>
        <THead
          columns={[
            { label: "Warehouse" },
            { label: "Location stock" },
            { label: "Company" },
            { label: "From Odoo" },
            { label: "Include", numeric: true, className: "w-24" },
          ]}
        />
        <TBody>
          {rows.map((warehouse) => {
            const included = selected.includes(warehouse.id);
            const live = liveIds.includes(warehouse.id);
            return (
              <TR key={warehouse.id} className={live ? "bg-success-muted/40" : undefined}>
                <TD strong>{warehouse.name}</TD>
                <TD mono muted>
                  {warehouse.stockLocationName ?? warehouse.code ?? "—"}
                </TD>
                <TD muted>{warehouse.companyName ?? "—"}</TD>
                <TD>
                  {live ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <span className="size-1.5 rounded-[1px] bg-success" />
                      Pulling now
                    </span>
                  ) : included ? (
                    <span className="text-xs text-muted-foreground">
                      After save
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Off</span>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end">
                    <Switch
                      checked={included}
                      onCheckedChange={(checked) =>
                        setIncluded(warehouse.id, checked === true)
                      }
                      aria-label={`Include ${warehouse.name}`}
                    >
                      <SwitchThumb />
                    </Switch>
                  </div>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TableEmpty colSpan={5}>
              {odooWarehouses.length === 0
                ? "No warehouses read from Odoo."
                : "No warehouse matches that search."}
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {liveWarehouses.length > 0 && !dirty && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5 text-success" />
          The order schedule is reading {liveWarehouses.length === 1 ? "this warehouse" : "these warehouses"} from Odoo.
        </p>
      )}
    </SettingsPage>
  );
}
