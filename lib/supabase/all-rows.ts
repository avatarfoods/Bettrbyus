/**
 * Every row, not the first thousand.
 *
 * PostgREST caps a response at `max-rows` - 1000 on this project - and says
 * nothing about it: the query succeeds, the array is a thousand long, and the
 * rest of the table is simply absent. There are 1,311 purchasing materials, so
 * every page that listed them was quietly missing 311, which is why 82
 * ingredient lines could not be linked to anything: the material existed, it
 * just never arrived.
 *
 * That is the worst shape a bug can take - no error, no warning, an answer
 * that looks complete. So any query over a table that might outgrow a thousand
 * rows goes through here, which pages until the rows run out.
 */
export async function allRows<T>(
  /**
   * One page of the query, given a range.
   *
   * Loosely typed on purpose: Supabase's builder carries a different generic
   * shape for every table, and pinning it here would make the helper harder
   * to call than the bug it prevents.
   */
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  { pageSize = 1000, max = 100_000 } = {}
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];

  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    // A short page is the last page.
    if (data.length < pageSize) break;
  }

  return { rows, error: null };
}
