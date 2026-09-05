"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { RECIPE_KIND_SHORT, type CatalogRecipe } from "@/lib/recipes/catalog";
import type { RecipeKind } from "@/lib/production/wip-explode";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { NewRecipeDialog } from "@/components/recipes/new-recipe-dialog";
import type { OdooFinishedOption } from "@/lib/finished-products/fetch";
import { FinishedStar } from "@/components/recipes/finished-star";
import {
  RecipeScope,
  type ScopeDepartment,
  type ScopeFinished,
} from "@/components/recipes/recipe-scope";
import { SearchPanel } from "@/components/ui/search-panel";
import { Hint } from "@/components/settings/shared";
import {
  departmentColor,
  type DepartmentColor,
} from "@/lib/production/department-colors";
import { cn } from "@/lib/utils";

type SortKey = "wipCode" | "name" | "kind" | "department" | "lines";

const KINDS: RecipeKind[] = ["finished", "assembly", "kitchen"];

/** Rows are one line each; the shared TD is a touch taller than that. */
const CELL = "py-1 text-[0.8125rem]";

/**
 * Every recipe in the plant, as a sheet.
 *
 * The line and the area are chosen up in the page header, the same pair the
 * plan uses. Down here is what is left: a search, the kind, and the two
 * housekeeping filters. The summary card says what the sheet holds before
 * the sheet is read, and colour does the rest - each department keeps the
 * colour Settings gave it, a finished product carries the star, and a kind
 * has a tint of its own.
 */
export function RecipeList({
  recipes,
  departmentLines = {},
  departmentColors = [],
  lines = [],
  departments = [],
  finished = [],
  scopeLine = null,
  scopeDept = null,
  treeRootId = null,
  canCreate = false,
  odooOptions = [],
  odooError = null,
}: {
  recipes: CatalogRecipe[];
  /** Department name -> production line name, from Production settings. */
  departmentLines?: Record<string, string>;
  /** Department name -> colour key chosen in Settings, in settings order. */
  departmentColors?: [string, string | null][];
  /** Active lines, for the line buttons. */
  lines?: string[];
  /** Every department with the line it belongs to, for the area select. */
  departments?: ScopeDepartment[];
  /** From the URL: one line, or null for all of them. */
  scopeLine?: string | null;
  /** From the URL: "__finished__", a department name, or null for all. */
  scopeDept?: string | null;
  /** Finished products offered in the Tree select. */
  finished?: ScopeFinished[];
  /** From the URL: show this finished product's family tree instead. */
  treeRootId?: string | null;
  canCreate?: boolean;
  /** Finished goods from Odoo, so a new one is picked rather than typed. */
  odooOptions?: OdooFinishedOption[];
  odooError?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groupByDept, setGroupByDept] = useState(false);

  /**
   * Every filter as one list of ids, which is what the pills in the search
   * field are. Decoded back into the values the list already filters on.
   */
  const [filters, setFilters] = useState<string[]>([]);
  const onlyIssues = filters.includes("issues");
  /** Archived recipes are out of the way unless asked for by name. */
  const showArchived = filters.includes("archived");
  const kind = (filters
    .find((id) => id.startsWith("kind:"))
    ?.slice(5) ?? "") as RecipeKind | "";

  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);

  /**
   * One colour per department, for the whole page.
   *
   * A department keeps whatever colour Settings gave it; one nobody has
   * chosen for takes the palette in order, after the configured ones, so
   * the same department is the same colour here as on the plan.
   */
  const looks = useMemo(() => {
    const map = new Map<string, DepartmentColor>();
    let index = 0;
    for (const [name, key] of departmentColors) {
      map.set(name, departmentColor(key, index));
      index += 1;
    }
    for (const recipe of recipes) {
      const name = recipe.department ?? "—";
      if (map.has(name)) continue;
      map.set(name, departmentColor(null, index));
      index += 1;
    }
    return map;
  }, [departmentColors, recipes]);

  const sameName = (a: string | null, b: string) =>
    (a ?? "").trim().toUpperCase() === b.trim().toUpperCase();

  /**
   * One finished product's family, in build order.
   *
   * The bowl, then what it is assembled from, then what those are mixed
   * from, down to the cuts - each recipe once, at the first depth it appears.
   * For fixing a recipe and seeing everything it touches.
   */
  const tree = useMemo(() => {
    if (!treeRootId) return null;
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const root = byId.get(treeRootId);
    if (!root) return null;
    const order: { recipe: CatalogRecipe; depth: number }[] = [];
    const depthOf = new Map<string, number>();
    const walk = (recipe: CatalogRecipe, depth: number, trail: Set<string>) => {
      if (depth > 12 || trail.has(recipe.id)) return;
      if (!depthOf.has(recipe.id)) {
        depthOf.set(recipe.id, depth);
        order.push({ recipe, depth });
      }
      trail.add(recipe.id);
      for (const line of recipe.lines) {
        const child = line.subRecipeId ? byId.get(line.subRecipeId) : undefined;
        if (child) walk(child, depth + 1, trail);
      }
      trail.delete(recipe.id);
    };
    walk(root, 0, new Set());
    return { root, order, depthOf };
  }, [recipes, treeRootId]);

  /** What the header narrowed the sheet to, before the search does its part. */
  const scoped = useMemo(
    () =>
      tree
        ? tree.order.map((entry) => entry.recipe)
        : recipes.filter((recipe) => {
        if (
          scopeLine &&
          departmentLines[recipe.department ?? ""] !== scopeLine
        ) {
          return false;
        }
        if (scopeDept === "__finished__") return recipe.isFinished;
        if (scopeDept) return sameName(recipe.department, scopeDept);
        return true;
      }),
    [recipes, scopeLine, scopeDept, departmentLines, tree]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = scoped.filter((recipe) => {
      if (recipe.archivedAt !== null && !showArchived) return false;
      if (kind && recipe.kind !== kind) return false;
      if (onlyIssues && recipe.issues.length === 0) return false;
      if (!needle) return true;
      const haystack = `${recipe.wipCode} ${recipe.name} ${recipe.lines
        .map((line) => line.ingredientName)
        .join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });

    // A tree reads top to bottom; sorting it would scramble the story.
    if (tree) return filtered;

    return filtered.sort((a, b) => {
      const av = sort === "lines" ? a.lines.length : (a[sort] ?? "");
      const bv = sort === "lines" ? b.lines.length : (b[sort] ?? "");
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return (
        String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
      );
    });
  }, [scoped, query, kind, onlyIssues, showArchived, sort, dir, tree]);

  const grouped = useMemo(() => {
    if (!groupByDept) return null;
    const map = new Map<string, CatalogRecipe[]>();
    for (const recipe of rows) {
      const key = recipe.department ?? "—";
      const bucket = map.get(key);
      if (bucket) bucket.push(recipe);
      else map.set(key, [recipe]);
    }
    // Line first, then department, so the sheet reads the way the plant does.
    return [...map.entries()].sort(
      (a, b) =>
        (departmentLines[a[0]] ?? "").localeCompare(departmentLines[b[0]] ?? "") ||
        a[0].localeCompare(b[0])
    );
  }, [rows, groupByDept, departmentLines]);

  /** What the summary card says, about what the header narrowed to. */
  const summary = useMemo(() => {
    const live = scoped.filter((recipe) => recipe.archivedAt === null);
    return {
      total: live.length,
      finished: live.filter((recipe) => recipe.isFinished).length,
      review: live.filter((recipe) => recipe.issues.length > 0).length,
      unverified: live.filter((recipe) => recipe.allergensUnverified.length > 0)
        .length,
      archived: scoped.length - live.length,
    };
  }, [scoped]);

  const filterGroups = useMemo(
    () => [
      {
        items: [
          { id: "issues", label: "Needs review" },
          { id: "archived", label: "Show archived" },
        ],
      },
      {
        exclusive: true,
        items: KINDS.map((option) => ({
          id: `kind:${option}`,
          label: RECIPE_KIND_SHORT[option],
        })),
      },
    ],
    []
  );

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((value) => -value);
    else {
      setSort(key);
      setDir(1);
    }
  }

  const sortProps = (key: SortKey) => ({
    onSort: () => toggleSort(key),
    sorted: sort === key,
    dir,
  });

  const COLUMNS = 9;
  const scopeLabel =
    tree
      ? `recipes under ${tree.root.name}`
      : scopeDept === "__finished__"
      ? "finished products"
      : scopeDept
        ? scopeDept
        : scopeLine
          ? `${scopeLine} recipes`
          : "recipes";

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      {/*
        The sheet's summary, before the sheet.

        Big numbers left, in the colours the sheet itself uses; the action on
        the right. What the header narrowed to is what is counted, so
        switching line changes the numbers rather than the caption.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big
          tone="blue"
          value={String(summary.total)}
          label={scopeLabel}
          hint="Active recipes in what the header is pointed at. Archived ones are counted separately."
        />
        {scopeDept !== "__finished__" && (
          <Big
            tone="green"
            value={String(summary.finished)}
            label="finished products"
            hint="Recipes marked with the star. They are what the plan cascades from."
          />
        )}
        <Big
          tone={summary.review > 0 ? "amber" : "muted"}
          value={String(summary.review)}
          label="need review"
          hint="Something stops the recipe being trusted downstream: an ingredient not linked, a zero quantity, a missing unit."
        />
        <Big
          tone={summary.unverified > 0 ? "amber" : "muted"}
          value={String(summary.unverified)}
          label="allergens unverified"
          hint="An ingredient beneath the recipe never answered the allergen question in Odoo, so its allergen list is a floor, not the whole truth."
        />
        {/*
          Archiving takes a recipe out of every list, which also takes away the
          way back to it - the filter that shows them again was in the search
          panel and nobody found it. The count is the way in: tap it and the
          archived rows appear, tap it again and they are gone.
        */}
        {summary.archived > 0 && (
          <Big
            tone="muted"
            value={String(summary.archived)}
            label="archived"
            hint="Out of every list and unpickable. Tap the number to show them here."
            pressed={showArchived}
            onClick={() =>
              setFilters((current) =>
                current.includes("archived")
                  ? current.filter((id) => id !== "archived")
                  : [...current, "archived"]
              )
            }
          />
        )}
      </div>

      {/*
        One row of controls, in the order the question is asked: which part
        of the plant, then what to find in it, then how to read it - and the
        one thing you can add, at the end.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <RecipeScope
          lines={lines}
          currentLine={scopeLine}
          departments={departments}
          currentArea={scopeDept ?? "__all__"}
          finished={finished}
          currentTree={treeRootId}
        />

        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          placeholder="Search recipe or ingredient…"
          aria-label="Search recipes"
          filters={filters}
          onFiltersChange={setFilters}
          filterGroups={filterGroups}
          className="min-w-56 flex-1 sm:max-w-xl"
        />

        <button
          type="button"
          onClick={() => setGroupByDept((value) => !value)}
          aria-pressed={groupByDept}
          title="Gather the rows by department"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
            groupByDept
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground ring-1 ring-foreground/15 hover:bg-muted"
          )}
        >
          By department
        </button>

        <span className="ml-auto shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
          {rows.length} / {scoped.length}
        </span>

        <NewRecipeDialog
          canCreate={canCreate}
          odooOptions={odooOptions}
          odooError={odooError}
        />
      </div>

      {/* Desktop / iPad */}
      <div className="hidden md:block">
        <DataTable>
          <THead
            columns={[
              {
                label: <FinishedStar className="size-3" />,
                title: "Finished product",
                className: "w-8 px-0 text-center",
              },
              { label: "Number", ...sortProps("wipCode"), className: "w-24" },
              { label: "Recipe", ...sortProps("name") },
              { label: "Type", ...sortProps("kind"), className: "w-24" },
              { label: "Department", ...sortProps("department"), className: "w-44" },
              { label: "Batch", numeric: true, className: "w-24" },
              { label: "Lines", numeric: true, ...sortProps("lines"), className: "w-16" },
              { label: "Allergens" },
              { label: "Status", className: "w-28" },
            ]}
          />
          <TBody>
            {grouped
              ? grouped.flatMap(([dept, list]) => {
                  const look = looks.get(dept) ?? departmentColor(null, 0);
                  return [
                    <tr
                      key={`group-${dept}`}
                      className={cn("border-y border-primary/15", look.tint)}
                    >
                      <td
                        colSpan={COLUMNS}
                        className="px-2.5 py-0.5 text-[0.625rem] font-bold tracking-wider uppercase"
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn("h-3 w-1 rounded-[1px]", look.spine)} />
                          {departmentLines[dept] && (
                            <span className="font-semibold text-muted-foreground">
                              {departmentLines[dept]}
                              <span className="mx-1 text-muted-foreground/50">›</span>
                            </span>
                          )}
                          {dept}
                          <span className="font-semibold text-muted-foreground tabular-nums">
                            {list.length}
                          </span>
                        </span>
                      </td>
                    </tr>,
                    ...list.map((recipe) => (
                      <Row
                        key={recipe.id}
                        recipe={recipe}
                        look={looks.get(recipe.department ?? "—")}
                        onOpen={router.push}
                      />
                    )),
                  ];
                })
              : rows.map((recipe) => (
                  <Row
                    key={recipe.id}
                    recipe={recipe}
                    look={looks.get(recipe.department ?? "—")}
                    depth={tree?.depthOf.get(recipe.id) ?? 0}
                    carry={tree ? `?tree=${tree.root.id}` : ""}
                    onOpen={router.push}
                  />
                ))}
            {rows.length === 0 && (
              <TableEmpty colSpan={COLUMNS}>
                No recipes match. Try another line or department up top, or
                clear the filters.
              </TableEmpty>
            )}
          </TBody>
        </DataTable>
      </div>

      {/* Phone */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((recipe) => {
          const look = looks.get(recipe.department ?? "—");
          return (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="flex flex-col gap-1.5 rounded-sm bg-card p-3 ring-1 ring-foreground/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {recipe.isFinished && <FinishedStar />}
                      <span className="min-w-0 truncate">{recipe.name}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {recipe.wipCode}
                    </span>
                  </span>
                  <StatusCell recipe={recipe} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <KindTag kind={recipe.kind} />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-[1px]",
                        look?.dot ?? "bg-muted-foreground/40"
                      )}
                    />
                    <span className="truncate">{recipe.department}</span>
                  </span>
                  <span className="ml-auto tabular-nums">
                    {recipe.lines.length} lines
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({
  recipe,
  look,
  depth = 0,
  carry = "",
  onOpen,
}: {
  recipe: CatalogRecipe;
  look: DepartmentColor | undefined;
  /** How deep in the tree, when a tree is shown. Indents the name. */
  depth?: number;
  /** Query string to carry into the recipe page, so its pager walks the tree. */
  carry?: string;
  onOpen: (href: string) => void;
}) {
  return (
    <TR
      onClick={() => onOpen(`/recipes/${recipe.id}${carry}`)}
      className={cn(recipe.archivedAt !== null && "opacity-60")}
    >
      <TD className={cn(CELL, "px-0 text-center")}>
        {recipe.isFinished && <FinishedStar className="size-3.5" />}
      </TD>
      <TD mono muted className={CELL}>
        {recipe.wipCode}
      </TD>
      <TD strong className={cn(CELL, recipe.isFinished && "text-primary")}>
        <span
          className="flex items-center gap-1.5"
          style={{ paddingInlineStart: `${Math.min(depth, 6) * 1.1}rem` }}
        >
          {depth > 0 && <span aria-hidden className="text-muted-foreground/50">└</span>}
          {recipe.name}
        </span>
      </TD>
      <TD className={CELL}>
        <KindTag kind={recipe.kind} />
      </TD>
      <TD muted className={CELL}>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-[1px]",
              look?.dot ?? "bg-muted-foreground/40"
            )}
          />
          <span className="truncate">{recipe.department ?? "—"}</span>
        </span>
      </TD>
      <TD numeric muted className={CELL}>
        {recipe.batchSize
          ? `${recipe.batchSize} ${recipe.uom?.toLowerCase() ?? ""}`
          : `per ${recipe.kind === "finished" ? "case" : "unit"}`}
      </TD>
      <TD numeric className={CELL}>
        {recipe.lines.length}
      </TD>
      <TD className={CELL}>
        <AllergenChips recipe={recipe} />
      </TD>
      <TD className={CELL}>
        <StatusCell recipe={recipe} />
      </TD>
    </TR>
  );
}

function Big({
  label,
  value,
  hint,
  tone,
  onClick,
  pressed,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "blue" | "green" | "amber" | "muted";
  /** Makes the number the way into what it counts. */
  onClick?: () => void;
  pressed?: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "blue" && "text-primary",
          tone === "green" && "text-success",
          tone === "amber" && "text-warning-foreground",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </>
  );

  if (!onClick) {
    return <span className="flex items-baseline gap-1">{inner}</span>;
  }

  /*
    The hint is a button of its own, so the count cannot be one too - the
    clickable part is the number and its label, and the "?" beside them keeps
    working as the explanation it already was.
  */
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={pressed}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "-mx-1 flex cursor-pointer items-baseline gap-1 rounded-sm px-1 transition-colors hover:bg-muted",
        pressed && "bg-foreground/10"
      )}
    >
      {inner}
    </span>
  );
}

/**
 * Allergens are inherited, so the chip explains where each one came from -
 * "Milk" on a bowl is only useful if you can see it arrived via the dressing.
 *
 * "None" is only ever printed when every food ingredient underneath actually
 * answered the question in Odoo. Where any are blank the recipe says so
 * instead: half the ingredients in use have no allergen statement yet, and
 * some of those blanks are real allergens (both soy sauces, the sesame
 * seeds). Reading silence as "clean" is how an allergen reaches a label.
 */
export function AllergenChips({ recipe }: { recipe: CatalogRecipe }) {
  const unverified = recipe.allergensUnverified;
  const unverifiedTitle =
    unverified.length > 0
      ? `No allergen statement in Odoo for: ${unverified.join(", ")}`
      : undefined;

  if (recipe.allergens.length === 0) {
    if (unverified.length === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-[1px] bg-success" />
          None
        </span>
      );
    }
    return (
      <span
        title={unverifiedTitle}
        className="inline-flex cursor-help items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground"
      >
        <HelpCircle className="size-3" />
        {unverified.length} unverified
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {recipe.allergens.map((allergen) => (
        <span
          key={allergen}
          title={`From: ${(recipe.allergenSources[allergen] ?? []).join(", ")}`}
          className="inline-flex cursor-help rounded-sm bg-warning-muted px-1.5 py-px text-[0.6875rem] font-medium text-warning-foreground"
        >
          {allergen}
        </span>
      ))}
      {unverified.length > 0 && (
        <span
          title={unverifiedTitle}
          className="inline-flex cursor-help items-center gap-1 rounded-sm bg-muted px-1.5 py-px text-[0.6875rem] font-medium text-muted-foreground"
        >
          <HelpCircle className="size-3" />
          +{unverified.length}
        </span>
      )}
    </span>
  );
}

function StatusCell({ recipe }: { recipe: CatalogRecipe }) {
  if (recipe.archivedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-[1px] bg-muted-foreground/40" />
        Archived
      </span>
    );
  }
  if (recipe.issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success">
        <span className="size-1.5 rounded-[1px] bg-success" />
        OK
      </span>
    );
  }
  return (
    <span
      title={recipe.issues.join("\n")}
      className="inline-flex shrink-0 cursor-help rounded-sm bg-warning-muted px-2 py-px text-[0.6875rem] font-medium text-warning-foreground"
    >
      {recipe.issues.length} to review
    </span>
  );
}

/**
 * The three kinds, three tints: blue for what ships, green for what is
 * assembled, amber for what is cooked - the same three the summary card and
 * the plan already lean on.
 */
export function KindTag({ kind }: { kind: RecipeKind }) {
  const styles: Record<RecipeKind, string> = {
    finished: "bg-brand-muted text-primary",
    assembly: "bg-success/10 text-success",
    kitchen: "bg-warning-muted text-warning-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-sm px-1.5 py-px text-[0.6875rem] font-medium",
        styles[kind]
      )}
    >
      {RECIPE_KIND_SHORT[kind]}
    </span>
  );
}
