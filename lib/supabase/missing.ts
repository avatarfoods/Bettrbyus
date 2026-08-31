/**
 * Telling "this has not been created yet" apart from "this went wrong".
 *
 * The same absent table or column is reported two different ways depending on
 * who noticed: Postgres raises 42P01 / 42703, while PostgREST answers from its
 * own schema cache with PGRST205 / PGRST204 and a sentence instead. Checking
 * for only one of them is how a page ends up treating a pending migration as a
 * fatal error and rendering nothing - which is exactly what the planning page
 * did until this existed.
 */

type PgError = { code?: string; message?: string } | null | undefined;

/** The table does not exist yet. */
export function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

/** The column does not exist yet. */
export function isMissingColumn(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /could not find the .* column/i.test(error.message ?? "")
  );
}

/** Either - i.e. "run the migration". */
export function isMissingSchema(error: PgError): boolean {
  return isMissingTable(error) || isMissingColumn(error);
}
