
/**
 * Shared Odoo JSON-RPC plumbing. Server-side only: reads credentials from env.
 *
 * Required in .env.local:
 *   ODOO_URL       e.g. https://avatarnaturalfoods.odoo.com   (no /odoo suffix -
 *                  that is the web UI path; RPC lives at the root)
 *   ODOO_DB        database name
 *   ODOO_USERNAME  login email of the API user
 *   ODOO_API_KEY   API key for that user
 */

export type OdooConfig = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
};

export function getOdooConfig(): OdooConfig {
  const url = process.env.ODOO_URL?.trim();
  const db = process.env.ODOO_DB?.trim();
  const username = process.env.ODOO_USERNAME?.trim();
  const apiKey = process.env.ODOO_API_KEY?.trim();

  if (!url || !db || !username || !apiKey) {
    throw new Error(
      "Odoo is not configured. Set ODOO_URL, ODOO_DB, ODOO_USERNAME and ODOO_API_KEY in .env.local."
    );
  }

  // Tolerate someone pasting the browser URL, which ends in /odoo.
  const base = url.replace(/\/+$/, "").replace(/\/odoo$/i, "");

  return { url: base, db, username, apiKey };
}

export async function jsonRpcCall(
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

  const text = await response.text();

  let payload: {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };
  try {
    payload = JSON.parse(text);
  } catch {
    // A wrong host answers with an HTML redirect page rather than JSON, which
    // is exactly what a stale ODOO_URL looks like.
    throw new Error(
      `Odoo returned a non-JSON response from ${config.url}. Check ODOO_URL and ODOO_DB.`
    );
  }

  if (payload.error) {
    const message =
      payload.error.data?.message ?? payload.error.message ?? "Unknown Odoo error";
    throw new Error(`Odoo error: ${message}`);
  }

  return payload.result;
}

/**
 * Logging in costs a round trip, and the uid is stable for the life of the key.
 * Cached per process so a page pulling orders, moves, products and stock pays
 * for it once instead of four times.
 */
let cachedUid: { key: string; uid: number } | null = null;

export async function authenticate(config: OdooConfig): Promise<number> {
  const cacheKey = `${config.url}|${config.db}|${config.username}`;
  if (cachedUid?.key === cacheKey) return cachedUid.uid;

  const uid = await jsonRpcCall(config, "common", "authenticate", [
    config.db,
    config.username,
    config.apiKey,
    {},
  ]);

  if (typeof uid !== "number") {
    throw new Error(
      "Odoo rejected the login (wrong DB, username, or API key). Update ODOO_* in .env.local and restart the dev server."
    );
  }

  cachedUid = { key: cacheKey, uid };
  return uid;
}

export async function executeKw(
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

/** Opens a session and hands back a bound caller. */
export async function odooSession() {
  const config = getOdooConfig();
  const uid = await authenticate(config);

  return {
    config,
    uid,
    call: (
      model: string,
      method: string,
      args: unknown[],
      kwargs: Record<string, unknown> = {}
    ) => executeKw(config, uid, model, method, args, kwargs),
  };
}
