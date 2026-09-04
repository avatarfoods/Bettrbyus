import { PageShell } from "@/components/app-shell/page-shell";
import { PickingScope } from "@/components/production/picking/picking-scope";
import { PickingView } from "@/components/production/picking/picking-view";
import { computePicking, DEFAULT_EXTRA } from "@/lib/production/picking/compute";
import type { PickingMode } from "@/lib/production/picking/types";
import { fetchProductionConfig, isRealLine } from "@/lib/production/config";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Picking Order" };
export const dynamic = "force-dynamic";

function isIsoDate(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

/**
 * The master picking order.
 *
 * What the kitchen pulls from the warehouse for a production date: every raw
 * material the plan's recipes reach, in pounds or pieces, divided into cases
 * at Odoo's pack size, less what is on hand. The old workbook's MASTER PO#
 * tab, computed live from the plan and the recipe tree instead of typed.
 */
export default async function PickingOrderPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    from?: string;
    to?: string;
    line?: string;
    place?: string;
    extra?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [config, profile] = await Promise.all([
    fetchProductionConfig(supabase),
    getCurrentUserProfile(supabase),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const mode: PickingMode = params.mode === "open" ? "open" : "daily";
  const from = isIsoDate(params.from) ? params.from : today;
  const to = isIsoDate(params.to) && params.to >= from ? params.to : from;

  const activeLines = config.lines.filter((entry) => entry.active);
  const line = activeLines.find((entry) => entry.name === params.line) ?? null;

  const extraRaw = params.extra !== undefined ? Number(params.extra) : NaN;
  const extraPct =
    Number.isFinite(extraRaw) && extraRaw >= 0 && extraRaw <= 100
      ? extraRaw
      : DEFAULT_EXTRA[mode];

  // Places are the Odoo companies the materials are bought under.
  const { data: companyRows } = await supabase
    .from("purchasing_materials")
    .select("odoo_company_id, odoo_company_name")
    .not("odoo_company_id", "is", null)
    .eq("active", true)
    .limit(2000);
  const places = [
    ...new Map(
      (companyRows ?? [])
        .filter((row) => row.odoo_company_id !== null && row.odoo_company_name)
        .map((row) => [Number(row.odoo_company_id), String(row.odoo_company_name)])
    ).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const placeRaw = params.place !== undefined ? Number(params.place) : NaN;
  const place = places.find((entry) => entry.id === placeRaw)?.id ?? null;

  const result = await computePicking(supabase, config, {
    mode,
    from,
    to,
    extraPct,
    lineId: line && isRealLine(line) ? line.id : null,
    lineName: line?.name ?? null,
    companyId: place,
  });

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Picking Order" }]}
      meta={
        <PickingScope
          lines={activeLines.map((entry) => entry.name)}
          currentLine={line?.name ?? null}
          places={places}
          currentPlace={place}
        />
      }
    >
      <PickingView
        result={result}
        today={today}
        isAdmin={isAdminProfile(profile)}
        lineName={line?.name ?? null}
        departmentColors={config.departments.map((d) => [d.name, d.color])}
      />
    </PageShell>
  );
}
