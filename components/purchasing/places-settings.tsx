"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { savePurchasingPlaces } from "@/lib/purchasing/place-actions";
import type { OdooCompany } from "@/lib/purchasing/odoo";
import { usePurchasingConfig } from "@/components/purchasing/config-context";
import {
  Notice,
  SettingsPage,
  primaryButton,
  useConfigRunner,
} from "@/components/settings/shared";
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

/**
 * Which Odoo companies Purchasing reads materials from.
 *
 * Same table as Production → Configuration → Warehouses: one row per
 * place, a switch for include/exclude. The saved selection lives in
 * PurchasingConfigProvider, so Materials and sync use it without a
 * second "currently selected" panel here.
 */
export function PlacesSettings({
  odooCompanies,
  odooError,
}: {
  odooCompanies: OdooCompany[];
  odooError: string | null;
}) {
  const { places: sources } = usePurchasingConfig();
  const { run, pending, notice } = useConfigRunner();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<number[] | null>(null);

  const savedIds = sources.places.map((place) => place.odooCompanyId);
  const allIds = odooCompanies.map((company) => company.id);
  const liveIds = sources.usingFallback ? allIds : savedIds;
  const selected = draft ?? liveIds;

  const dirty = (() => {
    if (!draft) return false;
    return [...draft].sort().join(",") !== [...liveIds].sort().join(",");
  })();

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
    const chosen = odooCompanies.filter((company) =>
      selected.includes(company.id)
    );
    run(
      () =>
        savePurchasingPlaces(
          chosen.map((company) => ({
            odooCompanyId: company.id,
            name: company.name,
          }))
        ),
      "Places updated"
    );
    setDraft(null);
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? odooCompanies.filter((company) =>
          company.name.toLowerCase().includes(needle)
        )
      : odooCompanies;

    return [...filtered].sort((a, b) => {
      const aLive = liveIds.includes(a.id) ? 0 : 1;
      const bLive = liveIds.includes(b.id) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a.name.localeCompare(b.name);
    });
  }, [odooCompanies, query, liveIds]);

  return (
    <SettingsPage intro="Turn a place on to pull its materials into Purchasing. Turn one off and that company's catalog drops out of sync and the Materials page.">
      {sources.tableMissing && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            The places table does not exist yet, so nothing saved here will
            stick. Run the <code>20260904_purchasing_places</code> migration
            first.
          </span>
        </div>
      )}

      {odooError && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Could not read companies from Odoo: {odooError}</span>
        </div>
      )}

      <Notice notice={notice} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places…"
            aria-label="Search places"
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
          Pick at least one place before saving.
        </p>
      )}

      <DataTable>
        <THead
          columns={[
            { label: "Place" },
            { label: "From Odoo" },
            { label: "Include", numeric: true, className: "w-24" },
          ]}
        />
        <TBody>
          {rows.map((company) => {
            const included = selected.includes(company.id);
            const live = liveIds.includes(company.id);
            return (
              <TR
                key={company.id}
                className={live ? "bg-success-muted/40" : undefined}
              >
                <TD strong>{company.name}</TD>
                <TD>
                  {live ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <span className="size-1.5 rounded-[1px] bg-success" />
                      Working now
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
                        setIncluded(company.id, checked === true)
                      }
                      aria-label={`Include ${company.name}`}
                    >
                      <SwitchThumb />
                    </Switch>
                  </div>
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TableEmpty colSpan={3}>
              {odooCompanies.length === 0
                ? "No companies read from Odoo."
                : "No place matches that search."}
            </TableEmpty>
          )}
        </TBody>
      </DataTable>
    </SettingsPage>
  );
}
