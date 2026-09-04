"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RecipeIdentity } from "@/components/recipes/recipe-identity";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  CornerUpRight,
  Network,
  Pencil,
  Printer,
  Table as TableIcon,
  Wheat,
} from "lucide-react";
import { ButtonTabBar, TabBody, type TabItem } from "@/components/ui/tab-bar";
import {
  FinishedProductForm,
  type SpecSaveStatus,
} from "@/components/production/finished-product-form";
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
import { RecipeHistoryTab } from "@/components/recipes/recipe-history-tab";
import type { RecipeChange } from "@/lib/recipes/change-log";
import { RecipeMap } from "@/components/recipes/recipe-map";
import { AllergenChips, KindTag } from "@/components/recipes/recipe-list";
import { departmentColor } from "@/lib/production/department-colors";
import {
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
  /** What a case can be counted in, from Recipes > Settings. */
  caseUnits?: string[];
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
  /** The colour key this recipe's department was given in Settings. */
  departmentColor?: string | null;
  /** Its position in the department list, for the automatic fallback. */
  departmentIndex?: number;
  /** Departments a recipe can be moved between, each with its line. */
  departments?: DepartmentOption[];
  /** Every production line from settings. */
  lines?: string[];
  /** Who changed this recipe and when. Only loaded for admins. */
  changes?: RecipeChange[];
  recipe: CatalogRecipe;
  raws: RawRequirement[];
  bom: BomRow[];
  usedIn: { id: string; wipCode: string; name: string; qty: number; uom: string | null }[];
};

/**
 * A recipe, whole.
 *
 * The band across the top says which recipe and where it is made, in that
 * department's own colour. The work is in three tabs on the left. Everything
 * that describes the recipe rather than being part of it lives in one rail on
 * the right, because it used to be spread across the top, the middle and the
 * bottom, and finding one number meant scanning all three.
 */
export function RecipeDetail({ data }: { data: RecipeDetailData }) {
  const { recipe, raws, usedIn, bom } = data;
  const [tab, setTab] = useState("ingredients");
  /** Where the specification's saving stands, for the cloud by the name. */
  const [specStatus, setSpecStatus] = useState<SpecSaveStatus | null>(null);
  const specSaveNow = useRef<(() => void) | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  /**
   * One edit mode for the whole recipe.
   *
   * The name, the item number, where it is made and the quantities are all
   * corrected in the same sitting, so one switch opens all of them rather
   * than a pencil beside each.
   */
  const [editing, setEditing] = useState(false);
  /**
   * A rejected rename holds the page open.
   *
   * The item number is the identity, so a clash is not something to shrug
   * past - if you could leave edit mode with it unsaved you would believe the
   * number you typed. Shown in the middle of the screen, where it cannot be
   * missed, and edit mode stays on until it is dealt with.
   */
  const [identityError, setIdentityError] = useState<string | null>(null);
  /**
   * The rail slot the ingredients form fills in.
   *
   * A ref callback rather than a lookup: it is null on the server and on the
   * first client render, so the two agree, and the portal appears once the
   * node exists.
   */
  const [railNode, setRailNode] = useState<HTMLDivElement | null>(null);

  // The colour this department carries everywhere else in the app.
  const deptLook = departmentColor(
    data.departmentColor ?? null,
    data.departmentIndex ?? 0
  );

  const tabs: TabItem[] = [
    { id: "ingredients", label: "Ingredients", count: recipe.lines.length },
    { id: "method", label: "Instruction", count: data.steps?.length ?? 0 },
    // Raw materials and Used in are consequences of the BOM, not separate
    // subjects, so they live under it rather than as tabs of their own.
    { id: "bom", label: "Master BOM", count: bom.length },
    /*
      A finished product carries two more, and they come last.

      Every recipe is made the same way - what goes in it, how, and what that
      explodes to - so those three tabs sit in the same place whatever you
      open. What a finished product needs on top of that is about the case it
      ships in, not about making it, so it follows rather than interrupting.
    */
    ...(recipe.isFinished
      ? ([
          { id: "timing", label: "Timing window" },
          { id: "spec", label: "Specification" },
        ] satisfies TabItem[])
      : []),
    // Admins only, and last: it is about the recipe's paperwork, not about
    // making it.
    ...((data.canEdit ?? false)
      ? ([
          {
            id: "history",
            label: "History",
            count: data.changes?.length ?? 0,
          },
        ] satisfies TabItem[])
      : []),
  ];

  const finishedTreatment = recipe.isFinished;

  return (
    <div className="flex min-h-full flex-col">
      {identityError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm rounded-sm bg-card p-4 shadow-lg ring-2 ring-destructive">
            <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertTriangle className="size-4" />
              That item number is taken
            </h2>
            <p className="mt-1.5 text-sm">{identityError}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Two recipes answering to one number is worse than one with the
              wrong number, so this one has not been saved. Pick another.
            </p>
            <button
              type="button"
              onClick={() => setIdentityError(null)}
              className="mt-3 h-8 w-full rounded-sm bg-destructive text-sm font-medium text-white"
            >
              Let me fix it
            </button>
          </div>
        </div>
      )}

      {/*
        The band takes the department's own colour.

        The same colour this department has on the plan and in WIP, so opening
        a recipe you already know the colour of confirms where you are before
        you read a word. Finished products keep the brand blue, because on the
        plan they are the thing everything else hangs off.
      */}
      <div
        className={cn(
          "sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px))] z-30 border-b-2 border-b-foreground/20 px-3 py-2.5 sm:px-4",
          finishedTreatment ? "bg-brand-muted" : deptLook.tint
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* Top left, first thing on the page: everything below unlocks
              together, so the switch that does it goes where you start. */}
          {(data.canEdit ?? false) && (
            <button
              type="button"
              onClick={() => {
                if (identityError) return;
                setEditing((value) => !value);
              }}
              aria-pressed={editing}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
                editing
                  ? "bg-success text-white"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {editing ? (
                <Check className="size-3.5" />
              ) : (
                <Pencil className="size-3.5" />
              )}
              {editing ? "Editing" : "Edit recipe"}
            </button>
          )}

          <RecipeIdentity
            recipeId={recipe.id}
            wipCode={recipe.wipCode}
            name={recipe.name}
            isFinished={finishedTreatment}
            editing={(data.canEdit ?? false) && editing}
            onError={setIdentityError}
          />

          {/* The department is stated once, in the rail. It was here too, and
              twice is one place too many to keep in agreement. */}
          <KindTag kind={recipe.kind} />

          {specStatus && (
            <SaveCloud status={specStatus} onSave={() => specSaveNow.current?.()} />
          )}

          {/* The Review tab is gone; the badge opens what it used to hold. */}
          {recipe.issues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIssues((value) => !value)}
              aria-expanded={showIssues}
              className="ml-auto inline-flex items-center gap-1 rounded-sm bg-foreground px-1.5 py-0.5 text-[0.6875rem] font-semibold text-background"
            >
              <AlertTriangle className="size-3" />
              {recipe.issues.length} to review
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  showIssues && "rotate-180"
                )}
              />
            </button>
          )}
        </div>

        {showIssues && recipe.issues.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 border-l-2 border-warning-foreground bg-warning-muted px-2.5 py-1.5">
            {recipe.issues.map((issue) => (
              <li key={issue} className="text-xs text-warning-foreground">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-surface-sunk px-3 py-3 sm:px-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col rounded-sm bg-card ring-1 ring-foreground/10">
          {/* Frozen: the tabs stay put while a long ingredient list or the
              specification scrolls underneath them. */}
          <div className="sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+var(--recipe-band-height,4.25rem))] z-20 bg-card">
            <ButtonTabBar items={tabs} activeId={tab} onSelect={setTab} />
          </div>

          <TabBody className="flex-1 !px-0 !py-0">
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
                editing={editing}
                setEditing={setEditing}
                railPanel={railNode}
                footer={
                  /* Under the list, because that is what they come from:
                     every allergen here is inherited from a line above. */
                  <section className="border-t-2 border-border px-3 py-2.5 sm:px-4">
                    <h3 className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                      Allergens
                      <span className="ml-1.5 font-normal tracking-normal normal-case">
                        inherited from the ingredients above
                      </span>
                    </h3>
                    <div className="mt-1 flex flex-col gap-1">
                      <AllergenChips recipe={recipe} />
                      {recipe.allergensUnverified.length > 0 && (
                        <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                          No statement in Odoo for{" "}
                          <span className="font-medium">
                            {recipe.allergensUnverified.slice(0, 4).join(", ")}
                          </span>
                          {recipe.allergensUnverified.length > 4 &&
                            ` and ${recipe.allergensUnverified.length - 4} more`}
                          . This list is a floor until those are filled in.
                        </p>
                      )}
                    </div>
                  </section>
                }
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
            {tab === "spec" && (
              <SpecificationTab
                recipeId={recipe.id}
                recipeName={recipe.name}
                recipeCode={recipe.wipCode}
                spec={data.spec ?? null}
                missingTable={data.specMissingTable ?? false}
                caseUnits={data.caseUnits}
                canEdit={(data.canEdit ?? false) && editing}
                onStatus={setSpecStatus}
                saveNowRef={specSaveNow}
              />
            )}
            {tab === "bom" && (
              <BomTab
                rows={bom}
                rootName={recipe.name}
                rootCode={recipe.wipCode}
                rootUom={recipe.uom}
                recipe={recipe}
                raws={raws}
                usedIn={usedIn}
              />
            )}
            {tab === "history" && (
              <RecipeHistoryTab changes={data.changes ?? []} />
            )}
          </TabBody>
        </div>

        {/* The rail: everything that describes the recipe, in one column. */}
        <aside className="flex shrink-0 flex-col gap-2 lg:w-60">
          <div className="flex items-center gap-1.5">
            <RecipeGearMenu
              recipeId={recipe.id}
              recipeName={recipe.name}
              isFinished={recipe.isFinished}
              isArchived={recipe.archivedAt !== null}
              usedInCount={usedIn.length}
              isAdmin={data.canEdit ?? false}
            />
            <Link
              href={`/recipes/${recipe.id}/print`}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Printer className="size-3.5" />
              Batch record
            </Link>
          </div>

          {/*
            One card, not four.

            Where it is made, what it is measured in, how it is called out and
            what a batch makes are all the same question - how this recipe
            runs - and splitting them across four boxes made you read four
            headings to find one number.
          */}
          <RailCard title="How it runs" grow>
            <LineDepartmentSelect
              recipeId={recipe.id}
              department={recipe.department}
              options={data.departments ?? []}
              lines={data.lines ?? []}
              canEdit={(data.canEdit ?? false) && editing}
            />
            <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5 text-xs">
              <span className="text-muted-foreground">Measured in</span>
              <span className="font-semibold uppercase">
                {recipe.uom?.toLowerCase() ?? "—"}
              </span>
            </div>
            {/* The editor fills this in through a portal: it owns the values
                and saves them with the lines. */}
            <div ref={setRailNode} className="contents" />
          </RailCard>
        </aside>
      </div>
    </div>
  );
}

function RailCard({
  title,
  note,
  grow,
  children,
}: {
  title: string;
  note?: string;
  /** Runs to the bottom of the rail, so the column ends where the page does. */
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    // White card on a grey page: the rail reads as a stack of notes pinned
    // beside the work, rather than another panel competing with it.
    <section
      className={cn(
        "rounded-sm bg-white ring-1 ring-foreground/10 dark:bg-card",
        grow && "flex-1"
      )}
    >
      <h3 className="flex items-baseline justify-between gap-2 border-b border-border px-2 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>{title}</span>
        {note && <span className="font-normal tracking-normal">{note}</span>}
      </h3>
      <div className="flex flex-col gap-1.5 p-2">{children}</div>
    </section>
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
const BOM_VIEWS = [
  { id: "table", label: "Table", icon: TableIcon },
  { id: "map", label: "Map", icon: Network },
  { id: "raws", label: "Raw materials", icon: Wheat },
  { id: "used", label: "Used in", icon: CornerUpRight },
] as const;

type BomView = (typeof BOM_VIEWS)[number]["id"];

function BomTab({
  rows,
  rootName,
  rootCode,
  rootUom,
  recipe,
  raws,
  usedIn,
}: {
  rows: BomRow[];
  rootName: string;
  rootCode: string;
  rootUom: string | null;
  recipe: CatalogRecipe;
  raws: RawRequirement[];
  usedIn: RecipeDetailData["usedIn"];
}) {
  const [shape, setShape] = useState<BomView>("table");

  const counts: Record<BomView, number | null> = {
    table: rows.length,
    map: null,
    raws: raws.length,
    used: usedIn.length,
  };

  return (
    <div className="flex flex-col">
      {/* What the tree adds up to, above the views that show it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-sunk px-3 py-1.5 text-xs sm:px-4">
        <Tally label="Ingredients" value={recipe.lines.length} />
        <Tally label="Lines in the tree" value={rows.length} />
        <Tally label="Raw materials" value={raws.length} />
        <Tally label="Used in" value={usedIn.length} />
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 pt-3 sm:px-4">
        {BOM_VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setShape(id)}
            aria-pressed={shape === id}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs transition-colors",
              shape === id
                ? "bg-primary font-medium text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {counts[id] !== null && (
              <span className="tabular-nums opacity-60">{counts[id]}</span>
            )}
          </button>
        ))}
      </div>

      {shape === "raws" && <RawMaterialsTab recipe={recipe} raws={raws} />}
      {shape === "used" && <UsedInTab usedIn={usedIn} />}

      {shape === "table" ? (
        <MasterBom rows={rows} rootName={rootName} rootUom={rootUom} />
      ) : shape === "map" ? (
        <RecipeMap
          rows={rows}
          rootName={rootName}
          rootCode={rootCode}
          rootUom={rootUom}
        />
      ) : null}
    </div>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
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


/* ---------------- shared pieces: identical in every tab ---------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 px-3 py-3 sm:px-4">
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
  recipeCode,
  spec,
  missingTable,
  caseUnits,
  canEdit,
  onStatus,
  saveNowRef,
}: {
  recipeId: string;
  recipeName: string;
  recipeCode: string;
  spec: FinishedProduct | null;
  missingTable: boolean;
  caseUnits?: string[];
  /** Edit recipe is the one switch: off, the specification is read only. */
  canEdit: boolean;
  onStatus: (status: SpecSaveStatus) => void;
  saveNowRef: React.MutableRefObject<(() => void) | null>;
}) {
  // Pallets is part of the specification, not a rival to it: how a case is
  // built and what is in it are the same document, read in one sitting.
  const [view, setView] = useState<"spec" | "pallet">("spec");
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
      recipeId={recipeId}
      recipeName={recipeName}
      recipeCode={recipeCode}
      caseUnits={caseUnits}
      section={view}
      onSectionChange={setView}
      readOnly={!canEdit}
      autosave={canEdit}
      onStatus={onStatus}
      saveNowRef={saveNowRef}
    />
  );
}

/**
 * The little cloud by the recipe's name.
 *
 * Green when the specification is stored, amber while a change waits its
 * moment, pulsing while it writes, red if the write failed. Clicking it saves
 * now rather than in a moment.
 */
function SaveCloud({ status, onSave }: { status: SpecSaveStatus; onSave: () => void }) {
  const look = {
    saved: { Icon: CloudCheck, tone: "text-success", label: "Specification saved" },
    dirty: { Icon: Cloud, tone: "text-warning-foreground", label: "Changes waiting - saving in a moment. Click to save now." },
    saving: { Icon: CloudUpload, tone: "text-primary animate-pulse", label: "Saving the specification…" },
    error: { Icon: CloudAlert, tone: "text-destructive", label: "The specification could not be saved. Click to try again." },
  }[status];
  return (
    <button
      type="button"
      onClick={onSave}
      title={look.label}
      aria-label={look.label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm transition-colors hover:bg-muted",
        look.tone
      )}
    >
      <look.Icon className="size-4" />
    </button>
  );
}
