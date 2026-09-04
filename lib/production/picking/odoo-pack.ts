/**
 * Pack sizes from Odoo's Product Spec.
 *
 * On the product form, Yaya's keeps "Pack Size" and "U/M" as Studio fields:
 * Pack Size 25 + U/M Lbs means one case is 25 lb; 600 + Unit means 600
 * pieces. This is the one Odoo read the picking order makes of its own, so it
 * carries its own small JSON-RPC client rather than reaching into the
 * purchasing sync.
 */

export const PACK_FIELDS = {
  packSize: "x_studio_case_weight_lb",
  packUom: "x_studio_measure_1",
  caseDescription: "x_studio_case_description",
  storage: "x_studio_storage",
} as const;

export type OdooPackInfo = {
  productId: number;
  packSize: number | null;
  packUom: string | null;
  caseDescription: string | null;
  storage: string | null;
};

type Config = { url: string; db: string; username: string; apiKey: string };

function config(): Config {
  const url = process.env.ODOO_URL?.trim();
  const db = process.env.ODOO_DB?.trim();
  const username = process.env.ODOO_USERNAME?.trim();
  const apiKey = process.env.ODOO_API_KEY?.trim();
  if (!url || !db || !username || !apiKey) {
    throw new Error(
      "Odoo is not configured. Set ODOO_URL, ODOO_DB, ODOO_USERNAME and ODOO_API_KEY in .env.local."
    );
  }
  return { url: url.replace(/\/$/, ""), db, username, apiKey };
}

async function rpc(
  cfg: Config,
  service: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const response = await fetch(`${cfg.url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Odoo request failed with HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };
  if (payload.error) {
    throw new Error(
      `Odoo error: ${payload.error.data?.message ?? payload.error.message ?? "unknown"}`
    );
  }
  return payload.result;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Reads the pack fields for the given product ids, in batches. */
export async function fetchOdooPackInfo(productIds: number[]): Promise<OdooPackInfo[]> {
  if (productIds.length === 0) return [];
  const cfg = config();
  const uid = await rpc(cfg, "common", "authenticate", [cfg.db, cfg.username, cfg.apiKey, {}]);
  if (typeof uid !== "number") {
    throw new Error("Odoo rejected the login (wrong DB, username, or API key).");
  }

  const out: OdooPackInfo[] = [];
  const fields = ["id", ...Object.values(PACK_FIELDS)];
  for (let start = 0; start < productIds.length; start += 200) {
    const batch = productIds.slice(start, start + 200);
    const rows = (await rpc(cfg, "object", "execute_kw", [
      cfg.db,
      uid,
      cfg.apiKey,
      "product.product",
      "read",
      [batch],
      { fields, context: { active_test: false } },
    ])) as Record<string, unknown>[];
    for (const row of rows) {
      const size = row[PACK_FIELDS.packSize];
      out.push({
        productId: row.id as number,
        packSize:
          typeof size === "number" && Number.isFinite(size) && size > 0 ? size : null,
        packUom: text(row[PACK_FIELDS.packUom]),
        caseDescription: text(row[PACK_FIELDS.caseDescription]),
        storage: text(row[PACK_FIELDS.storage]),
      });
    }
  }
  return out;
}
