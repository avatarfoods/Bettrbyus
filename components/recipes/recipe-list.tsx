"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCircle, Search, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

type SortKey = "wipCode" | "name" | "kind" | "department" | "lines";

/** Bucket for departments with no line assigned yet. */
const UNGROUPED = "__ungrouped__";

const KINDS: RecipeKind[] = ["finished", "assembly", "kitchen"];

export function RecipeList({
  recipes,
  departments,
  departmentLines = {},
  initialFinishedOnly,
}: {
  recipes: CatalogRecipe[];
  departments: string[];
  /** Department name -> production line name, from Production settings. */
  departmentLines?: Record<string, string>;
  /** Set by /recipes?kind=finished, which is where the nav points. */
  initialFinishedOnly?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<RecipeKind | "">("");
  const [department, setDepartment] = useState("");
  const [line, setLine] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [finishedOnly, setFinishedOnly] = useState(initialFinishedOnly ?? false);
  const [groupByDept, setGroupByDept] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = recipes.filter((recipe) => {
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

  /**
   * Departments shown under their line, the way Odoo nests locations under a
   * warehouse. Anything not yet linked in Production settings falls to the
   * bottom ungrouped rather than disappearing.
   */
  const groupedDepartments = useMemo(() => {
    const groups = new Map<string, string[]>();
    const visible = line
      ? departments.filter((name) => departmentLines[name] === line)
      : departments;

    for (const name of visible) {
      const key = departmentLines[name] ?? UNGROUPED;
      const bucket = groups.get(key);
      if (bucket) bucket.push(name);
      else groups.set(key, [name]);
    }

    return [...groups.entries()].sort(([a], [b]) =>
      a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)
    );
  }, [departments, departmentLines, line]);

  const lineNames = useMemo(
    () => [...new Set(Object.values(departmentLines))].sort(),
    [departmentLines]
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

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      {/* Filters — one row of same-shaped controls. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipe or ingredient…"
            aria-label="Search recipes"
            className="h-8 w-full rounded-md border border-border bg-card pr-7 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFinishedOnly((value) => !value)}
          aria-pressed={finishedOnly}
          className={cn(
            "h-8 rounded-md px-2.5 text-sm transition-colors",
            finishedOnly
              ? "bg-primary text-primary-foreground font-medium"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          Finished products
        </button>

        <FilterLabel>Type</FilterLabel>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as RecipeKind | "")}
          aria-label="Filter by type"
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="">All types</option>
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {RECIPE_KIND_SHORT[option]}
            </option>
          ))}
        </select>

{lineNames.length > 0 && (
          <>
            <FilterLabel>Line</FilterLabel>
            <select
              value={line}
              onChange={(event) => {
                setLine(event.target.value);
                setDepartment("");
              }}
              aria-label="Filter by production line"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">All lines</option>
              {lineNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}

        <FilterLabel>Dept</FilterLabel>
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          aria-label="Filter by department"
          className="h-8 max-w-56 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="">All</option>
          {groupedDepartments.map(([groupName, names]) =>
            groupName === UNGROUPED ? (
              names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            ) : (
              <optgroup key={groupName} label={groupName}>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )
          )}
        </select>

        <Toggle active={onlyIssues} onClick={() => setOnlyIssues((v) => !v)}>
          Needs review
        </Toggle>
        <Toggle active={groupByDept} onClick={() => setGroupByDept((v) => !v)}>
          By dept
        </Toggle>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {rows.length} / {recipes.length}
        </span>
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
                  <span className="block truncate text-sm font-semibold">
                    {recipe.name}
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
      <TD strong>{recipe.name}</TD>
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
          <span className="size-1.5 rounded-full bg-success" />
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
        <span className="size-1.5 rounded-full bg-success" />
        OK
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-full bg-warning-muted px-2 py-0.5 text-[0.6875rem] font-medium text-warning-foreground">
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

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
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
