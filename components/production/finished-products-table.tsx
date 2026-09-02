"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Search } from "lucide-react";
import {
  palletMath,
  specWarnings,
  type FinishedProduct,
} from "@/lib/finished-products/model";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

/**
 * Every finished product with a specification.
 *
 * Cases per pallet and pallet space are shown side by side because they answer
 * different questions — how many pallets to build, and how many warehouse
 * slots to reserve. Conflating them is what put 45 in one sheet and 135 in
 * another.
 */
export function FinishedProductsTable({
  products,
  missingTable,
}: {
  products: FinishedProduct[];
  missingTable: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products
      .map((product) => ({
        product,
        math: palletMath(product),
        warnings: specWarnings(product),
      }))
      .filter((row) => {
        if (onlyIncomplete && row.warnings.length === 0) return false;
        if (!needle) return true;
        return `${row.product.itemCode} ${row.product.name} ${row.product.customerGroup ?? ""}`
          .toLowerCase()
          .includes(needle);
      });
  }, [products, query, onlyIncomplete]);

  if (missingTable) {
    return (
      <div className="px-3 py-4 sm:px-4">
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The specification table does not exist yet. Run the{" "}
            <code>20260828_finished_products</code> migration, then reload.
          </span>
        </div>
      </div>
    );
  }

  const incomplete = rows.filter((row) => row.warnings.length > 0).length;

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/production/finished-products/new"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" />
          New
        </Link>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item or name…"
            aria-label="Search finished products"
            className="h-8 w-full rounded-sm bg-card ring-1 ring-foreground/10 pr-2 pl-8 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setOnlyIncomplete((value) => !value)}
          aria-pressed={onlyIncomplete}
          className={cn(
            "h-8 rounded-md px-2.5 text-sm transition-colors",
            onlyIncomplete
              ? "bg-accent font-medium text-accent-foreground"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          Needs finishing{incomplete > 0 && ` (${incomplete})`}
        </button>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {rows.length} / {products.length}
        </span>
      </div>

      <DataTable>
        <THead
          columns={[
            { label: "Item" },
            { label: "Product" },
            { label: "Group" },
            { label: "Bowls/cs", numeric: true },
            { label: "Cases/pallet", numeric: true },
            { label: "Stack", numeric: true },
            { label: "Cases/space", numeric: true },
            { label: "Shelf life", numeric: true },
            { label: "Status" },
          ]}
        />
        <TBody>
          {rows.map(({ product, math, warnings }) => (
            <TR
              key={product.id}
              onClick={() =>
                router.push(`/production/finished-products/${product.id}`)
              }
            >
              <TD mono muted>
                {product.itemCode}
              </TD>
              <TD strong>{product.name}</TD>
              <TD muted>{product.customerGroup ?? "—"}</TD>
              <TD numeric muted>
                {product.bowlsPerCase ?? "—"}
              </TD>
              <TD numeric strong>
                {math.casesPerPallet ?? "—"}
              </TD>
              <TD numeric muted>
                {product.palletsPerStack > 1 ? `×${product.palletsPerStack}` : "—"}
              </TD>
              <TD numeric>{math.casesPerPalletSpace ?? "—"}</TD>
              <TD numeric muted>
                {product.shelfLifeValue
                  ? `${product.shelfLifeValue} ${product.shelfLifeUnit === "months" ? "mo" : "d"}`
                  : "—"}
              </TD>
              <TD>
                {math.fits === false ? (
                  <span className="inline-flex items-center gap-1 rounded-[1px] bg-destructive/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-destructive">
                    <AlertTriangle className="size-3" />
                    Does not fit
                  </span>
                ) : warnings.length > 0 ? (
                  <span
                    title={warnings.join("\n")}
                    className="inline-flex cursor-help items-center gap-1 rounded-[1px] bg-warning-muted px-2 py-0.5 text-[0.6875rem] font-medium text-warning-foreground"
                  >
                    <AlertTriangle className="size-3" />
                    {warnings.length} to finish
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-[1px] bg-success" />
                    Complete
                  </span>
                )}
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TableEmpty colSpan={9}>
              {products.length === 0
                ? "No specifications yet. Add one for a finished product in Odoo."
                : "Nothing matches."}
            </TableEmpty>
          )}
        </TBody>
      </DataTable>
    </div>
  );
}
