"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Network, Table as TableIcon } from "lucide-react";
import { ButtonTabBar, TabBody, type TabItem } from "@/components/ui/tab-bar";
import { FinishedProductForm } from "@/components/production/finished-product-form";
import { FinishedProductToggle } from "@/components/recipes/finished-product-toggle";
import { InstructionsTab } from "@/components/recipes/instructions-tab";
import { RecipeGearMenu } from "@/components/recipes/recipe-gear-menu";
import {
  LineDepartmentSelect,
  type DepartmentOption,
} from "@/components/recipes/department-select";
import {
  IngredientsEditor,
  type PickerOption,
} from "@/components/recipes/ingredients-editor";
import {
  TimingWindowTab,
  type MaterialOption,
  type TimingRow,
} from "@/components/recipes/timing-window-tab";
import type { InstructionStep } from "@/lib/recipes/instructions";
import type { FinishedProduct } from "@/lib/finished-products/model";
import type { OdooFinishedOption } from "@/lib/finished-products/fetch";
import { MasterBom } from "@/components/recipes/master-bom";
import { RecipeMap } from "@/components/recipes/recipe-map";
import { AllergenChips, KindTag } from "@/components/recipes/recipe-list";
import {
  RECIPE_KIND_LABEL,
  type BomRow,
  type CatalogRecipe,
  type RawRequirement,
} from "@/lib/recipes/catalog";
import {
  DataTable,
  TBody,
  TD,
  TR,
  THead,
  TableEmpty,
  TableTitle,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

export type RecipeDetailData = {
  /** The finished-product specification, when this recipe has one. */
  spec?: FinishedProduct | null;
  /** Odoo finished-goods products to pick from when creating a spec. */
  specOptions?: OdooFinishedOption[];
  specOdooError?: string | null;
  specMissingTable?: boolean;
  canEdit?: boolean;
  /** The printed method for this recipe. */
  steps?: InstructionStep[];
  stepsMissingTable?: boolean;
  /** Timing windows down the tree, for a finished product. */
  timing?: TimingRow[];
  timingMissingTable?: boolean;
  /** Raw materials in the tree that could carry their own window. */
  timingMaterials?: MaterialOption[];
  materialWindowsMissingTable?: boolean;
  /** Materials and subrecipes offered when adding an ingredient. */
  pickerOptions?: PickerOption[];
  /** Departments a recipe can be moved between, each with its line. */
  departments?: DepartmentOption[];
  /** Every production line from settings. */
  lines?: string[];
  recipe: CatalogRecipe;
  raws: RawRequirement[];
  bom: BomRow[];
  usedIn: { id: string; wipCode: string; name: string; qty: number; uom: string | null }[];
};

/**
 * One recipe. Every tab shares the same frame: a section heading, then a table
 * built from the same Th/Td pieces, so moving between tabs never changes the
 * visual language - only the columns.
 */
export function RecipeDetail({ data }: { data: RecipeDetailData }) {
  const { recipe, raws, usedIn, bom } = data;
  const [tab, setTab] = useState("ingredients");

  const tabs: TabItem[] = [
    { id: "ingredients", label: "Ingredients", count: recipe.lines.length },
    // Ticking "Finished product" reveals the tabs that only mean anything for
    // one: when it may be made, how it stacks, and how it is labelled.
    ...(recipe.isFinished
      ? ([
          { id: "timing", label: "Timing window" },
          { id: "pallets", label: "Pallets" },
          { id: "spec", label: "Specification" },
        ] satisfies TabItem[])
      : []),
    { id: "method", label: "Instruction", count: data.steps?.length ?? 0 },
    { id: "bom", label: "Master BOM", count: bom.length },
    { id: "raws", label: "Raw materials", count: raws.length },
    { id: "used", label: "Used in", count: usedIn.length },
    { id: "issues", label: "Review", count: recipe.issues.length },
  ];

  // Carlos asked for a finished product to look different the moment it opens,
  // because the specification, the label and the pallet only exist here and
  // mistaking a subrecipe for one is the expensive direction of that mistake.
  const finishedTreatment = recipe.isFinished;

  return (
    <div className="flex flex-col">
      {/* Header sheet */}
      <div
        className={cn(
          "border-b px-3 pt-3 sm:px-4",
          finishedTreatment
            ? "border-b-2 border-b-brand/40 bg-brand-muted/50"
            : "border-border bg-card"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className={cn(
                "text-xl font-bold",
                finishedTreatment && "text-primary"
              )}
            >
              {recipe.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{recipe.wipCode}</span>
              <KindTag kind={recipe.kind} />
              <span>{recipe.department}</span>
              {recipe.issues.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-muted px-2 py-0.5 text-[0.6875rem] font-medium text-warning-foreground">
                  <AlertTriangle className="size-3" />
                  {recipe.issues.length} to review
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <RecipeGearMenu recipeId={recipe.id} recipeName={recipe.name} />
            <FinishedProductToggle
              recipeId={recipe.id}
              isFinished={recipe.isFinished}
              canEdit={data.canEdit ?? false}
            />
            <Stat label="Ingredients" value={recipe.lines.length} />
            <Stat label="Raw materials" value={raws.length} />
            <Stat label="Used in" value={usedIn.length} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Type" value={RECIPE_KIND_LABEL[recipe.kind]} />
          <div className="min-w-0">
            <dt className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Line &amp; department
            </dt>
            <dd className="mt-0.5">
              <LineDepartmentSelect
                recipeId={recipe.id}
                department={recipe.department}
                options={data.departments ?? []}
                lines={data.lines ?? []}
                canEdit={data.canEdit ?? false}
              />
            </dd>
          </div>
          <Field
            label="Makes"
            value={
              recipe.batchSize
                ? `${recipe.batchSize} ${recipe.uom?.toLowerCase() ?? ""}`
                : `1 ${recipe.uom?.toLowerCase() ?? "unit"}`
            }
          />
          <Field label="Status" value={recipe.active ? "Active" : "Archived"} />
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Allergens
              <span className="ml-1.5 normal-case opacity-70">
                inherited from ingredients
              </span>
            </dt>
            <dd className="mt-0.5 flex flex-col gap-1">
              <AllergenChips recipe={recipe} />
              {recipe.allergensUnverified.length > 0 && (
                <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                  No allergen statement in Odoo for{" "}
                  <span className="font-medium">
                    {recipe.allergensUnverified.slice(0, 4).join(", ")}
                  </span>
                  {recipe.allergensUnverified.length > 4 &&
                    ` and ${recipe.allergensUnverified.length - 4} more`}
                  . This list is a floor until those are filled in.
                </p>
              )}
            </dd>
          </div>
        </dl>

        <ButtonTabBar
          items={tabs}
          activeId={tab}
          onSelect={setTab}
          className="mt-3 -mx-3 border-b-0 sm:-mx-4"
        />
      </div>

      <TabBody>
        {tab === "ingredients" && (
          <IngredientsEditor
            recipeId={recipe.id}
            recipeUom={recipe.uom}
            initialLines={recipe.lines.map((line) => ({
              id: line.id,
              ingredientName: line.materialName ?? line.ingredientName,
              materialId: line.materialId,
              subRecipeId: line.subRecipeId,
              quantity: line.quantity,
              uom: line.uom,
              displayUom: line.displayUom,
              lossPct: line.lossPct,
            }))}
            initialBatchSize={recipe.batchSize}
            initialBatchYield={recipe.batchYield}
            initialCallBasis={recipe.callBasis}
            kind={recipe.kind}
            options={data.pickerOptions ?? []}
            canEdit={data.canEdit ?? false}
          />
        )}
        {tab === "method" && (
          <InstructionsTab
            recipeId={recipe.id}
            steps={data.steps ?? []}
            missingTable={data.stepsMissingTable ?? false}
            canEdit={data.canEdit ?? false}
          />
        )}
        {tab === "timing" && (
          <TimingWindowTab
            rows={data.timing ?? []}
            materials={data.timingMaterials ?? []}
            missingTable={data.timingMissingTable ?? false}
            materialsMissingTable={data.materialWindowsMissingTable ?? false}
            canEdit={data.canEdit ?? false}
          />
        )}
        {tab === "pallets" && (
          <SpecificationTab
            recipeId={recipe.id}
            recipeName={recipe.name}
            spec={data.spec ?? null}
            options={data.specOptions ?? []}
            odooError={data.specOdooError ?? null}
            missingTable={data.specMissingTable ?? false}
            section="pallet"
          />
        )}
        {tab === "spec" && (
          <SpecificationTab
            recipeId={recipe.id}
            recipeName={recipe.name}
            spec={data.spec ?? null}
            options={data.specOptions ?? []}
            odooError={data.specOdooError ?? null}
            missingTable={data.specMissingTable ?? false}
            section="spec"
          />
        )}
        {tab === "bom" && (
          <BomTab
            rows={bom}
            rootName={recipe.name}
            rootCode={recipe.wipCode}
            rootUom={recipe.uom}
          />
        )}
        {tab === "raws" && <RawMaterialsTab recipe={recipe} raws={raws} />}
        {tab === "used" && <UsedInTab usedIn={usedIn} />}
        {tab === "issues" && <IssuesTab recipe={recipe} />}
      </TabBody>
    </div>
  );
}

/* ---------------- tabs ---------------- */

/**
 * The bill of materials, as a table or as a tree.
 *
 * Two renderings of the same explosion, so they belong behind one tab rather
 * than two: the table is for reading numbers off, the map is for seeing how
 * deep something goes. Splitting them made you choose before you knew which
 * question you had.
 */
function BomTab({
  rows,
  rootName,
  rootCode,
  rootUom,
}: {
  rows: BomRow[];
  rootName: string;
  rootCode: string;
  rootUom: string | null;
}) {
  const [shape, setShape] = useState<"table" | "map">("table");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-3 sm:px-4">
        {(["table", "map"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setShape(option)}
            aria-pressed={shape === option}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
              shape === option
                ? "bg-accent font-medium text-accent-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {option === "table" ? (
              <TableIcon className="size-3.5" />
            ) : (
              <Network className="size-3.5" />
            )}
            {option === "table" ? "Table" : "Map"}
          </button>
        ))}
      </div>

      {shape === "table" ? (
        <MasterBom rows={rows} rootName={rootName} rootUom={rootUom} />
      ) : (
        <RecipeMap
          rows={rows}
          rootName={rootName}
          rootCode={rootCode}
          rootUom={rootUom}
        />
      )}
    </div>
  );
}

function RawMaterialsTab({
  recipe,
  raws,
}: {
  recipe: CatalogRecipe;
  raws: RawRequirement[];
}) {
  return (
    <Section
      title={`Raw materials per 1 ${recipe.uom?.toLowerCase() ?? "unit"}`}
    >
      <Table columns={["Number", "Material", "Qty", "U/M"]} numeric={[2]}>
        {raws.map((raw) => (
          <TR key={raw.key}>
            <Td mono muted>
              {raw.code ?? ""}
            </Td>
            <Td>
              {raw.name}
              {raw.unlinked && (
                <span className="ml-2">
                  <Chip tone="warning">not linked</Chip>
                </span>
              )}
            </Td>
            <Td numeric>{fmt(raw.qty, 4)}</Td>
            <Td muted>{raw.uom?.toLowerCase() ?? ""}</Td>
          </TR>
        ))}
        {raws.length === 0 && <Empty colSpan={4}>Nothing to explode.</Empty>}
      </Table>
    </Section>
  );
}

function UsedInTab({ usedIn }: { usedIn: RecipeDetailData["usedIn"] }) {
  return (
    <Section title="Consumed by">
      <Table columns={["Number", "Recipe", "Qty", "U/M"]} numeric={[2]}>
        {usedIn.map((row) => (
          <TR key={row.id}>
            <Td mono muted>
              {row.wipCode}
            </Td>
            <Td>
              <Link href={`/recipes/${row.id}`} className="text-primary hover:underline">
                {row.name}
              </Link>
            </Td>
            <Td numeric>{fmt(row.qty, 3)}</Td>
            <Td muted>{row.uom?.toLowerCase() ?? ""}</Td>
          </TR>
        ))}
        {usedIn.length === 0 && (
          <Empty colSpan={4}>Not used by any other recipe.</Empty>
        )}
      </Table>
    </Section>
  );
}

function IssuesTab({ recipe }: { recipe: CatalogRecipe }) {
  return (
    <Section title="Needs review">
      {recipe.issues.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing to review — every line resolves and quantities are set.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {recipe.issues.map((issue) => (
            <li
              key={issue}
              className="flex items-start gap-2 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---------------- shared pieces: identical in every tab ---------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <TableTitle>{title}</TableTitle>
      {children}
    </section>
  );
}

function Table({
  columns,
  numeric = [],
  children,
}: {
  columns: string[];
  numeric?: number[];
  children: React.ReactNode;
}) {
  return (
    <DataTable>
      <THead
        columns={columns.map((label, index) => ({
          label,
          numeric: numeric.includes(index),
        }))}
      />
      <TBody>{children}</TBody>
    </DataTable>
  );
}

function Td(props: React.ComponentProps<typeof TD>) {
  return <TD {...props} />;
}

function Empty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return <TableEmpty colSpan={colSpan}>{children}</TableEmpty>;
}

function Chip({
  tone,
  children,
}: {
  tone: "brand" | "muted" | "warning";
  children: React.ReactNode;
}) {
  const styles = {
    brand: "bg-brand-muted text-primary",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-warning-muted text-warning-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[0.6875rem] font-medium",
        styles[tone]
      )}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-1.5 text-center">
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * The finished-product specification, shown as a tab on the recipe rather
 * than a page of its own.
 *
 * Keeping it here is the point: the formula and the pallet it ships on are
 * two halves of the same product, and holding them in separate records is
 * what let cases-per-pallet be 45 in one sheet and 135 in another.
 */
function SpecificationTab({
  recipeId,
  recipeName,
  spec,
  options,
  odooError,
  missingTable,
  section = "all",
}: {
  recipeId: string;
  recipeName: string;
  spec: FinishedProduct | null;
  options: OdooFinishedOption[];
  odooError: string | null;
  missingTable: boolean;
  section?: "all" | "pallet" | "spec";
}) {
  if (missingTable) {
    return (
      <div className="px-3 py-4 sm:px-4">
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The specification table does not exist yet. Run the{" "}
            <code>20260828_finished_products</code> migration, then reload.
          </span>
        </div>
      </div>
    );
  }

  return (
    <FinishedProductForm
      product={spec}
      options={options}
      odooError={odooError}
      recipeId={recipeId}
      recipeName={recipeName}
      section={section}
    />
  );
}
