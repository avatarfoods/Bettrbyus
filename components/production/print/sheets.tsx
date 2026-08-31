import type {
  BatchSheet,
  NeedRow,
  ProductionDayPrint,
} from "@/lib/production/print/build";
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

const TH = "border border-black px-1.5 py-1 text-left text-[0.625rem] font-bold uppercase";
const TD = "border border-black px-1.5 py-1 text-[0.6875rem] align-top";

/* ------------------------------------------------------------------ */
/* Production report - the sheet that goes on top                      */
/* ------------------------------------------------------------------ */

export function ProductionReportSheet({ day }: { day: ProductionDayPrint }) {
  const totalSheets = day.departments.reduce(
    (sum, dept) => sum + dept.sheets.length,
    0
  );

  return (
    <>
      <SheetHeader
        title="Production report"
        date={day.date}
        scheduleName={day.scheduleName}
        right={
          <>
            <p>{totalSheets} items</p>
            <p className="uppercase">{day.scheduleStatus}</p>
          </>
        }
      />

      {day.finished.length > 0 && (
        <section className="print-keep mb-4">
          <h3 className="mb-1 text-xs font-bold uppercase">Finished product</h3>
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
            <tbody>
              {day.finished.map((row) => (
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

      {day.departments.map((dept) => (
        <section key={dept.department} className="print-keep mb-4">
          <h3 className="mb-1 flex items-baseline justify-between text-xs font-bold uppercase">
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
            <tbody>
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
            <tbody>
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
    <section className={first ? "" : "print-break-before"}>
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
        <tbody>
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
  day,
  lots,
}: {
  day: ProductionDayPrint;
  /** recipeId -> { lot, expiration } worked out from the spec. */
  lots: Record<string, { lot: string; expiration: string | null }>;
}) {
  return (
    <>
      <SheetHeader
        title="Product release"
        date={day.date}
        scheduleName={day.scheduleName}
      />

      <p className="mb-3 text-[0.6875rem]">
        No pallet leaves the building until every line below is signed.
      </p>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Item</th>
            <th className={TH}>Product</th>
            <th className={`${TH} text-right`}>Qty</th>
            <th className={TH}>Lot</th>
            <th className={TH}>Expiration</th>
            <th className={`${TH} w-20`}>Pallets</th>
            <th className={`${TH} w-20`}>Temp</th>
            <th className={`${TH} w-24`}>QA</th>
          </tr>
        </thead>
        <tbody>
          {day.finished.map((row) => {
            const lot = lots[row.recipeId];
            return (
              <tr key={row.recipeId}>
                <td className={`${TD} font-mono`}>{row.wipCode}</td>
                <td className={`${TD} font-semibold`}>{row.name}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {fmt(row.quantity)}
                </td>
                <td className={`${TD} font-mono`}>{lot?.lot ?? ""}</td>
                <td className={`${TD} tabular-nums`}>{lot?.expiration ?? ""}</td>
                <td className={TD} />
                <td className={TD} />
                <td className={TD} />
              </tr>
            );
          })}
          {day.finished.length === 0 && (
            <tr>
              <td className={TD} colSpan={8}>
                No finished product scheduled on this date.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <SignoffRow labels={["QA released by", "Date", "Warehouse received by", "Date"]} />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-black px-1.5 py-1">
      <span className="block text-[0.5625rem] font-bold uppercase">{label}</span>
      <span className="block text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BlankField({ label }: { label: string }) {
  return (
    <div className="flex-1">
      <span className="block text-[0.5625rem] font-bold uppercase">{label}</span>
      <div className="mt-3 border-b border-black" />
    </div>
  );
}
