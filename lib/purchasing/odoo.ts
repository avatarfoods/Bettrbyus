// Odoo JSON-RPC client. Server-side only: reads credentials from env vars.
// Required env vars (set in .env.local):
//   ODOO_URL      e.g. https://mycompany.odoo.com
//   ODOO_DB       database name
//   ODOO_USERNAME login email of the API user
//   ODOO_API_KEY  API key (or password) for that user

type OdooConfig = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
};

export type OdooProduct = {
  id: number;
  default_code: string | false;
  name: string;
  qty_available: number;
  categ_id: [number, string] | false;
  active: boolean;
};

export type OdooVendor = {
  id: number;
  name: string;
  partnerId: number | null;
  productCode: string | null;
  productName: string | null;
  price: number | null;
  minQty: number | null;
  delayDays: number | null;
};

export type OdooProductDetail = {
  id: number;
  default_code: string | null;
  name: string;
  display_name: string | null;
  barcode: string | null;
  active: boolean;
  categ_id: [number, string] | null;
  type: string | null;
  uom_id: [number, string] | null;
  uom_po_id: [number, string] | null;
  qty_available: number;
  virtual_available: number;
  incoming_qty: number;
  outgoing_qty: number;
  list_price: number | null;
  standard_price: number | null;
  weight: number | null;
  description_purchase: string | null;
  write_date: string | null;
  vendors: OdooVendor[];
};

function many2one(value: unknown): [number, string] | null {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "string"
    ? [value[0], value[1]]
    : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getOdooConfig(): OdooConfig {
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

async function jsonRpcCall(
  config: OdooConfig,
  service: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const response = await fetch(`${config.url}/jsonrpc`, {
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

  if (!response.ok) {
    throw new Error(`Odoo request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };

  if (payload.error) {
    const message =
      payload.error.data?.message ?? payload.error.message ?? "Unknown Odoo error";
    throw new Error(`Odoo error: ${message}`);
  }

  return payload.result;
}

async function authenticate(config: OdooConfig): Promise<number> {
  const uid = await jsonRpcCall(config, "common", "authenticate", [
    config.db,
    config.username,
    config.apiKey,
    {},
  ]);

  if (typeof uid !== "number") {
    throw new Error(
      "Odoo rejected the login (wrong DB, username, or API key). Update ODOO_* in .env.local and restart npm run dev."
    );
  }

  return uid;
}

async function executeKw(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  return jsonRpcCall(config, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

/**
 * Fetch all products that have an Internal Reference (default_code), including
 * archived ones so we can deactivate materials that were archived in Odoo.
 */
export async function fetchOdooProducts(): Promise<OdooProduct[]> {
  const config = getOdooConfig();
  const uid = await authenticate(config);

  const batchSize = 1000;
  const products: OdooProduct[] = [];

  for (let offset = 0; ; offset += batchSize) {
    const batch = (await executeKw(
      config,
      uid,
      "product.product",
      "search_read",
      [[["default_code", "!=", false]]],
      {
        fields: ["id", "default_code", "name", "qty_available", "categ_id", "active"],
        limit: batchSize,
        offset,
        context: { active_test: false },
      }
    )) as OdooProduct[];

    products.push(...batch);
    if (batch.length < batchSize) break;
  }

  return products;
}

/**
 * Fetch a single product's live details from Odoo by product id or internal
 * reference. Used for the item detail dialog on the Component Matrix.
 */
export async function fetchOdooProductDetail(input: {
  odooProductId?: number | null;
  itemCode?: string | null;
}): Promise<OdooProductDetail | null> {
  const config = getOdooConfig();
  const uid = await authenticate(config);

  const domain: unknown[][] = [];
  if (input.odooProductId) {
    domain.push(["id", "=", input.odooProductId]);
  } else if (input.itemCode?.trim()) {
    domain.push(["default_code", "=", input.itemCode.trim()]);
  } else {
    return null;
  }

  const rows = (await executeKw(
    config,
    uid,
    "product.product",
    "search_read",
    [domain],
    {
      fields: [
        "id",
        "default_code",
        "name",
        "display_name",
        "barcode",
        "active",
        "categ_id",
        "type",
        "uom_id",
        "uom_po_id",
        "qty_available",
        "virtual_available",
        "incoming_qty",
        "outgoing_qty",
        "list_price",
        "standard_price",
        "weight",
        "description_purchase",
        "write_date",
        "product_tmpl_id",
      ],
      limit: 1,
      context: { active_test: false },
    }
  )) as Record<string, unknown>[];

  const row = rows[0];
  if (!row) return null;

  const productId = row.id as number;
  const template = many2one(row.product_tmpl_id);
  const vendors = await fetchOdooVendors(config, uid, productId, template?.[0] ?? null);

  return {
    id: productId,
    default_code: textOrNull(row.default_code),
    name: textOrNull(row.name) ?? "",
    display_name: textOrNull(row.display_name),
    barcode: textOrNull(row.barcode),
    active: Boolean(row.active),
    categ_id: many2one(row.categ_id),
    type: textOrNull(row.type),
    uom_id: many2one(row.uom_id),
    uom_po_id: many2one(row.uom_po_id),
    qty_available: numberOrZero(row.qty_available),
    virtual_available: numberOrZero(row.virtual_available),
    incoming_qty: numberOrZero(row.incoming_qty),
    outgoing_qty: numberOrZero(row.outgoing_qty),
    list_price: numberOrNull(row.list_price),
    standard_price: numberOrNull(row.standard_price),
    weight: numberOrNull(row.weight),
    description_purchase: textOrNull(row.description_purchase),
    write_date: textOrNull(row.write_date),
    vendors,
  };
}

async function fetchOdooVendors(
  config: OdooConfig,
  uid: number,
  productId: number,
  templateId: number | null
): Promise<OdooVendor[]> {
  // Prefer template sellers (standard Purchase tab), include variant-specific
  // rows when present. partner_id is modern Odoo; older DBs used `name`.
  const domain: unknown[] =
    templateId != null
      ? [
          "|",
          ["product_tmpl_id", "=", templateId],
          ["product_id", "=", productId],
        ]
      : [["product_id", "=", productId]];

  let sellerRows: Record<string, unknown>[] = [];
  try {
    sellerRows = (await executeKw(
      config,
      uid,
      "product.supplierinfo",
      "search_read",
      [domain],
      {
        fields: [
          "id",
          "partner_id",
          "product_code",
          "product_name",
          "price",
          "min_qty",
          "delay",
          "sequence",
        ],
        order: "sequence asc, id asc",
        limit: 20,
      }
    )) as Record<string, unknown>[];
  } catch {
    // Fallback for older Odoo where the vendor field is still called `name`.
    try {
      sellerRows = (await executeKw(
        config,
        uid,
        "product.supplierinfo",
        "search_read",
        [domain],
        {
          fields: [
            "id",
            "name",
            "product_code",
            "product_name",
            "price",
            "min_qty",
            "delay",
            "sequence",
          ],
          order: "sequence asc, id asc",
          limit: 20,
        }
      )) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  return sellerRows.map((seller) => {
    const partner = many2one(seller.partner_id) ?? many2one(seller.name);
    return {
      id: seller.id as number,
      name: partner?.[1] ?? "Unknown vendor",
      partnerId: partner?.[0] ?? null,
      productCode: textOrNull(seller.product_code),
      productName: textOrNull(seller.product_name),
      price: numberOrNull(seller.price),
      minQty: numberOrNull(seller.min_qty),
      delayDays: numberOrNull(seller.delay),
    };
  });
}
