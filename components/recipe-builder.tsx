"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CookingPot,
  FileText,
  GitBranch,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RecipeInstructions } from "@/components/recipe-instructions";
import { RecipeSchemaMap } from "@/components/recipe-schema-map";
import { cn } from "@/lib/utils";
import {
  RECIPE_DEPARTMENTS,
  RECIPE_UOM_OPTIONS,
  batchYieldFromPct,
  createDemoWorkspace,
  createEmptyRecipe,
  formatQty,
  formatNumber,
  formatYieldPct,
  hasCustomDemand,
  newId,
  normalizeRecipe,
  originalIngredientTotalLbs,
  patchBatchYield,
  patchDesiredBatch,
  patchYieldPct,
  customIngredientQty,
  scaledIngredientQty,
  totalBatches,
  yieldPctFromBatch,
  type CookingRecipe,
  type IngredientKind,
  type RecipeDepartment,
  type RecipeIngredient,
  type RecipeKind,
  type RecipeType,
  type RecipeWorkspace,
} from "@/lib/recipes/recipe-graph";

const STORAGE_KEY = "tms-cooking-recipes-v5";

type CreateDraft = {
  kind: RecipeKind;
  name: string;
  code: string;
  department: RecipeDepartment;
  recipeType: RecipeType;
  batchSize: string;
  batchYield: string;
  yieldPct: string;
  uom: string;
};

const EMPTY_CREATE: CreateDraft = {
  kind: "recipe",
  name: "",
  code: "",
  department: "FINISHED PRODUCT",
  recipeType: "per_unit",
  batchSize: "",
  batchYield: "",
  yieldPct: "",
  uom: "UNIT",
};

function loadWorkspace(): RecipeWorkspace {
  if (typeof window === "undefined") return createDemoWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoWorkspace();
    const parsed = JSON.parse(raw) as RecipeWorkspace;
    if (!Array.isArray(parsed.recipes)) return createDemoWorkspace();
    return { recipes: parsed.recipes.map((recipe) => normalizeRecipe(recipe)) };
  } catch {
    return createDemoWorkspace();
  }
}

function selectClassName() {
  return "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
}

export function RecipeBuilder() {
  const [workspace, setWorkspace] = useState<RecipeWorkspace>(createDemoWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("r-fp");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [ingredientOpen, setIngredientOpen] = useState(false);
  const [ingredientDraft, setIngredientDraft] = useState({
    kind: "ingredient" as IngredientKind,
    mode: "existing" as "existing" | "create",
    name: "",
    subRecipeId: "",
    newCode: "",
    newDepartment: "MAIN KITCHEN" as RecipeDepartment,
    quantity: "1",
    uom: "LB",
    notes: "",
  });
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<"recipe" | "map">("recipe");

  useEffect(() => {
    const loaded = loadWorkspace();
    setWorkspace(loaded);
    setSelectedId(loaded.recipes[0]?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace, hydrated]);

  const recipes = workspace.recipes;
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(q) ||
        recipe.code.toLowerCase().includes(q) ||
        recipe.department.toLowerCase().includes(q)
    );
  }, [recipes, search]);

  const recipesById = useMemo(() => {
    const map = new Map<string, CookingRecipe>();
    for (const recipe of recipes) map.set(recipe.id, recipe);
    return map;
  }, [recipes]);

  const linkableSubrecipes = useMemo(
    () =>
      recipes.filter(
        (recipe) =>
          recipe.kind === "subrecipe" && recipe.id !== selectedId
      ),
    [recipes, selectedId]
  );

  function updateSelected(patch: Partial<CookingRecipe>) {
    if (!selectedId) return;
    setWorkspace((current) => ({
      recipes: current.recipes.map((recipe) =>
        recipe.id === selectedId ? { ...recipe, ...patch } : recipe
      ),
    }));
  }

  function updateIngredient(ingredientId: string, patch: Partial<RecipeIngredient>) {
    if (!selected) return;
    updateSelected({
      ingredients: selected.ingredients.map((item) =>
        item.id === ingredientId ? { ...item, ...patch } : item
      ),
    });
  }

  function removeIngredient(ingredientId: string) {
    if (!selected) return;
    updateSelected({
      ingredients: selected.ingredients.filter((item) => item.id !== ingredientId),
    });
  }

  function openCreate(kind: RecipeKind) {
    setDraft({
      ...EMPTY_CREATE,
      kind,
      department: kind === "recipe" ? "FINISHED PRODUCT" : "MAIN KITCHEN",
      recipeType: kind === "recipe" ? "per_unit" : "batch",
      uom: kind === "recipe" ? "UNIT" : "LB",
      batchSize: kind === "recipe" ? "" : "50",
      batchYield: "",
      yieldPct: "",
    });
    setCreateError(null);
    setCreateOpen(true);
  }

  function handleCreate() {
    const name = draft.name.trim();
    const code = draft.code.trim();
    if (!name || !code) {
      setCreateError("Name and WIP # are required.");
      return;
    }
    if (recipes.some((recipe) => recipe.code.toLowerCase() === code.toLowerCase())) {
      setCreateError("That WIP # is already used.");
      return;
    }
    const recipe = createEmptyRecipe(draft.kind);
    recipe.name = name;
    recipe.code = code;
    recipe.department = draft.department;
    recipe.recipeType = draft.recipeType;
    recipe.uom = draft.uom.trim() || "LB";
    if (draft.recipeType === "batch") {
      const desired = Number(draft.batchSize) || 0;
      let batchYield =
        draft.batchYield.trim() === "" ? null : Number(draft.batchYield);
      let yieldPct =
        draft.yieldPct.trim() === "" ? null : Number(draft.yieldPct);
      if (batchYield == null && yieldPct != null) {
        batchYield = batchYieldFromPct(desired, yieldPct);
      } else if (yieldPct == null && batchYield != null) {
        yieldPct = yieldPctFromBatch(desired, batchYield);
      }
      recipe.batchSize = desired;
      recipe.batchYield = batchYield;
      recipe.yieldPct = yieldPct;
    } else {
      recipe.batchSize = null;
      recipe.batchYield = null;
      recipe.yieldPct = null;
    }
    setWorkspace((current) => ({ recipes: [recipe, ...current.recipes] }));
    setSelectedId(recipe.id);
    setEditing(false);
    setView("map");
    setCreateOpen(false);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setWorkspace((current) => ({
      recipes: current.recipes
        .filter((recipe) => recipe.id !== selectedId)
        .map((recipe) => ({
          ...recipe,
          ingredients: recipe.ingredients.map((item) =>
            item.subRecipeId === selectedId
              ? { ...item, kind: "ingredient" as const, subRecipeId: null }
              : item
          ),
        })),
    }));
    setSelectedId(null);
    setEditing(false);
  }

  function openAddIngredient(kind: IngredientKind = "ingredient") {
    setIngredientDraft({
      kind,
      mode: "existing",
      name: "",
      subRecipeId: "",
      newCode: "",
      newDepartment: "MAIN KITCHEN",
      quantity: "1",
      uom: selected?.uom === "UNIT" ? "UNIT" : "LB",
      notes: "",
    });
    setIngredientError(null);
    setIngredientOpen(true);
  }

  function handleAddIngredient() {
    if (!selected) return;
    const quantity = Number(ingredientDraft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setIngredientError("Enter a valid quantity.");
      return;
    }

    if (ingredientDraft.kind === "subrecipe") {
      if (ingredientDraft.mode === "create") {
        const name = ingredientDraft.name.trim();
        const code = ingredientDraft.newCode.trim();
        if (!name || !code) {
          setIngredientError("Name and WIP # are required for a new subrecipe.");
          return;
        }
        if (recipes.some((recipe) => recipe.code.toLowerCase() === code.toLowerCase())) {
          setIngredientError("That WIP # is already used.");
          return;
        }
        const created = createEmptyRecipe("subrecipe");
        created.name = name;
        created.code = code;
        created.department = ingredientDraft.newDepartment;
        created.uom = ingredientDraft.uom.trim() || "LB";
        const link: RecipeIngredient = {
          id: newId("ing"),
          kind: "subrecipe",
          name: created.name,
          subRecipeId: created.id,
          quantity,
          uom: ingredientDraft.uom.trim() || created.uom,
          notes: ingredientDraft.notes.trim(),
        };
        setWorkspace((current) => ({
          recipes: [
            created,
            ...current.recipes.map((recipe) =>
              recipe.id === selected.id
                ? { ...recipe, ingredients: [...recipe.ingredients, link] }
                : recipe
            ),
          ],
        }));
        setIngredientOpen(false);
        return;
      }

      const linked = recipesById.get(ingredientDraft.subRecipeId);
      if (!linked) {
        setIngredientError("Pick a subrecipe, or create a new one.");
        return;
      }
      const next: RecipeIngredient = {
        id: newId("ing"),
        kind: "subrecipe",
        name: linked.name,
        subRecipeId: linked.id,
        quantity,
        uom: ingredientDraft.uom.trim() || "LB",
        notes: ingredientDraft.notes.trim(),
      };
      updateSelected({ ingredients: [...selected.ingredients, next] });
      setIngredientOpen(false);
      return;
    }

    const name = ingredientDraft.name.trim();
    if (!name) {
      setIngredientError("Ingredient name is required.");
      return;
    }
    const next: RecipeIngredient = {
      id: newId("ing"),
      kind: "ingredient",
      name,
      subRecipeId: null,
      quantity,
      uom: ingredientDraft.uom.trim() || "LB",
      notes: ingredientDraft.notes.trim(),
    };
    updateSelected({ ingredients: [...selected.ingredients, next] });
    setIngredientOpen(false);
  }

  return (
    <div className="flex h-[calc(100dvh-var(--auth-top-bar-offset,3rem))] min-h-[640px] overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-background">
        <div className="border-b px-4 py-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CookingPot className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Cooking recipes</p>
              <p className="text-xs text-muted-foreground">
                Pick one recipe · edit or map
              </p>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("recipe")}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs font-medium",
                view === "recipe"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="size-3.5" />
              Recipe
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded-md text-xs font-medium",
                view === "map"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Workflow className="size-3.5" />
              Map
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipes…"
              className="h-8 pl-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button type="button" size="sm" onClick={() => openCreate("recipe")}>
              <Plus />
              Recipe
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openCreate("subrecipe")}
            >
              <GitBranch />
              Subrecipe
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No recipes match.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((recipe) => {
                const active = recipe.id === selectedId;
                return (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(recipe.id);
                        setEditing(false);
                      }}
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted/70"
                      )}
                    >
                      <span className="block truncate text-sm font-medium">
                        {recipe.name || "Untitled recipe"}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{recipe.code || "—"}</span>
                        <span>·</span>
                        <span>{recipe.department}</span>
                        <span>·</span>
                        <span className="capitalize">{recipe.kind}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              const demo = createDemoWorkspace();
              setWorkspace(demo);
              setSelectedId(demo.recipes[0]?.id ?? null);
              setEditing(false);
            }}
          >
            Reset demo recipes
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-8 text-center">
            <CookingPot className="size-10 text-muted-foreground/50" />
            <p className="text-lg font-medium">Select a recipe</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Choose one from the list, or create a new recipe / subrecipe to start
              building ingredients and steps.
            </p>
          </div>
        ) : view === "map" ? (
          <RecipeSchemaMap
            root={selected}
            recipes={recipes}
            onUpdateRecipes={(next) => setWorkspace({ recipes: next })}
            onSelectNode={(recipeId) => {
              setSelectedId(recipeId);
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {selected.kind === "subrecipe" ? "Subrecipe" : "Recipe"} ·{" "}
                  {selected.department}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {selected.name || "Untitled recipe"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  WIP {selected.code || "—"}
                  {selected.recipeType === "batch"
                    ? ` · Desired ${selected.batchSize ?? "—"} ${selected.uom}${
                        selected.batchYield != null
                          ? ` · Yield ${selected.batchYield} ${selected.uom}`
                          : ""
                      }${
                        selected.yieldPct != null
                          ? ` (${formatYieldPct(selected.yieldPct)})`
                          : ""
                      }`
                    : ` · Per ${selected.uom.toLowerCase()}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setView("map")}
                >
                  <Workflow />
                  Map
                </Button>
                <Button
                  type="button"
                  variant={editing ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setEditing((value) => !value)}
                >
                  <Pencil />
                  {editing ? "Done editing" : "Edit"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </header>

            <section className="mb-6 rounded-xl border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Batch sizing</h2>
                <div className="flex items-center gap-2">
                  <Label htmlFor="recipe-type-top" className="text-xs text-muted-foreground">
                    Type
                  </Label>
                  <select
                    id="recipe-type-top"
                    value={selected.recipeType}
                    onChange={(event) => {
                      const recipeType = event.target.value as RecipeType;
                      updateSelected({
                        recipeType,
                        batchSize:
                          recipeType === "batch"
                            ? selected.batchSize ?? 0
                            : null,
                        customBatchSize:
                          recipeType === "batch"
                            ? selected.customBatchSize
                            : null,
                        batchYield:
                          recipeType === "batch" ? selected.batchYield : null,
                        yieldPct:
                          recipeType === "batch" ? selected.yieldPct : null,
                      });
                    }}
                    className={cn(selectClassName(), "h-8 w-auto min-w-[8rem]")}
                  >
                    <option value="batch">Batch</option>
                    <option value="per_unit">Per unit</option>
                  </select>
                </div>
              </div>
              {selected.recipeType === "batch" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="recipe-batch">Desired batch size</Label>
                      <Input
                        id="recipe-batch"
                        type="number"
                        min="0"
                        step="any"
                        value={selected.batchSize ?? ""}
                        onChange={(event) =>
                          updateSelected(
                            patchDesiredBatch(
                              selected,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="recipe-yield">Batch yield</Label>
                      <Input
                        id="recipe-yield"
                        type="number"
                        step="any"
                        value={selected.batchYield ?? ""}
                        onChange={(event) =>
                          updateSelected(
                            patchBatchYield(
                              selected,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="recipe-yield-pct">Yield %</Label>
                      <Input
                        id="recipe-yield-pct"
                        type="number"
                        step="any"
                        value={selected.yieldPct ?? ""}
                        onChange={(event) =>
                          updateSelected(
                            patchYieldPct(
                              selected,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="recipe-custom-batch">Custom</Label>
                      <Input
                        id="recipe-custom-batch"
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Demand lbs"
                        value={selected.customBatchSize ?? ""}
                        onChange={(event) =>
                          updateSelected({
                            customBatchSize:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                        className="border-amber-300 bg-amber-50 focus-visible:border-amber-400"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      Batch total (ingr){" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatNumber(originalIngredientTotalLbs(selected))} LB
                      </span>
                    </p>
                    <p>
                      Scaled total{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatNumber(
                          selected.ingredients.reduce(
                            (sum, item) =>
                              sum + scaledIngredientQty(selected, item),
                            0
                          )
                        )}{" "}
                        LB
                      </span>
                    </p>
                    <p>
                      Total batches{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {totalBatches(selected) != null
                          ? totalBatches(selected)!.toFixed(2)
                          : "—"}
                      </span>
                    </p>
                    <p>
                      Custom total{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {hasCustomDemand(selected)
                          ? `${formatNumber(
                              selected.ingredients.reduce(
                                (sum, item) =>
                                  sum + customIngredientQty(selected, item),
                                0
                              )
                            )} LB`
                          : "—"}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Switch type to <strong>Batch</strong> to set desired batch, batch
                  yield, and yield %.
                </p>
              )}
            </section>

            {editing && (
              <section className="mb-6 rounded-xl border bg-background p-4">
                <h2 className="mb-3 text-sm font-semibold">Recipe details</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="recipe-name">Recipe name</Label>
                    <Input
                      id="recipe-name"
                      value={selected.name}
                      onChange={(event) =>
                        updateSelected({ name: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-code">WIP #</Label>
                    <Input
                      id="recipe-code"
                      value={selected.code}
                      onChange={(event) =>
                        updateSelected({ code: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-dept">Department</Label>
                    <select
                      id="recipe-dept"
                      value={selected.department}
                      onChange={(event) =>
                        updateSelected({
                          department: event.target.value as RecipeDepartment,
                        })
                      }
                      className={selectClassName()}
                    >
                      {RECIPE_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-allergen">Allergen</Label>
                    <Input
                      id="recipe-allergen"
                      value={selected.allergen}
                      onChange={(event) =>
                        updateSelected({ allergen: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-usda">USDA</Label>
                    <select
                      id="recipe-usda"
                      value={selected.usda ? "yes" : "no"}
                      onChange={(event) =>
                        updateSelected({ usda: event.target.value === "yes" })
                      }
                      className={selectClassName()}
                    >
                      <option value="no">NO</option>
                      <option value="yes">YES</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-uom">U/M</Label>
                    <Input
                      id="recipe-uom"
                      value={selected.uom}
                      onChange={(event) =>
                        updateSelected({ uom: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-page">Page #</Label>
                    <Input
                      id="recipe-page"
                      value={selected.page}
                      onChange={(event) =>
                        updateSelected({ page: event.target.value })
                      }
                      placeholder="E.36"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-lot">Lot number</Label>
                    <Input
                      id="recipe-lot"
                      value={selected.lotNumber}
                      onChange={(event) =>
                        updateSelected({ lotNumber: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-prod-date">Production date</Label>
                    <Input
                      id="recipe-prod-date"
                      type="date"
                      value={selected.productionDate}
                      onChange={(event) =>
                        updateSelected({ productionDate: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-shelf">Shelf life (days)</Label>
                    <Input
                      id="recipe-shelf"
                      type="number"
                      min="0"
                      value={selected.shelfLifeDays}
                      onChange={(event) =>
                        updateSelected({
                          shelfLifeDays: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-order">Order total</Label>
                    <Input
                      id="recipe-order"
                      type="number"
                      min="0"
                      step="any"
                      value={selected.orderTotal ?? ""}
                      onChange={(event) =>
                        updateSelected({
                          orderTotal:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="recipe-target">Target units</Label>
                    <Input
                      id="recipe-target"
                      type="number"
                      min="0"
                      step="any"
                      value={selected.targetUnits ?? ""}
                      onChange={(event) =>
                        updateSelected({
                          targetUnits:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="recipe-notes">Notes</Label>
                    <textarea
                      id="recipe-notes"
                      value={selected.notes}
                      onChange={(event) =>
                        updateSelected({ notes: event.target.value })
                      }
                      rows={2}
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    />
                  </div>
                </div>
              </section>
            )}

            {!editing && (
              <div className="mb-6 grid gap-2 rounded-xl border bg-background p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <MetaCell label="Allergen" value={selected.allergen || "—"} />
                <MetaCell label="USDA" value={selected.usda ? "YES" : "NO"} />
                <MetaCell label="U/M" value={selected.uom || "—"} />
                {selected.notes ? (
                  <p className="sm:col-span-2 lg:col-span-3 text-muted-foreground">
                    {selected.notes}
                  </p>
                ) : null}
              </div>
            )}

            <section className="mb-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Ingredient - Material</h2>
                  <span className="text-xs text-muted-foreground">
                    {selected.ingredients.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAddIngredient("ingredient")}
                  >
                    <Plus />
                    Add ingredient
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openAddIngredient("subrecipe")}
                  >
                    <GitBranch />
                    Add subrecipe
                  </Button>
                </div>
              </div>

              {selected.ingredients.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No lines yet. Add an ingredient or a subrecipe (like Excel
                  “INGREDIENT OR SUBRECIPE”).
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-background">
                  <div
                    className={cn(
                      "min-w-[36rem] border-b bg-muted/50 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
                      selected.recipeType === "batch" && hasCustomDemand(selected)
                        ? "grid grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5rem_5.5rem] items-center gap-x-3"
                        : selected.recipeType === "batch"
                          ? "grid grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5.5rem] items-center gap-x-3"
                          : "grid grid-cols-[minmax(0,1fr)_6.5rem_5rem_3.5rem_5.5rem] items-center gap-x-3"
                    )}
                  >
                    <span>Ingredient / Subrecipe</span>
                    {selected.recipeType === "batch" ? (
                      <>
                        <span className="text-right">Original</span>
                        <span className="text-center">U/M</span>
                        <span className="text-right">Scaled</span>
                        {hasCustomDemand(selected) ? (
                          <span className="text-right text-amber-700">Custom</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span>Type</span>
                        <span className="text-right">Qty</span>
                        <span className="text-center">U/M</span>
                      </>
                    )}
                    <span className="text-right">Actions</span>
                  </div>
                  <ul
                    className={cn(
                      "divide-y",
                      selected.recipeType === "batch" && hasCustomDemand(selected)
                        ? "min-w-[42rem]"
                        : "min-w-[36rem]"
                    )}
                  >
                    {selected.ingredients.map((item) => {
                      const linked =
                        item.subRecipeId != null
                          ? recipesById.get(item.subRecipeId)
                          : null;
                      const scaled = scaledIngredientQty(selected, item);
                      const customQty = customIngredientQty(selected, item);
                      const showCustom = hasCustomDemand(selected);
                      return (
                        <li
                          key={item.id}
                          className={cn(
                            "items-center gap-x-3 px-4 py-3",
                            selected.recipeType === "batch" && showCustom
                              ? "grid grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5rem_5.5rem]"
                              : selected.recipeType === "batch"
                                ? "grid grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5.5rem]"
                                : "grid grid-cols-[minmax(0,1fr)_6.5rem_5rem_3.5rem_5.5rem]"
                          )}
                        >
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate text-sm font-medium",
                                item.kind === "subrecipe" && "text-red-700"
                              )}
                            >
                              {item.name}
                            </p>
                            {item.notes && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          {selected.recipeType !== "batch" ? (
                            <span
                              className={cn(
                                "justify-self-start rounded px-1.5 py-0.5 text-center text-[10px] font-medium",
                                item.kind === "subrecipe"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-emerald-100 text-emerald-800"
                              )}
                            >
                              {item.kind === "subrecipe"
                                ? "Subrecipe"
                                : "Ingredient"}
                            </span>
                          ) : null}
                          <div className="w-full text-right text-sm tabular-nums text-muted-foreground">
                            {editing ? (
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateIngredient(item.id, {
                                    quantity: Number(event.target.value) || 0,
                                  })
                                }
                                className="h-7 w-full text-right tabular-nums"
                              />
                            ) : (
                              formatNumber(item.quantity)
                            )}
                          </div>
                          <div className="w-full text-center text-sm tabular-nums text-muted-foreground">
                            {editing ? (
                              <select
                                value={
                                  (RECIPE_UOM_OPTIONS as readonly string[]).includes(
                                    item.uom
                                  )
                                    ? item.uom
                                    : item.uom ||
                                      (selected.recipeType === "batch"
                                        ? "LB"
                                        : "UNIT")
                                }
                                onChange={(event) =>
                                  updateIngredient(item.id, {
                                    uom: event.target.value,
                                  })
                                }
                                className={cn(
                                  selectClassName(),
                                  "h-7 w-full px-0.5 text-center text-xs"
                                )}
                              >
                                {!(
                                  RECIPE_UOM_OPTIONS as readonly string[]
                                ).includes(item.uom) && item.uom ? (
                                  <option value={item.uom}>{item.uom}</option>
                                ) : null}
                                {RECIPE_UOM_OPTIONS.map((uom) => (
                                  <option key={uom} value={uom}>
                                    {uom}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              item.uom
                            )}
                          </div>
                          {selected.recipeType === "batch" ? (
                            <div className="w-full text-right text-sm font-medium tabular-nums">
                              {formatNumber(scaled)}
                            </div>
                          ) : null}
                          {selected.recipeType === "batch" && showCustom ? (
                            <div className="w-full text-right text-sm font-medium tabular-nums text-amber-800">
                              {formatNumber(customQty)}
                            </div>
                          ) : null}
                          <div className="flex w-full items-center justify-end gap-1">
                            {linked && (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedId(linked.id);
                                  setEditing(false);
                                }}
                              >
                                Open
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => removeIngredient(item.id)}
                              aria-label="Remove line"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {selected.recipeType === "batch" ? (
                    <div
                      className={cn(
                        "items-center gap-x-3 border-t bg-muted/40 px-4 py-2.5 text-sm font-medium",
                        hasCustomDemand(selected)
                          ? "grid min-w-[42rem] grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5rem_5.5rem]"
                          : "grid min-w-[36rem] grid-cols-[minmax(0,1fr)_5rem_3.5rem_5rem_5.5rem]"
                      )}
                    >
                      <span className="text-xs tracking-wide text-muted-foreground uppercase">
                        Batch total
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(originalIngredientTotalLbs(selected))}
                      </span>
                      <span className="text-center text-xs text-muted-foreground uppercase">
                        —
                      </span>
                      <span className="text-right tabular-nums">
                        {formatNumber(
                          selected.ingredients.reduce(
                            (sum, item) =>
                              sum + scaledIngredientQty(selected, item),
                            0
                          )
                        )}
                      </span>
                      {hasCustomDemand(selected) ? (
                        <span className="text-right tabular-nums text-amber-800">
                          {formatNumber(
                            selected.ingredients.reduce(
                              (sum, item) =>
                                sum + customIngredientQty(selected, item),
                              0
                            )
                          )}
                        </span>
                      ) : null}
                      <span />
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <Separator className="mb-8" />

            <RecipeInstructions
              recipe={selected}
              onChange={updateSelected}
            />
          </div>
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft.kind === "subrecipe" ? "New subrecipe" : "New recipe"}
            </DialogTitle>
            <DialogDescription>
              Creates the recipe and opens the schema map so you can add
              ingredients and subrecipes visually.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-code">WIP #</Label>
              <Input
                id="create-code"
                value={draft.code}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, code: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-dept">Department</Label>
              <select
                id="create-dept"
                value={draft.department}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    department: event.target.value as RecipeDepartment,
                  }))
                }
                className={selectClassName()}
              >
                {RECIPE_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="create-type">Type</Label>
                <select
                  id="create-type"
                  value={draft.recipeType}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      recipeType: event.target.value as RecipeType,
                    }))
                  }
                  className={selectClassName()}
                >
                  <option value="batch">Batch</option>
                  <option value="per_unit">Per unit</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="create-uom">U/M</Label>
                <Input
                  id="create-uom"
                  value={draft.uom}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, uom: event.target.value }))
                  }
                />
              </div>
            </div>
            {draft.recipeType === "batch" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="create-batch">Desired batch</Label>
                  <Input
                    id="create-batch"
                    type="number"
                    min="0"
                    step="any"
                    value={draft.batchSize}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        batchSize: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="create-yield">Batch yield</Label>
                  <Input
                    id="create-yield"
                    type="number"
                    step="any"
                    value={draft.batchYield}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        batchYield: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="create-yield-pct">Yield %</Label>
                  <Input
                    id="create-yield-pct"
                    type="number"
                    step="any"
                    value={draft.yieldPct}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        yieldPct: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate}>
              Create & open map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ingredientOpen} onOpenChange={setIngredientOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ingredientDraft.kind === "subrecipe"
                ? "Add subrecipe"
                : "Add ingredient"}
            </DialogTitle>
            <DialogDescription>
              {ingredientDraft.kind === "subrecipe"
                ? "Link an existing subrecipe, or create a new one under this recipe."
                : "Add a raw ingredient / material line (Excel “Ingredient”)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {ingredientDraft.kind === "subrecipe" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="ing-mode">Source</Label>
                  <select
                    id="ing-mode"
                    value={ingredientDraft.mode}
                    onChange={(event) =>
                      setIngredientDraft((current) => ({
                        ...current,
                        mode: event.target.value as "existing" | "create",
                      }))
                    }
                    className={selectClassName()}
                  >
                    <option value="existing">Link existing subrecipe</option>
                    <option value="create">Create new subrecipe</option>
                  </select>
                </div>
                {ingredientDraft.mode === "existing" ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="ing-sub">Subrecipe</Label>
                    <select
                      id="ing-sub"
                      value={ingredientDraft.subRecipeId}
                      onChange={(event) =>
                        setIngredientDraft((current) => ({
                          ...current,
                          subRecipeId: event.target.value,
                        }))
                      }
                      className={selectClassName()}
                    >
                      <option value="">Select…</option>
                      {linkableSubrecipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.code} · {recipe.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ing-new-name">New subrecipe name</Label>
                      <Input
                        id="ing-new-name"
                        value={ingredientDraft.name}
                        onChange={(event) =>
                          setIngredientDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ing-new-code">WIP #</Label>
                      <Input
                        id="ing-new-code"
                        value={ingredientDraft.newCode}
                        onChange={(event) =>
                          setIngredientDraft((current) => ({
                            ...current,
                            newCode: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ing-new-dept">Department</Label>
                      <select
                        id="ing-new-dept"
                        value={ingredientDraft.newDepartment}
                        onChange={(event) =>
                          setIngredientDraft((current) => ({
                            ...current,
                            newDepartment: event.target.value as RecipeDepartment,
                          }))
                        }
                        className={selectClassName()}
                      >
                        {RECIPE_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="ing-name">Ingredient name</Label>
                <Input
                  id="ing-name"
                  value={ingredientDraft.name}
                  onChange={(event) =>
                    setIngredientDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ing-qty">Quantity</Label>
                <Input
                  id="ing-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={ingredientDraft.quantity}
                  onChange={(event) =>
                    setIngredientDraft((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ing-uom">U/M</Label>
                <select
                  id="ing-uom"
                  value={
                    (RECIPE_UOM_OPTIONS as readonly string[]).includes(
                      ingredientDraft.uom
                    )
                      ? ingredientDraft.uom
                      : ingredientDraft.uom || "LB"
                  }
                  onChange={(event) =>
                    setIngredientDraft((current) => ({
                      ...current,
                      uom: event.target.value,
                    }))
                  }
                  className={selectClassName()}
                >
                  {!(RECIPE_UOM_OPTIONS as readonly string[]).includes(
                    ingredientDraft.uom
                  ) && ingredientDraft.uom ? (
                    <option value={ingredientDraft.uom}>
                      {ingredientDraft.uom}
                    </option>
                  ) : null}
                  {RECIPE_UOM_OPTIONS.map((uom) => (
                    <option key={uom} value={uom}>
                      {uom}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ing-notes">Notes (optional)</Label>
              <Input
                id="ing-notes"
                value={ingredientDraft.notes}
                onChange={(event) =>
                  setIngredientDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            {ingredientError && (
              <p className="text-sm text-destructive">{ingredientError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIngredientOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddIngredient}>
              Add to recipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
