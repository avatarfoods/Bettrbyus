/**
 * Applies PENDING_MIGRATIONS.sql to the live Supabase project, then proves
 * every table landed.
 *
 * The service-role key cannot do this: it only reaches PostgREST, which does
 * not run DDL. This needs one of, in order of preference:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_...   personal token, supabase.com/dashboard/account/tokens
 *   SUPABASE_DB_URL=postgresql://...  direct connection string (needs `npm i pg`)
 *
 * The SQL is idempotent — every create is guarded, every policy is dropped
 * first — so running this twice changes nothing.
 */
import fs from "node:fs";

const SQL_FILE = "PENDING_MIGRATIONS.sql";
const EXPECTED = [
  "app_settings",
  "production_wip_counts",
  "production_lines",
  "production_departments",
  "item_groups",
  "item_group_members",
  "finished_products",
];

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
const DB_URL = process.env.SUPABASE_DB_URL ?? env.SUPABASE_DB_URL;

const sql = fs.readFileSync(SQL_FILE, "utf8");
console.log(`${SQL_FILE}: ${sql.split("\n").length} lines -> project ${REF}\n`);

async function applyViaManagementApi() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 600)}`);
  console.log("applied via Management API");
}

async function applyViaPostgres() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("applied via direct Postgres connection");
  } finally {
    await client.end();
  }
}

/** PostgREST answers 200 once a table exists and is exposed. */
async function verify() {
  console.log("\nverifying:");
  let missing = 0;
  for (const table of EXPECTED) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (res.ok) {
      console.log(`  OK       ${table}`);
    } else {
      console.log(`  MISSING  ${table} (http ${res.status})`);
      missing += 1;
    }
  }
  if (missing > 0) {
    console.error(`\n${missing} table(s) still missing.`);
    process.exit(1);
  }
  console.log("\nall tables present.");
}

if (TOKEN) await applyViaManagementApi();
else if (DB_URL) await applyViaPostgres();
else {
  console.error(
    "No credential. Set one of:\n" +
      "  SUPABASE_ACCESS_TOKEN=sbp_...   (supabase.com/dashboard/account/tokens)\n" +
      "  SUPABASE_DB_URL=postgresql://...\n" +
      "either in the environment or in .env.local."
  );
  process.exit(1);
}

await verify();
