import type { CatalogRecipe } from "@/lib/recipes/catalog";
import type { FinishedProduct } from "@/lib/finished-products/model";

/**
 * The product specification, on one page.
 *
 * What a customer, a broker or a warehouse asks for before they will take a
 * pallet: what is in it, what it weighs, how it stacks, how long it keeps.
 * All of it already exists in the app in five different places, and today it
 * gets retyped into a PDF by hand - which is how a case count ends up right
 * on the sheet and wrong on the carton.
 *
 * Everything here is stated, never derived, with one exception: cases per
 * pallet is layer x tie x stack, because typing it is exactly how the
 * workbook ended up with 45 in one place and 135 in another for the same
 * product.
 *
 * A blank is printed as a dash rather than skipped. A missing line on a spec
 * sheet has to look missing; quietly dropping it makes an incomplete sheet
 * read as a complete one.
 */
export function SpecSheet({
  recipe,
  spec,
}: {
  recipe: CatalogRecipe;
  spec: FinishedProduct | null;
}) {
  const casesPerPallet =
    spec?.casesPerLayer && spec?.layersHigh
      ? spec.casesPerLayer * spec.layersHigh * (spec.palletsPerStack || 1)
      : null;

  const dims = (w: number | null, l: number | null, h: number | null) =>
    w && l && h ? `${l} L × ${w} W × ${h} H in` : null;

  return (
    <div data-print-landscape className="text-black">
      <header className="flex items-start justify-between gap-6 border-b-[3px] border-black pb-2">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight uppercase">
            {recipe.name}
          </h1>
          <p className="mt-0.5 font-mono text-sm">{recipe.wipCode}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.5625rem] font-semibold tracking-wider uppercase">
            Product specification
          </p>
          <p className="text-sm font-bold tabular-nums">
            {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
        <Block title="Storage and life">
          <Row label="Storage" value={titleCase(spec?.storageType)} />
          <Row
            label="Shelf life"
            value={
              spec?.shelfLifeValue
                ? `${spec.shelfLifeValue} ${spec.shelfLifeUnit}`
                : null
            }
          />
          <Row
            label="Guaranteed on delivery"
            value={spec?.guaranteedShelfLifeDays}
            unit="days"
          />
          <Row label="Handling" value={spec?.handlingInstructions} />
          <Row label="Lot format" value={spec?.lotFormat} />
        </Block>

        <Block title="Case">
          <Row label="Case count" value={spec?.bowlsPerCase} />
          <Row label="Net weight per case" value={spec?.netWeightPerCase} unit="lb" />
          <Row label="Case weight" value={spec?.caseWeightLb} unit="lb" />
          <Row
            label="Case dimensions"
            value={dims(spec?.caseWidthIn ?? null, spec?.caseLengthIn ?? null, spec?.caseHeightIn ?? null)}
          />
          <Row label="Unit dimensions" value={null} />
        </Block>

        <Block title="Pallet">
          <Row
            label="Ti / Hi"
            value={
              spec?.casesPerLayer && spec?.layersHigh
                ? `${spec.casesPerLayer} × ${spec.layersHigh}`
                : null
            }
          />
          <Row
            label="Cases per pallet"
            value={casesPerPallet}
            note={
              casesPerPallet
                ? `${spec?.casesPerLayer} per layer × ${spec?.layersHigh} high${
                    (spec?.palletsPerStack ?? 1) > 1
                      ? ` × ${spec?.palletsPerStack} stacked`
                      : ""
                  }`
                : undefined
            }
          />
          <Row label="Pallet weight" value={spec?.palletWeightLb} unit="lb" />
          <Row label="Max pallet height" value={spec?.maxPalletHeightIn} unit="in" />
          <Row label="Partial pallets" value={titleCase(spec?.partialPolicy?.replace("_", " "))} />
        </Block>

        <Block title="Codes">
          <Row label="Case GTIN" value={spec?.caseGtin} mono />
          <Row label="Unit UPC" value={spec?.unitUpc} mono />
          <Row label="Customer group" value={spec?.customerGroup} />
        </Block>
      </div>

      <section className="mt-4 border-t-2 border-black pt-2">
        <h2 className="text-[0.5625rem] font-semibold tracking-wider uppercase">
          Ingredients
        </h2>
        <p className="mt-1 text-[0.8125rem] leading-snug uppercase">
          {spec?.ingredientStatement ?? (
            <span className="text-neutral-400 normal-case italic">
              No ingredient statement recorded. Add it on the recipe&rsquo;s
              Specification tab.
            </span>
          )}
        </p>
      </section>

      <section className="mt-3 border-t border-neutral-300 pt-2">
        <h2 className="text-[0.5625rem] font-semibold tracking-wider uppercase">
          Allergens
        </h2>
        <p className="mt-1 text-[0.8125rem] font-bold uppercase">
          {recipe.allergens.length > 0
            ? `Contains: ${recipe.allergens.join(", ")}`
            : "None declared"}
        </p>
        {recipe.allergensUnverified.length > 0 && (
          <p className="mt-0.5 text-[0.6875rem] text-neutral-500">
            Unverified — no statement in Odoo for{" "}
            {recipe.allergensUnverified.slice(0, 6).join(", ")}
            {recipe.allergensUnverified.length > 6 &&
              ` and ${recipe.allergensUnverified.length - 6} more`}
            . This list is a floor until those are filled in.
          </p>
        )}
      </section>

      {spec?.heatingInstructions && (
        <section className="mt-3 border-t border-neutral-300 pt-2">
          <h2 className="text-[0.5625rem] font-semibold tracking-wider uppercase">
            Heating instructions
          </h2>
          <p className="mt-1 text-[0.8125rem] leading-snug whitespace-pre-line">
            {spec.heatingInstructions}
          </p>
        </section>
      )}

      <footer className="mt-4 flex items-end justify-between gap-6 border-t-2 border-black pt-2 text-[0.625rem]">
        <span>Avatar Natural Foods · 1331 S. Boulder Hwy, Ste 130, Henderson NV 89015</span>
        <span className="text-neutral-500">
          Printed from Bettrbyus — the record in the app is the current one.
        </span>
      </footer>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="border-b border-black pb-0.5 text-[0.5625rem] font-semibold tracking-wider uppercase">
        {title}
      </h2>
      <dl className="mt-1 flex flex-col">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  unit,
  note,
  mono,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  note?: string;
  mono?: boolean;
}) {
  const shown =
    value === null || value === undefined || value === "" ? null : String(value);

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-neutral-200 py-1 last:border-b-0">
      <dt className="shrink-0 text-[0.6875rem]">{label}</dt>
      <dd className="min-w-0 text-right">
        <span
          className={
            shown === null
              ? "text-neutral-400"
              : mono
                ? "font-mono text-[0.8125rem] font-semibold"
                : "text-[0.8125rem] font-semibold tabular-nums"
          }
        >
          {shown ?? "—"}
          {shown !== null && unit && (
            <span className="ml-1 text-[0.625rem] font-normal">{unit}</span>
          )}
        </span>
        {note && (
          <span className="block text-[0.5625rem] text-neutral-500">{note}</span>
        )}
      </dd>
    </div>
  );
}

function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
