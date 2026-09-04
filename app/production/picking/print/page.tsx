import { PickingPrintSheet } from "@/components/production/picking/picking-print";
import { computePicking, DEFAULT_EXTRA } from "@/lib/production/picking/compute";
import type { PickingMode } from "@/lib/production/picking/types";
import { fetchProductionConfig, isRealLine } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print picking order" };
export const dynamic = "force-dynamic";

function isIsoDate(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

/**
 * The picking order on paper: one section per department, a box to tick per
 * line, nothing else. Save as PDF from the print dialog for a file.
 */
export default async function PickingPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    from?: string;
    to?: string;
    line?: string;
    place?: string;
    extra?: string;
    group?: string;
    all?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);

  const today = new Date().toISOString().slice(0, 10);
  const mode: PickingMode = params.mode === "open" ? "open" : "daily";
  const from = isIsoDate(params.from) ? params.from : today;
  const to = isIsoDate(params.to) && params.to >= from ? params.to : from;
  const line = config.lines.find((entry) => entry.active && entry.name === params.line) ?? null;
  const extraRaw = params.extra !== undefined ? Number(params.extra) : NaN;
  const extraPct =
    Number.isFinite(extraRaw) && extraRaw >= 0 && extraRaw <= 100 ? extraRaw : DEFAULT_EXTRA[mode];
  const placeRaw = params.place !== undefined ? Number(params.place) : NaN;
  const place = Number.isFinite(placeRaw) ? placeRaw : null;

  const result = await computePicking(supabase, config, {
    mode,
    from,
    to,
    extraPct,
    lineId: line && isRealLine(line) ? line.id : null,
    lineName: line?.name ?? null,
    companyId: place,
  });

  const back = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "group" && key !== "all") back.set(key, value);
  }

  return (
    <PickingPrintSheet
      result={result}
      lineName={line?.name ?? null}
      groupBy={params.group === "type" ? "type" : "department"}
      showAll={params.all === "1"}
      backHref={`/production/picking${back.toString() ? `?${back}` : ""}`}
    />
  );
}
