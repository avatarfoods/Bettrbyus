"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ExternalLink, Loader2, Snowflake } from "lucide-react";
import {
  getProductDetail,
  type ProductDetailResult,
} from "@/lib/purchasing/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PurchasingProductDetailDialogProps = {
  materialId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy h:mm a");
  } catch {
    return value;
  }
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-border/60 py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}

export function PurchasingProductDetailDialog({
  materialId,
  open,
  onOpenChange,
}: PurchasingProductDetailDialogProps) {
  const [result, setResult] = useState<Extract<ProductDetailResult, { ok: true }> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();

  useEffect(() => {
    if (!open || !materialId) return;

    let active = true;

    startLoad(async () => {
      const detail = await getProductDetail(materialId);
      if (!active) return;
      if (!detail.ok) {
        setError(detail.message);
        setResult(null);
        return;
      }
      setError(null);
      setResult(detail);
    });

    return () => {
      active = false;
    };
  }, [open, materialId]);

  const material = result?.material;
  const odoo = result?.odoo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="font-mono text-sm text-muted-foreground">
              {material?.item_code ?? "…"}
            </span>
            <span className="truncate">
              {material?.name ?? (isLoading ? "Loading…" : "Product")}
            </span>
            {material?.is_protein && (
              <Snowflake className="size-4 shrink-0 text-sky-500" aria-label="Protein" />
            )}
          </DialogTitle>
          <DialogDescription>
            Live inventory and product fields from Odoo, plus purchasing settings
            from TMS.
          </DialogDescription>
        </DialogHeader>

        {isLoading && !result ? (
          <div className="flex min-h-32 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : material ? (
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From Odoo
              </h3>
              {result?.odooError && (
                <p className="mb-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  {result.odooError}
                </p>
              )}
              {odoo ? (
                <dl>
                  <DetailRow label="Name" value={odoo.display_name ?? odoo.name} />
                  <DetailRow label="Internal ref" value={odoo.default_code ?? "—"} />
                  <DetailRow label="Barcode" value={odoo.barcode ?? "—"} />
                  <DetailRow label="Category" value={odoo.categ_id?.[1] ?? "—"} />
                  <DetailRow
                    label="Vendor"
                    value={
                      odoo.vendors.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {odoo.vendors.map((vendor, index) => (
                            <li key={vendor.id}>
                              <span className="font-medium">{vendor.name}</span>
                              {index === 0 && odoo.vendors.length > 1 && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  (primary)
                                </span>
                              )}
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                {[
                                  vendor.productCode
                                    ? `Vendor code ${vendor.productCode}`
                                    : null,
                                  vendor.price != null
                                    ? `$${formatNumber(vendor.price)}`
                                    : null,
                                  vendor.minQty != null
                                    ? `min ${formatNumber(vendor.minQty)}`
                                    : null,
                                  vendor.delayDays != null
                                    ? `${vendor.delayDays}d lead`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "No price list details"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )
                    }
                  />
                  <DetailRow label="Type" value={odoo.type ?? "—"} />
                  <DetailRow label="UoM" value={odoo.uom_id?.[1] ?? "—"} />
                  <DetailRow label="Purchase UoM" value={odoo.uom_po_id?.[1] ?? "—"} />
                  <DetailRow
                    label="On hand"
                    value={formatNumber(odoo.qty_available)}
                  />
                  <DetailRow
                    label="Forecasted"
                    value={formatNumber(odoo.virtual_available)}
                  />
                  <DetailRow
                    label="Incoming"
                    value={formatNumber(odoo.incoming_qty)}
                  />
                  <DetailRow
                    label="Outgoing"
                    value={formatNumber(odoo.outgoing_qty)}
                  />
                  <DetailRow
                    label="Cost"
                    value={
                      odoo.standard_price != null
                        ? `$${formatNumber(odoo.standard_price)}`
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Sales price"
                    value={
                      odoo.list_price != null
                        ? `$${formatNumber(odoo.list_price)}`
                        : "—"
                    }
                  />
                  <DetailRow label="Weight" value={formatNumber(odoo.weight)} />
                  <DetailRow
                    label="Active"
                    value={odoo.active ? "Yes" : "Archived"}
                  />
                  <DetailRow
                    label="Last write"
                    value={formatDateTime(odoo.write_date)}
                  />
                  {odoo.description_purchase && (
                    <DetailRow
                      label="Purchase notes"
                      value={odoo.description_purchase}
                    />
                  )}
                </dl>
              ) : (
                !result?.odooError && (
                  <p className="text-sm text-muted-foreground">No Odoo data.</p>
                )
              )}
              {result?.odooFormUrl && (
                <a
                  href={result.odooFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open in Odoo
                  <ExternalLink className="size-3" />
                </a>
              )}
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Purchasing settings (TMS)
              </h3>
              <dl>
                <DetailRow
                  label="Storage"
                  value={material.storage_type ?? "—"}
                />
                <DetailRow
                  label="Lbs / case"
                  value={formatNumber(material.lbs_per_case)}
                />
                <DetailRow
                  label="Lead time"
                  value={`${material.lead_time_days} days`}
                />
                <DetailRow
                  label="Thaw buffer"
                  value={
                    material.is_protein
                      ? `${material.thaw_buffer_days} days`
                      : "—"
                  }
                />
                <DetailRow
                  label="Protein"
                  value={material.is_protein ? "Yes" : "No"}
                />
                <DetailRow
                  label="App on hand"
                  value={
                    material.on_hand != null
                      ? `${formatNumber(material.on_hand)} (${material.on_hand_source ?? "—"})`
                      : "—"
                  }
                />
                <DetailRow
                  label="On-hand synced"
                  value={formatDateTime(material.on_hand_fetched_at)}
                />
                <DetailRow
                  label="Local price"
                  value={
                    material.price != null ? `$${formatNumber(material.price)}` : "—"
                  }
                />
                <DetailRow
                  label="Odoo category"
                  value={material.odoo_category ?? "—"}
                />
              </dl>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
