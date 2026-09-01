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
import { FinishedStar } from "@/components/recipes/finished-star";
import { SearchPanel } from "@/components/ui/search-panel";
import { cn } from "@/lib/utils";

type SortKey = "wipCode" | "name" | "kind" | "department" | "lines";

/** Bucket for departments with no line assigned yet. */

const KINDS: RecipeKind[] = ["finished", "assembly", "kitchen"];

export function RecipeList({
  recipes,
  departments,
  departmentLines = {},
  initialFinishedOnly,
  canCreate = false,
}: {
  recipes: CatalogRecipe[];
  departments: string[];
  /** Department name -> production line name, from Production settings. */
  departmentLines?: Record<string, string>;
  /** Set by /recipes?kind=finished, which is where the nav points. */
  initialFinishedOnly?: boolean;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [finishedOnly, setFinishedOnly] = useState(initialFinishedOnly ?? false);
  const [groupByDept, setGroupByDept] = useState(false);

  /**
   * Every filter as one list of ids, which is what the pills in the search
   * field are. Decoded back into the values the list already filters on, so
   * only the control changed and none of the filtering did.
   */
  const [filters, setFilters] = useState<string[]>([]);

  const onlyIssues = filters.includes("issues");
  /** Archived recipes are out of the way unless asked for by name. */
  const showArchived = filters.includes("archived");
  const kind = (filters
    .find((id) => id.startsWith("kind:"))
    ?.slice(5) ?? "") as RecipeKind | "";
  const line = filters.find((id) => id.startsWith("line:"))?.slice(5) ?? "";
  const department = filters.find((id) => id.startsWith("dept:"))?.slice(5) ?? "";

  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = recipes.filter((recipe) => {
      if (recipe.archivedAt !== null && !showArchived) return false;
      if (finishedOnly && !recipe.isFinished) return false;
      if (kind && recipe.kind !== kind) return false;
      if (department && recipe.department !== department) return false;
      if (line && departmentLines[recipe.department ?? ""] !== line) {
        return false;
      }
      if (onlyIssues && recipe.issues.length === 0) return false;
      if (!needle) return true;
      const haystack = `${recipe.wipCode} ${recipe.name} ${recipe.lines
        .map((line) => line.ingredientName)
        .join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });

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
  }, [
    recipes,
    query,
    kind,
    department,
    line,
    onlyIssues,
    showArchived,
    finishedOnly,
    sort,
    dir,
    departmentLines,
  ]);

  const grouped = useMemo(() => {
    if (!groupByDept) return null;
    const map = new Map<string, CatalogRecipe[]>();
    for (const recipe of rows) {
      const key = recipe.department ?? "—";
      const bucket = map.get(key);
      if (bucket) bucket.push(recipe);
      else map.set(key, [recipe]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, groupByDept]);

  const lineNames = useMemo(
    () => [...new Set(Object.values(departmentLines))].sort(),
    [departmentLines]
  );

  const filterGroups = useMemo(() => {
    const visibleDepartments = line
      ? departments.filter((name) => departmentLines[name] === line)
      : departments;

    return [
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
      {
        exclusive: true,
        items: lineNames.map((name) => ({ id: `line:${name}`, label: name })),
      },
      {
        exclusive: true,
        items: visibleDepartments.map((name) => ({
          id: `dept:${name}`,
          label: name,
        })),
      },
    ].filter((group) => group.items.length > 0);
  }, [departments, departmentLines, line, lineNames]);

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

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      {/*
        One search field, and everything else behind Filter.
        Six controls in a row is six things to read before you can type; a
        field with the live filters shown as pills inside it says the same
        thing in the place you were already looking.
      */}
      <div className="flex flex-wrap items-center gap-2">
        {/* The one filter people reach for stays out where it can be hit
            without opening anything. The rest live behind Filter. */}
        <div className="flex overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-600">
          {(
            [
              [false, "All recipes"],
              [true, "Finished products"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setFinishedOnly(value)}
              aria-pressed={finishedOnly === value}
              className={cn(
                "h-8 px-2.5 text-sm transition-colors",
                finishedOnly === value
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          placeholder="Search recipe or ingredient…"
          aria-label="Search recipes"
          filters={filters}
          onFiltersChange={setFilters}
          filterGroups={filterGroups}
          className="sm:max-w-xl"
        />

        <Toggle active={groupByDept} onClick={() => setGroupByDept((v) => !v)}>
          By dept
        </Toggle>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {rows.length} / {recipes.length}
        </span>

        <NewRecipeDialog departments={departments} canCreate={canCreate} />
      </div>

      {/* Desktop / iPad */}
      <div className="hidden md:block">
        <DataTable>
          <THead
            columns={[
              { label: "Number", ...sortProps("wipCode") },
              { label: "Recipe", ...sortProps("name") },
              { label: "Type", ...sortProps("kind") },
              { label: "Department", ...sortProps("department") },
              { label: "Batch", numeric: true },
              { label: "Lines", numeric: true, ...sortProps("lines") },
              { label: "Allergens" },
              { label: "Status" },
            ]}
          />
          <TBody>
            {grouped
              ? grouped.flatMap(([dept, list]) => [
                  <tr key={`group-${dept}`} className="bg-muted">
                    <td
                      colSpan={8}
                      className="border-b border-border px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-wider uppercase"
                    >
                      {dept}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {list.length}
                      </span>
                    </td>
                  </tr>,
                  ...list.map((recipe) => (
                    <Row key={recipe.id} recipe={recipe} onOpen={router.push} />
                  )),
                ])
              : rows.map((recipe) => (
                  <Row key={recipe.id} recipe={recipe} onOpen={router.push} />
                ))}
            {rows.length === 0 && (
              <TableEmpty colSpan={8}>No recipes match.</TableEmpty>
            )}
          </TBody>
        </DataTable>
      </div>

      {/* Phone */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((recipe) => (
          <li key={recipe.id}>
            <Link
              href={`/recipes/${recipe.id}`}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3"
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
                <span className="truncate">{recipe.department}</span>
                <span className="ml-auto tabular-nums">
                  {recipe.lines.length} lines
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  recipe,
  onOpen,
}: {
  recipe: CatalogRecipe;
  onOpen: (href: string) => void;
}) {
  return (
    <TR onClick={() => onOpen(`/recipes/${recipe.id}`)}>
      <TD mono muted>
        {recipe.wipCode}
      </TD>
      <TD strong>
        <span className="flex items-center gap-1.5">
          {recipe.isFinished && <FinishedStar />}
          {recipe.name}
        </span>
      </TD>
      <TD>
        <KindTag kind={recipe.kind} />
      </TD>
      <TD muted>{recipe.department}</TD>
      <TD numeric muted>
        {recipe.batchSize
          ? `${recipe.batchSize} ${recipe.uom?.toLowerCase() ?? ""}`
          : `per ${recipe.kind === "finished" ? "case" : "unit"}`}
      </TD>
      <TD numeric>{recipe.lines.length}</TD>
      <TD>
        <AllergenChips recipe={recipe} />
      </TD>
      <TD>
        <StatusCell recipe={recipe} />
      </TD>
    </TR>
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
        className="inline-flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground"
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
          className="inline-flex cursor-help rounded bg-warning-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-warning-foreground"
        >
          {allergen}
        </span>
      ))}
      {unverified.length > 0 && (
        <span
          title={unverifiedTitle}
          className="inline-flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground"
        >
          <HelpCircle className="size-3" />
          +{unverified.length}
        </span>
      )}
    </span>
  );
}

function StatusCell({ recipe }: { recipe: CatalogRecipe }) {
  if (recipe.issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-[1px] bg-success" />
        OK
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-[1px] bg-warning-muted px-2 py-0.5 text-[0.6875rem] font-medium text-warning-foreground">
      {recipe.issues.length} to review
    </span>
  );
}

export function KindTag({ kind }: { kind: RecipeKind }) {
  const styles: Record<RecipeKind, string> = {
    finished: "bg-brand-muted text-primary",
    assembly: "bg-muted text-foreground",
    kitchen: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[0.6875rem] font-medium",
        styles[kind]
      )}
    >
      {RECIPE_KIND_SHORT[kind]}
    </span>
  );
}


function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "border border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
