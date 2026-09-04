import type {
  BatchSheet,
  NeedRow,
  ProductionDayPrint,
} from "@/lib/production/print/build";
import type { ReleaseProduct } from "@/lib/production/print/release";
import { SheetHeader, SignoffRow } from "@/components/production/print/print-frame";

/**
 * The four printed sheets.
 *
 * All black on white, no colour, generous rules - these are photocopied,
 * written on with a pen, and pinned up in a cold room. Every one leaves blank
 * columns for lot numbers and weights, because Phase 1 deliberately does not
 * change how anyone works: the same things get written by hand in the same
 * places, so the numbers can be proven before the floor is asked to change.
 */

function fmt(value: number, places = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}

/*
  One language for every sheet: a grey header band, thin grey rules between
  rows, light zebra so a finger can follow a line across, black only where
  something has to be read - names and numbers. Photocopies well.
*/
const TH =
  "border border-neutral-300 bg-neutral-100 px-2 py-1 text-left text-[0.5625rem] font-bold tracking-[0.08em] text-neutral-600 uppercase";
const TD = "border border-neutral-300 px-2 py-1.5 align-middle text-[0.8125rem]";
const BAND =
  "mb-1 flex items-baseline justify-between gap-2 border-b-2 border-black pb-0.5 text-[0.6875rem] font-bold tracking-wide uppercase";
const ZEBRA = "";

/* ------------------------------------------------------------------ */
/* Production report - the sheet that goes on top                      */
/* ------------------------------------------------------------------ */

export function ProductionReportSheet({
  day,
  department,
}: {
  day: ProductionDayPrint;
  /** One department's page only. The finished products page is the one named FINISHED PRODUCT. */
  department?: string;
}) {
  // The finished products have their own page up top; their packing runs are
  // not kitchen runs, so they neither count nor repeat under a department.
  const finishedIds = new Set(day.finished.map((row) => row.recipeId));
  const only = department?.trim().toUpperCase() ?? null;
  const isFinishedDept = only !== null && /finished/i.test(only);
  const departments = day.departments
    .map((dept) => ({
      ...dept,
      sheets: dept.sheets.filter((sheet) => !finishedIds.has(sheet.recipeId)),
    }))
    .filter((dept) => dept.sheets.length > 0)
    .filter((dept) => only === null || dept.department.trim().toUpperCase() === only);
  const finished = only === null || isFinishedDept ? day.finished : [];
  const totalSheets = departments.reduce((sum, dept) => sum + dept.sheets.length, 0);

  return (
    <>
      <SheetHeader
        title="Production report"
        date={day.date}
        scheduleName={day.scheduleName}
        subline={
          only ? (
            <>
              <span className="font-bold">{only}</span>
              {day.scheduleName && (
                <>
                  <span className="mx-1.5 text-neutral-400">|</span>
                  {day.scheduleName}
                </>
              )}
            </>
          ) : undefined
        }
        figure={
          isFinishedDept
            ? {
                label: "Finished products",
                value: String(finished.length),
                note: `${fmt(finished.reduce((sum, row) => sum + row.quantity, 0), 0)} cases`,
              }
            : {
                label: only ? "Runs" : "Runs today",
                value: String(totalSheets),
                note: only
                  ? "on this page"
                  : `${day.finished.length} finished product${day.finished.length === 1 ? "" : "s"}`,
              }
        }
      />

      {finished.length > 0 && (
        <section className="mb-4">
          <h3 className={BAND}>
            <span>Finished product</span>
            <span className="font-normal tabular-nums">{finished.length}</span>
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Product</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={TH}>UoM</th>
                <th className={`${TH} w-24`}>Actual</th>
              </tr>
            </thead>
            <tbody className={ZEBRA}>
              {finished.map((row) => (
                <tr key={row.recipeId}>
                  <td className={`${TD} font-mono`}>{row.wipCode}</td>
                  <td className={`${TD} font-semibold`}>{row.name}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {fmt(row.quantity)}
                  </td>
                  <td className={TD}>{row.uom ?? "—"}</td>
                  <td className={TD} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* One department per page, always: a supervisor is handed their own
          page and nobody else's, however short the list. */}
      {departments.map((dept, index) => (
        <section
          key={dept.department}
          className={
            index === 0 && finished.length === 0 ? "mb-4" : "print-break-before mb-4"
          }
        >
          {(index > 0 || finished.length > 0) && (
            <div className="mb-3 flex items-end justify-between border-b-[3px] border-black pb-1">
              <span className="text-[1.125rem] font-bold tracking-tight uppercase">Production report</span>
              <span className="text-[0.9375rem] font-bold tabular-nums">{day.date}</span>
            </div>
          )}
          <h3 className={BAND}>
            <span>{dept.department}</span>
            <span className="font-normal tabular-nums">
              {dept.totalPounds > 0 && `${fmt(dept.totalPounds)} lb`}
              {dept.totalPounds > 0 && dept.totalUnits > 0 && " · "}
              {dept.totalUnits > 0 && `${fmt(dept.totalUnits, 0)} units`}
            </span>
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Recipe</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={TH}>UoM</th>
                <th className={`${TH} text-right`}>Batches</th>
                <th className={TH}>For</th>
                <th className={`${TH} w-20`}>Actual</th>
              </tr>
            </thead>
            <tbody className={ZEBRA}>
              {dept.sheets.map((sheet) => (
                <tr key={sheet.recipeId}>
                  <td className={`${TD} font-mono`}>{sheet.wipCode}</td>
                  <td className={TD}>{sheet.name}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {fmt(sheet.quantity)}
                  </td>
                  <td className={TD}>{sheet.uom ?? "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {sheet.batches ?? "—"}
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    {sheet.servesDates[0] ?? "—"}
                  </td>
                  <td className={TD} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <SignoffRow labels={["Supervisor", "Date", "QA review", "Date"]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Production need - what each department must make                    */
/* ------------------------------------------------------------------ */

export function ProductionNeedSheet({
  date,
  scheduleName,
  departments,
}: {
  date: string;
  scheduleName: string;
  departments: { department: string; rows: NeedRow[] }[];
}) {
  return (
    <>
      <SheetHeader
        title="Production need"
        date={date}
        scheduleName={scheduleName}
      />

      {departments.map((dept, index) => (
        <section
          key={dept.department}
          className={index > 0 ? "print-break-before mb-4" : "mb-4"}
        >
          <h3 className="mb-1 text-xs font-bold uppercase">{dept.department}</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Recipe</th>
                <th className={`${TH} text-right`}>Needed</th>
                <th className={`${TH} text-right`}>Scheduled</th>
                <th className={`${TH} text-right`}>Gap</th>
                <th className={TH}>UoM</th>
                <th className={`${TH} w-24`}>Made</th>
                <th className={`${TH} w-24`}>Lot</th>
              </tr>
            </thead>
            <tbody className={ZEBRA}>
              {dept.rows.map((row) => (
                <tr key={row.recipeId}>
                  <td className={`${TD} font-mono`}>{row.wipCode}</td>
                  <td className={TD}>{row.name}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {fmt(row.needed)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {fmt(row.scheduled)}
                  </td>
                  <td
                    className={`${TD} text-right tabular-nums ${
                      row.gap > 0.01 ? "font-bold" : ""
                    }`}
                  >
                    {row.gap > 0.01 ? fmt(row.gap) : "—"}
                  </td>
                  <td className={TD}>{row.uom ?? "—"}</td>
                  <td className={TD} />
                  <td className={TD} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <SignoffRow labels={["Department lead", "Date"]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Batch sheet - one page per recipe                                   */
/* ------------------------------------------------------------------ */

export function BatchSheetPage({
  sheet,
  date,
  scheduleName,
  first,
}: {
  sheet: BatchSheet;
  date: string;
  scheduleName: string;
  first: boolean;
}) {
  return (
    <section className={first ? "print-break-after" : "print-break-before print-break-after"}>
      <SheetHeader
        title={sheet.name}
        date={date}
        scheduleName={scheduleName}
        right={
          <>
            <p className="font-mono">{sheet.wipCode}</p>
            <p>{sheet.department}</p>
          </>
        }
      />

      <div className="mb-3 grid grid-cols-4 gap-2 text-[0.6875rem]">
        <Fact label="To make" value={`${fmt(sheet.quantity)} ${sheet.uom ?? ""}`} />
        <Fact
          label="Batch size"
          value={sheet.batchSize ? `${fmt(sheet.batchSize)} ${sheet.uom ?? ""}` : "Per unit"}
        />
        <Fact label="Batches" value={sheet.batches ? String(sheet.batches) : "—"} />
        <Fact label="Needed for" value={sheet.servesDates[0] ?? "—"} />
      </div>

      <div className="mb-3 flex gap-3 text-[0.6875rem]">
        <BlankField label="Lot number" />
        <BlankField label="Start time" />
        <BlankField label="Finish time" />
        <BlankField label="Yield" />
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-8`}>✓</th>
            <th className={TH}>Item</th>
            <th className={TH}>Ingredient</th>
            <th className={`${TH} text-right`}>Required</th>
            <th className={TH}>UoM</th>
            <th className={`${TH} w-24`}>Actual</th>
            <th className={`${TH} w-28`}>Lot number</th>
          </tr>
        </thead>
        <tbody className={ZEBRA}>
          {sheet.ingredients.map((line, index) => (
            <tr key={`${line.name}-${index}`}>
              <td className={TD} />
              <td className={`${TD} font-mono`}>{line.itemCode ?? "—"}</td>
              <td className={TD}>
                {line.name}
                {line.isSubRecipe && (
                  <span className="ml-1 text-[0.5625rem] uppercase">(wip)</span>
                )}
              </td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>
                {fmt(line.quantity, 2)}
              </td>
              <td className={TD}>{line.uom ?? "—"}</td>
              <td className={TD} />
              <td className={TD} />
            </tr>
          ))}
          {sheet.ingredients.length === 0 && (
            <tr>
              <td className={TD} colSpan={7}>
                No ingredient lines on this recipe.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {sheet.steps.length > 0 ? (
        <section className="mt-4">
          <h3 className="mb-1 text-xs font-bold uppercase">Method</h3>
          <ol className="space-y-1.5">
            {sheet.steps.map((step) => (
              <li key={step.stepNumber} className="flex gap-2 text-[0.6875rem]">
                <span className="w-5 shrink-0 text-right font-bold tabular-nums">
                  {step.stepNumber}.
                </span>
                <span className="flex-1">
                  {step.body}
                  {(step.targetTemp || step.targetTime || step.equipment) && (
                    <span className="mt-0.5 block text-[0.625rem] uppercase">
                      {[step.equipment, step.targetTemp, step.targetTime]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {step.requiresSignoff && (
                  <span className="w-24 shrink-0 self-end border-b border-black" />
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="mt-4 text-[0.625rem] uppercase">
          No method recorded for this recipe yet
        </p>
      )}

      <SignoffRow labels={["Made by", "Checked by", "Date"]} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Product release - finished goods only                               */
/* ------------------------------------------------------------------ */

export function ProductReleaseSheet({
  date,
  lineName,
  products,
  po = null,
}: {
  date: string;
  lineName: string;
  /** One entry per finished product; each prints `pallets` lines. */
  products: ReleaseProduct[];
  /** The warehouse's PO number, typed on the console. */
  po?: string | null;
}) {
  const pallets = products.reduce((sum, product) => sum + product.pallets, 0);
  const cases = products.reduce((sum, product) => sum + product.quantity, 0);

  return (
    <>
      <SheetHeader
        title="Product release"
        date={date}
        subline={
          <>
            <span className="font-bold">{lineName}</span>
            <span className="mx-1.5 text-neutral-400">|</span>
            {products.length} product{products.length === 1 ? "" : "s"}
            {po && (
              <>
                <span className="mx-1.5 text-neutral-400">|</span>
                <span className="text-[0.875rem] font-bold tracking-normal">PO {po.replace(/^PO\s*/i, "")}</span>
              </>
            )}
          </>
        }
        figure={{
          label: "Pallets to release",
          value: String(pallets),
          note: `${fmt(cases, 0)} cases planned`,
        }}
      />

      {/* What the day is releasing, once, up here: item, product, planned
          cases. The pallet lines below carry only what gets written on them. */}
      <div className="mb-3 grid gap-x-6 gap-y-0.5 border-b border-neutral-300 pb-2 text-[0.75rem] sm:grid-cols-2">
        {products.map((product) => (
          <p key={product.recipeId} className="flex items-baseline gap-2">
            <span className="font-mono font-bold">{product.wipCode}</span>
            <span className="min-w-0 flex-1 truncate uppercase">{product.name}</span>
            <span className="font-bold tabular-nums">
              {fmt(product.quantity, 0)}
              <span className="ml-1 text-[0.5625rem] font-normal text-neutral-600">cs</span>
            </span>
            <span className="w-14 text-right text-[0.625rem] text-neutral-600 tabular-nums">
              {product.pallets} plt
            </span>
          </p>
        ))}
      </div>

      {/*
        One line per pallet, the way the workbook printed it: 500 cases at 135
        per pallet space is four lines of the same product, each with its own
        lot, expiration and two signatures.
      */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-16`}>Item #</th>
            <th className={TH}>Product name</th>
            <th className={`${TH} w-20 text-center`}>Pallet</th>
            <th className={`${TH} w-24`}>Lot #</th>
            <th className={`${TH} w-24`}>Expiration</th>
            <th className={`${TH} w-32`}>Manager signature</th>
            <th className={`${TH} w-32`}>Warehouse signature</th>
          </tr>
        </thead>
        <tbody className={ZEBRA}>
          {products.flatMap((product) =>
            Array.from({ length: product.pallets }, (_, index) => (
              <tr key={`${product.recipeId}-${index}`} className="print-keep">
                <td className={`${TD} font-mono`}>{product.wipCode}</td>
                <td className={`${TD} font-semibold uppercase`}>{product.name}</td>
                <td className={`${TD} text-center tabular-nums`}>
                  {index + 1} / {product.pallets}
                </td>
                <td className={`${TD} font-mono`}>{product.lot}</td>
                <td className={`${TD} tabular-nums`}>{product.expiration ?? ""}</td>
                <td className={`${TD} h-10`} />
                <td className={`${TD} h-10`} />
              </tr>
            ))
          )}
          {products.length === 0 && (
            <tr>
              <td className={TD} colSpan={7}>
                No finished product scheduled on this date.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-300 px-2 py-1.5">
      <span className="block text-[0.5625rem] font-bold tracking-[0.08em] text-neutral-600 uppercase">{label}</span>
      <span className="block text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function BlankField({ label }: { label: string }) {
  return (
    <div className="flex-1">
      <span className="block text-[0.5625rem] font-bold tracking-[0.08em] text-neutral-600 uppercase">{label}</span>
      <div className="mt-3 border-b border-black" />
    </div>
  );
}
