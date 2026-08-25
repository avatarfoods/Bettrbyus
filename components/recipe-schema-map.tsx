"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Link2,
  ListOrdered,
  Maximize2,
  MousePointer2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
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
import { cn } from "@/lib/utils";
import {
  MAP_CARD_WIDTH,
  MAP_HEADER_H,
  MAP_ROW_H,
  RECIPE_DEPARTMENTS,
  RECIPE_UOM_OPTIONS,
  batchYieldFromPct,
  buildRecipeMapGraph,
  createEmptyRecipe,
  formatQty,
  formatYieldPct,
  mapNodeHeight,
  newId,
  patchBatchYield,
  patchDesiredBatch,
  patchYieldPct,
  yieldPctFromBatch,
  type CookingRecipe,
  type MapNode,
  type RecipeDepartment,
  type RecipeIngredient,
  type RecipeKind,
  type RecipeMapGraph,
  type RecipeStep,
  type RecipeType,
} from "@/lib/recipes/recipe-graph";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.6;

type RecipeSchemaMapProps = {
  root: CookingRecipe;
  recipes: CookingRecipe[];
  onUpdateRecipes: (recipes: CookingRecipe[]) => void;
  /** Change which recipe is focused on the map (stay in map view). */
  onSelectNode: (recipeId: string) => void;
};

type ToolId = "select" | "connect";

type NodeDraft = {
  kind: RecipeKind | "ingredient";
  name: string;
  code: string;
  department: RecipeDepartment;
  recipeType: RecipeType;
  batchSize: string;
  batchYield: string;
  yieldPct: string;
  uom: string;
  quantity: string;
  parentId: string;
};

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(70, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const KIND_BADGE: Record<MapNode["kind"], string> = {
  recipe: "bg-orange-500/15 text-orange-300",
  subrecipe: "bg-sky-500/15 text-sky-300",
  ingredient: "bg-emerald-500/15 text-emerald-300",
};

function selectClassName() {
  return "h-8 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20";
}

function patchRecipe(
  recipes: CookingRecipe[],
  recipeId: string,
  patch: Partial<CookingRecipe> | ((recipe: CookingRecipe) => CookingRecipe)
): CookingRecipe[] {
  return recipes.map((recipe) => {
    if (recipe.id !== recipeId) return recipe;
    return typeof patch === "function" ? patch(recipe) : { ...recipe, ...patch };
  });
}

function wouldCreateCycle(
  recipesById: Map<string, CookingRecipe>,
  parentId: string,
  childId: string
): boolean {
  if (parentId === childId) return true;
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const recipe = recipesById.get(current);
    if (!recipe) continue;
    for (const item of recipe.ingredients) {
      if (item.subRecipeId) stack.push(item.subRecipeId);
    }
  }
  return false;
}

export function RecipeSchemaMap({
  root,
  recipes,
  onUpdateRecipes,
  onSelectNode,
}: RecipeSchemaMapProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const recipesById = useMemo(() => {
    const map = new Map<string, CookingRecipe>();
    for (const recipe of recipes) map.set(recipe.id, recipe);
    return map;
  }, [recipes]);

  const structureKey = useMemo(() => {
    return recipes
      .map(
        (recipe) =>
          `${recipe.id}:${recipe.name}:${recipe.code}:${recipe.batchSize}:${recipe.customBatchSize}:${recipe.batchYield}:${recipe.yieldPct}:${recipe.ingredients
            .map((item) => `${item.id}:${item.quantity}:${item.subRecipeId ?? item.name}`)
            .join(",")}:${recipe.steps.map((step) => step.id + step.text).join(",")}`
      )
      .join("|");
  }, [recipes]);

  const [graph, setGraph] = useState<RecipeMapGraph>(() =>
    buildRecipeMapGraph(root, recipesById)
  );
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(0.72);
  const [tool, setTool] = useState<ToolId>("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft>({
    kind: "subrecipe",
    name: "",
    code: "",
    department: "MAIN KITCHEN",
    recipeType: "batch",
    batchSize: "50",
    batchYield: "",
    yieldPct: "",
    uom: "LB",
    quantity: "1",
    parentId: root.id,
  });
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({
    fromId: "",
    toId: "",
    toKind: "ingredient" as MapNode["kind"],
    toName: "",
    quantity: "1",
    uom: "LB",
  });
  const [linkError, setLinkError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string | null;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const drag = useRef<{
    mode: "pan" | "node";
    id?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    pointerId?: number;
  } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGraph(buildRecipeMapGraph(root, recipesById));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on structure/root change only
  }, [root.id, structureKey]);

  useEffect(() => {
    setPan({ x: 24, y: 24 });
    setZoom(0.72);
    setConnectFrom(null);
    setTool("select");
    setHint(null);
    lastTap.current = null;
    if (focusTimer.current) {
      clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }
  }, [root.id]);

  useEffect(() => {
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, []);

  const parentOptions = useMemo(
    () =>
      graph.nodes.filter(
        (node) => node.kind === "recipe" || node.kind === "subrecipe"
      ),
    [graph.nodes]
  );

  const editingRecipe = editingId ? (recipesById.get(editingId) ?? null) : null;

  function updateEditingRecipe(
    patch: Partial<CookingRecipe> | ((recipe: CookingRecipe) => CookingRecipe)
  ) {
    if (!editingId) return;
    onUpdateRecipes(patchRecipe(recipes, editingId, patch));
  }

  function addEditingStep() {
    if (!editingRecipe) return;
    const next: RecipeStep = { id: newId("step"), text: "" };
    updateEditingRecipe({ steps: [...editingRecipe.steps, next] });
  }

  function updateEditingStep(stepId: string, text: string) {
    if (!editingRecipe) return;
    updateEditingRecipe({
      steps: editingRecipe.steps.map((step) =>
        step.id === stepId ? { ...step, text } : step
      ),
    });
  }

  function removeEditingStep(stepId: string) {
    if (!editingRecipe) return;
    updateEditingRecipe({
      steps: editingRecipe.steps.filter((step) => step.id !== stepId),
    });
  }

  function moveEditingStep(stepId: string, direction: -1 | 1) {
    if (!editingRecipe) return;
    const index = editingRecipe.steps.findIndex((step) => step.id === stepId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= editingRecipe.steps.length) {
      return;
    }
    const steps = [...editingRecipe.steps];
    const [item] = steps.splice(index, 1);
    steps.splice(nextIndex, 0, item);
    updateEditingRecipe({ steps });
  }

  function removeEditingIngredient(ingredientId: string) {
    if (!editingRecipe) return;
    updateEditingRecipe({
      ingredients: editingRecipe.ingredients.filter(
        (item) => item.id !== ingredientId
      ),
    });
  }

  function updateEditingIngredient(
    ingredientId: string,
    patch: Partial<RecipeIngredient>
  ) {
    if (!editingRecipe) return;
    updateEditingRecipe({
      ingredients: editingRecipe.ingredients.map((item) =>
        item.id === ingredientId ? { ...item, ...patch } : item
      ),
    });
  }

  const nodesById = useMemo(() => {
    const map = new Map<string, MapNode>();
    for (const node of graph.nodes) map.set(node.id, node);
    return map;
  }, [graph.nodes]);

  const outgoingIndex = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = map.get(edge.fromId) ?? [];
      list.push(edge.id);
      map.set(edge.fromId, list);
    }
    return map;
  }, [graph.edges]);

  const edgePaths = useMemo(() => {
    return graph.edges.flatMap((edge) => {
      const from = nodesById.get(edge.fromId);
      const to = nodesById.get(edge.toId);
      if (!from || !to) return [];
      const siblings = outgoingIndex.get(from.id) ?? [];
      const index = Math.max(0, siblings.indexOf(edge.id));
      const metaRows =
        from.kind !== "ingredient" && from.recipeType === "batch" ? 6 : 4;
      const bomStart = MAP_HEADER_H + metaRows * MAP_ROW_H;
      const y1 = from.y + bomStart + index * MAP_ROW_H + MAP_ROW_H / 2;
      const y2 = to.y + MAP_HEADER_H / 2;
      const x1 = from.x + MAP_CARD_WIDTH;
      const x2 = to.x;
      return [
        {
          edge,
          path: bezierPath(x1, y1, x2, y2),
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2,
        },
      ];
    });
  }, [graph.edges, nodesById, outgoingIndex]);

  function openAddNode(
    kind: RecipeKind | "ingredient",
    parentId: string = root.id
  ) {
    setNodeDraft({
      kind,
      name: "",
      code: "",
      department: kind === "recipe" ? "FINISHED PRODUCT" : "MAIN KITCHEN",
      recipeType: kind === "ingredient" || kind === "recipe" ? "per_unit" : "batch",
      batchSize: kind === "subrecipe" ? "50" : "",
      batchYield: "",
      yieldPct: "",
      uom: kind === "ingredient" ? "LB" : kind === "recipe" ? "UNIT" : "LB",
      quantity: "1",
      parentId,
    });
    setNodeError(null);
    setNodeOpen(true);
    setContextMenu(null);
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function openContextMenu(
    event: React.MouseEvent,
    nodeId: string | null = null
  ) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 220;
    const menuHeight = nodeId ? 320 : 280;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
    setContextMenu({ x: Math.max(8, x), y: Math.max(8, y), nodeId });
  }

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeContextMenu();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (contextMenuRef.current?.contains(target)) return;
      closeContextMenu();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [contextMenu]);

  function toggleConnectTool() {
    setTool((current) => (current === "connect" ? "select" : "connect"));
    setConnectFrom(null);
    setHint(
      tool === "connect" ? null : "Click a recipe, then click what it uses."
    );
    setContextMenu(null);
  }

  function handleAddNode() {
    const name = nodeDraft.name.trim();
    const quantity = Number(nodeDraft.quantity);
    if (!name) {
      setNodeError("Name is required.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNodeError("Enter a valid quantity.");
      return;
    }
    const parent = recipesById.get(nodeDraft.parentId);
    if (!parent) {
      setNodeError("Pick a parent recipe.");
      return;
    }

    if (nodeDraft.kind === "ingredient") {
      const next: RecipeIngredient = {
        id: newId("ing"),
        kind: "ingredient",
        name,
        subRecipeId: null,
        quantity,
        uom: nodeDraft.uom.trim() || "LB",
        notes: "",
      };
      onUpdateRecipes(
        patchRecipe(recipes, parent.id, {
          ingredients: [...parent.ingredients, next],
        })
      );
      setNodeOpen(false);
      setHint(`Added ingredient to ${parent.name}`);
      return;
    }

    const code = nodeDraft.code.trim();
    if (!code) {
      setNodeError("WIP # is required.");
      return;
    }
    if (recipes.some((recipe) => recipe.code.toLowerCase() === code.toLowerCase())) {
      setNodeError("That WIP # is already used.");
      return;
    }

    const created = createEmptyRecipe(nodeDraft.kind);
    created.name = name;
    created.code = code;
    created.department = nodeDraft.department;
    created.recipeType = nodeDraft.recipeType;
    created.uom = nodeDraft.uom.trim() || "LB";
    if (nodeDraft.recipeType === "batch") {
      const desired = Number(nodeDraft.batchSize) || 0;
      let batchYield =
        nodeDraft.batchYield.trim() === ""
          ? null
          : Number(nodeDraft.batchYield);
      let yieldPct =
        nodeDraft.yieldPct.trim() === "" ? null : Number(nodeDraft.yieldPct);
      if (batchYield == null && yieldPct != null) {
        batchYield = batchYieldFromPct(desired, yieldPct);
      } else if (yieldPct == null && batchYield != null) {
        yieldPct = yieldPctFromBatch(desired, batchYield);
      }
      created.batchSize = desired;
      created.batchYield = batchYield;
      created.yieldPct = yieldPct;
    } else {
      created.batchSize = null;
      created.batchYield = null;
      created.yieldPct = null;
    }

    const link: RecipeIngredient = {
      id: newId("ing"),
      kind: "subrecipe",
      name: created.name,
      subRecipeId: created.id,
      quantity,
      uom: nodeDraft.uom.trim() || created.uom,
      notes: "",
    };

    const nextRecipes = [
      created,
      ...patchRecipe(recipes, parent.id, {
        ingredients: [...parent.ingredients, link],
      }),
    ];
    onUpdateRecipes(nextRecipes);
    setNodeOpen(false);
    setHint(`Linked ${created.name} under ${parent.name}`);
  }

  function beginConnect(fromId: string) {
    setConnectFrom(fromId);
    setHint("Now click the ingredient or subrecipe to link.");
  }

  function requestLink(fromId: string, toNode: MapNode) {
    if (fromId === toNode.id) {
      setConnectFrom(null);
      setHint(null);
      return;
    }
    if (toNode.kind !== "ingredient" && wouldCreateCycle(recipesById, fromId, toNode.id)) {
      setHint("That link would create a cycle.");
      setConnectFrom(null);
      return;
    }
    const parent = recipesById.get(fromId);
    if (!parent) return;
    const already = parent.ingredients.some((item) =>
      toNode.kind === "ingredient"
        ? item.kind === "ingredient" &&
          item.name.toUpperCase() === toNode.name.toUpperCase()
        : item.subRecipeId === toNode.id
    );
    if (already) {
      setHint("Already linked.");
      setConnectFrom(null);
      return;
    }
    setLinkDraft({
      fromId,
      toId: toNode.id,
      toKind: toNode.kind,
      toName: toNode.name,
      quantity: "1",
      uom: toNode.uom || "LB",
    });
    setLinkError(null);
    setLinkOpen(true);
    setConnectFrom(null);
    setTool("select");
  }

  function saveLink() {
    const quantity = Number(linkDraft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setLinkError("Enter a valid quantity.");
      return;
    }
    const parent = recipesById.get(linkDraft.fromId);
    if (!parent) return;

    const next: RecipeIngredient =
      linkDraft.toKind === "ingredient"
        ? {
            id: newId("ing"),
            kind: "ingredient",
            name: linkDraft.toName,
            subRecipeId: null,
            quantity,
            uom: linkDraft.uom.trim() || "LB",
            notes: "",
          }
        : {
            id: newId("ing"),
            kind: "subrecipe",
            name: linkDraft.toName,
            subRecipeId: linkDraft.toId,
            quantity,
            uom: linkDraft.uom.trim() || "LB",
            notes: "",
          };

    onUpdateRecipes(
      patchRecipe(recipes, parent.id, {
        ingredients: [...parent.ingredients, next],
      })
    );
    setLinkOpen(false);
    setHint(`Connected ${linkDraft.toName} → ${parent.name}`);
  }

  function removeEdge(edgeId: string) {
    const edge = graph.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const parent = recipesById.get(edge.fromId);
    if (!parent) return;
    // edge id format: `${recipe.id}->${childId}:${ingredient.id}`
    const ingredientId = edge.id.split(":").pop();
    onUpdateRecipes(
      patchRecipe(recipes, parent.id, {
        ingredients: parent.ingredients.filter((item) => item.id !== ingredientId),
      })
    );
  }

  function relayout() {
    setGraph(buildRecipeMapGraph(root, recipesById));
  }

  function fitView() {
    if (graph.nodes.length === 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      const h = mapNodeHeight(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + MAP_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + h);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const nextZoom = Math.min(
      1,
      Math.max(MIN_ZOOM, Math.min((rect.width - 80) / width, (rect.height - 80) / height))
    );
    setZoom(nextZoom);
    setPan({
      x: (rect.width - width * nextZoom) / 2 - minX * nextZoom,
      y: (rect.height - height * nextZoom) / 2 - minY * nextZoom,
    });
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, zoom * (event.deltaY > 0 ? 0.92 : 1.08))
    );
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const worldX = (cx - pan.x) / zoom;
    const worldY = (cy - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: cx - worldX * nextZoom,
      y: cy - worldY * nextZoom,
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.dataset.canvas) return;
    if (tool === "connect") {
      setConnectFrom(null);
      setHint("Connect cancelled.");
      return;
    }
    drag.current = {
      mode: "pan",
      startX: event.clientX,
      startY: event.clientY,
      origX: pan.x,
      origY: pan.y,
      moved: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
    if (active.mode === "pan") {
      setPan({ x: active.origX + dx, y: active.origY + dy });
      return;
    }
    if (active.mode === "node" && active.id) {
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === active.id
            ? {
                ...node,
                x: active.origX + dx / zoom,
                y: active.origY + dy / zoom,
              }
            : node
        ),
      }));
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (
      active?.pointerId != null &&
      canvasRef.current?.hasPointerCapture(active.pointerId)
    ) {
      canvasRef.current.releasePointerCapture(active.pointerId);
    }
    drag.current = null;

    if (!active || active.mode !== "node" || !active.id || active.moved) return;
    if (tool === "connect") return;

    const node = nodesById.get(active.id);
    if (!node || node.kind === "ingredient") return;

    const now = Date.now();
    const prev = lastTap.current;
    if (prev && prev.id === active.id && now - prev.at < 400) {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
        focusTimer.current = null;
      }
      lastTap.current = null;
      setEditingId(active.id);
      setHint(`Editing ${node.name} on the map`);
      return;
    }

    lastTap.current = { id: active.id, at: now };
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Single click: focus this card as the map root (after we know it's not a double-click).
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      if (active.id && active.id !== root.id) onSelectNode(active.id);
    }, 280);

    // silence unused event warning in some lint configs
    void event;
  }

  function onNodePointerDown(event: React.PointerEvent, node: MapNode) {
    event.stopPropagation();

    if (tool === "connect") {
      if (!connectFrom) {
        if (node.kind === "ingredient") {
          setHint("Start from a recipe or subrecipe card.");
          return;
        }
        beginConnect(node.id);
        return;
      }
      requestLink(connectFrom, node);
      return;
    }

    drag.current = {
      mode: "node",
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: node.x,
      origY: node.y,
      moved: false,
      pointerId: event.pointerId,
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  return (
    <div className="dark relative flex h-full min-h-0 overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-sm text-zinc-400">
            Schema builder ·{" "}
            <span className="font-medium text-zinc-100">{root.name}</span>
            {tool === "connect" && (
              <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                Connect mode
              </span>
            )}
          </p>
          {hint && (
            <p className="hidden max-w-md truncate text-[11px] text-emerald-300/90 lg:block">
              {hint}
            </p>
          )}
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Right-click for tools · {graph.nodes.length} nodes ·{" "}
            {graph.edges.length} links · {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
        <div
          ref={canvasRef}
          data-canvas="true"
          className={cn(
            "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#181818]",
            tool === "connect" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(event) => openContextMenu(event, null)}
        >
          <div
            data-canvas="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgb(63 63 70 / 0.55) 1px, transparent 0)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          <div
            className="absolute top-0 left-0 origin-top-left will-change-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg
              className="pointer-events-none absolute top-0 left-0 overflow-visible"
              width={1}
              height={1}
            >
              {edgePaths.map(({ edge, path, labelX, labelY }) => (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={1.6}
                    strokeOpacity={0.85}
                  />
                  <foreignObject
                    x={labelX - 48}
                    y={labelY - 12}
                    width={96}
                    height={24}
                  >
                    <button
                      type="button"
                      className="pointer-events-auto flex h-full w-full items-center justify-center rounded bg-zinc-900/95 px-1 text-[9px] font-medium text-emerald-300 ring-1 ring-zinc-700 hover:ring-red-400 hover:text-red-300"
                      title="Click to remove link"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeEdge(edge.id);
                      }}
                    >
                      {formatQty(edge.quantity, edge.uom)}
                    </button>
                  </foreignObject>
                </g>
              ))}
            </svg>

            {graph.nodes.map((node) => {
              const isRoot = node.id === root.id;
              const isConnectFrom = connectFrom === node.id;
              const isEditing = editingId === node.id;
              const rows = node.ingredientRows.slice(0, 8);
              const extra = node.ingredientRows.length - rows.length;
              return (
                <article
                  key={node.id}
                  className={cn(
                    "absolute rounded-lg border bg-[#242424] shadow-xl shadow-black/40",
                    isEditing
                      ? "border-amber-400 ring-2 ring-amber-400/40"
                      : isRoot || isConnectFrom
                        ? "border-emerald-400 ring-2 ring-emerald-400/30"
                        : "border-zinc-700"
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: MAP_CARD_WIDTH,
                  }}
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onContextMenu={(event) => openContextMenu(event, node.id)}
                >
                  <header className="flex items-start justify-between gap-2 border-b border-zinc-700 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-50">
                        {node.name || "Untitled"}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {node.code || node.kind}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase",
                        KIND_BADGE[node.kind]
                      )}
                    >
                      {node.kind}
                    </span>
                  </header>

                  <ul>
                    <MetaRow
                      label={node.kind === "ingredient" ? "type" : "department"}
                      value={
                        node.kind === "ingredient"
                          ? "ingredient"
                          : (node.department ?? "—")
                      }
                    />
                    <MetaRow label="uom" value={node.uom || "—"} />
                    <MetaRow
                      label={node.kind === "ingredient" ? "role" : "type"}
                      value={
                        node.kind === "ingredient"
                          ? "raw"
                          : node.recipeType === "batch"
                            ? "batch"
                            : "per unit"
                      }
                    />
                    {node.kind !== "ingredient" &&
                    node.recipeType === "batch" ? (
                      <>
                        <MetaRow
                          label="desired"
                          value={
                            node.batchSize != null
                              ? formatQty(node.batchSize, node.uom)
                              : "—"
                          }
                        />
                        <MetaRow
                          label="yield"
                          value={
                            node.batchYield != null
                              ? `${formatQty(node.batchYield, node.uom)}${
                                  node.yieldPct != null
                                    ? ` (${formatYieldPct(node.yieldPct)})`
                                    : ""
                                }`
                              : formatYieldPct(node.yieldPct)
                          }
                        />
                      </>
                    ) : (
                      <MetaRow
                        label="steps"
                        value={
                          node.kind === "ingredient"
                            ? "—"
                            : String(node.stepCount)
                        }
                      />
                    )}
                    {node.kind !== "ingredient" &&
                    node.recipeType === "batch" ? (
                      <MetaRow
                        label="steps"
                        value={String(node.stepCount)}
                      />
                    ) : null}
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex h-[26px] items-center gap-1.5 border-b border-zinc-800/80 px-3 text-[11px] text-zinc-200 last:border-b-0"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="truncate">{row.label}</span>
                      </li>
                    ))}
                    {extra > 0 && (
                      <li className="flex h-[26px] items-center px-3 text-[11px] text-zinc-500">
                        +{extra} more
                      </li>
                    )}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="pointer-events-none absolute right-4 bottom-4 rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-[10px] text-zinc-400">
            <p className="mb-1.5 font-medium tracking-wide text-zinc-300 uppercase">
              Legend
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-orange-400" />
                Recipe
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-400" />
                Subrecipe
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400" />
                Ingredient
              </div>
            <p className="pt-1 text-zinc-500">
              Right-click for tools · double-click to edit
            </p>
            </div>
          </div>
        </div>

        {editingRecipe && (
          <aside className="flex w-[360px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
              <Pencil className="size-3.5 text-amber-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                  Edit on map
                </p>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {editingRecipe.name || "Untitled"}
                </p>
              </div>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-zinc-400 hover:text-zinc-100"
                onClick={() => setEditingId(null)}
                aria-label="Close editor"
              >
                <X />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <Label className="text-zinc-400" htmlFor="map-edit-name">
                    Name
                  </Label>
                  <Input
                    id="map-edit-name"
                    value={editingRecipe.name}
                    onChange={(event) =>
                      updateEditingRecipe({ name: event.target.value })
                    }
                    className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-zinc-400" htmlFor="map-edit-code">
                      WIP #
                    </Label>
                    <Input
                      id="map-edit-code"
                      value={editingRecipe.code}
                      onChange={(event) =>
                        updateEditingRecipe({ code: event.target.value })
                      }
                      className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-zinc-400" htmlFor="map-edit-uom">
                      U/M
                    </Label>
                    <Input
                      id="map-edit-uom"
                      value={editingRecipe.uom}
                      onChange={(event) =>
                        updateEditingRecipe({ uom: event.target.value })
                      }
                      className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-zinc-400" htmlFor="map-edit-dept">
                    Department
                  </Label>
                  <select
                    id="map-edit-dept"
                    value={editingRecipe.department}
                    onChange={(event) =>
                      updateEditingRecipe({
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-zinc-400" htmlFor="map-edit-type">
                      Type
                    </Label>
                    <select
                      id="map-edit-type"
                      value={editingRecipe.recipeType}
                      onChange={(event) => {
                        const recipeType = event.target.value as RecipeType;
                        updateEditingRecipe({
                          recipeType,
                          batchSize:
                            recipeType === "batch"
                              ? editingRecipe.batchSize ?? 0
                              : null,
                        });
                      }}
                      className={selectClassName()}
                    >
                      <option value="batch">Batch</option>
                      <option value="per_unit">Per unit</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-zinc-400" htmlFor="map-edit-allergen">
                      Allergen
                    </Label>
                    <Input
                      id="map-edit-allergen"
                      value={editingRecipe.allergen}
                      onChange={(event) =>
                        updateEditingRecipe({ allergen: event.target.value })
                      }
                      className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                  </div>
                </div>
                {editingRecipe.recipeType === "batch" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-zinc-400" htmlFor="map-edit-batch">
                        Desired batch
                      </Label>
                      <Input
                        id="map-edit-batch"
                        type="number"
                        step="any"
                        value={editingRecipe.batchSize ?? ""}
                        onChange={(event) =>
                          updateEditingRecipe(
                            patchDesiredBatch(
                              editingRecipe,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                        className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label
                        className="text-zinc-400"
                        htmlFor="map-edit-custom-batch"
                      >
                        Custom (demand)
                      </Label>
                      <Input
                        id="map-edit-custom-batch"
                        type="number"
                        step="any"
                        placeholder="e.g. 300"
                        value={editingRecipe.customBatchSize ?? ""}
                        onChange={(event) =>
                          updateEditingRecipe({
                            customBatchSize:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                        className="h-8 border-amber-600/50 bg-amber-950/40 text-amber-100"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-zinc-400" htmlFor="map-edit-yield">
                        Batch yield
                      </Label>
                      <Input
                        id="map-edit-yield"
                        type="number"
                        step="any"
                        value={editingRecipe.batchYield ?? ""}
                        onChange={(event) =>
                          updateEditingRecipe(
                            patchBatchYield(
                              editingRecipe,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                        className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label
                        className="text-zinc-400"
                        htmlFor="map-edit-yield-pct"
                      >
                        Yield %
                      </Label>
                      <Input
                        id="map-edit-yield-pct"
                        type="number"
                        step="any"
                        value={editingRecipe.yieldPct ?? ""}
                        onChange={(event) =>
                          updateEditingRecipe(
                            patchYieldPct(
                              editingRecipe,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          )
                        }
                        className="h-8 border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    <Package className="size-3" />
                    Ingredients
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900 text-zinc-200"
                      onClick={() => {
                        setNodeDraft({
                          kind: "ingredient",
                          name: "",
                          code: "",
                          department: "MAIN KITCHEN",
                          recipeType: "batch",
                          batchSize: "",
                          batchYield: "",
                          yieldPct: "",
                          uom: "LB",
                          quantity: "1",
                          parentId: editingRecipe.id,
                        });
                        setNodeError(null);
                        setNodeOpen(true);
                      }}
                    >
                      <Plus className="size-3" />
                      Ingredient
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={() => {
                        setNodeDraft({
                          kind: "subrecipe",
                          name: "",
                          code: "",
                          department: "MAIN KITCHEN",
                          recipeType: "batch",
                          batchSize: "50",
                          batchYield: "",
                          yieldPct: "",
                          uom: "LB",
                          quantity: "1",
                          parentId: editingRecipe.id,
                        });
                        setNodeError(null);
                        setNodeOpen(true);
                      }}
                    >
                      <GitBranch className="size-3" />
                      Subrecipe
                    </Button>
                  </div>
                </div>
                {editingRecipe.ingredients.length === 0 ? (
                  <p className="rounded-md border border-dashed border-zinc-700 px-2 py-4 text-center text-[11px] text-zinc-500">
                    No ingredients yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {editingRecipe.ingredients.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-md border border-zinc-800 bg-zinc-900 p-2"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "min-w-0 truncate text-xs font-medium",
                              item.kind === "subrecipe"
                                ? "text-red-300"
                                : "text-zinc-200"
                            )}
                          >
                            {item.name}
                          </p>
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-red-400"
                            onClick={() => removeEditingIngredient(item.id)}
                            aria-label="Remove"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                        <div className="flex gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(event) =>
                              updateEditingIngredient(item.id, {
                                quantity: Number(event.target.value) || 0,
                              })
                            }
                            className="h-7 border-zinc-700 bg-zinc-950 text-xs text-zinc-100"
                          />
                          <Input
                            value={item.uom}
                            onChange={(event) =>
                              updateEditingIngredient(item.id, {
                                uom: event.target.value,
                              })
                            }
                            className="h-7 w-16 border-zinc-700 bg-zinc-950 text-xs text-zinc-100"
                          />
                          <span className="flex h-7 items-center rounded bg-zinc-800 px-1.5 text-[9px] text-zinc-400">
                            {item.kind === "subrecipe" ? "SUB" : "ING"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    <ListOrdered className="size-3" />
                    Instructions
                  </p>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-zinc-200"
                    onClick={addEditingStep}
                  >
                    <Plus className="size-3" />
                    Add
                  </Button>
                </div>
                {editingRecipe.steps.length === 0 ? (
                  <p className="rounded-md border border-dashed border-zinc-700 px-2 py-4 text-center text-[11px] text-zinc-500">
                    No instructions yet.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {editingRecipe.steps.map((step, index) => (
                      <li key={step.id} className="flex gap-2">
                        <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                          {index + 1}
                        </span>
                        <textarea
                          value={step.text}
                          onChange={(event) =>
                            updateEditingStep(step.id, event.target.value)
                          }
                          rows={2}
                          placeholder={`Instruction ${index + 1}…`}
                          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/50"
                        />
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveEditingStep(step.id, -1)}
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            disabled={index === editingRecipe.steps.length - 1}
                            onClick={() => moveEditingStep(step.id, 1)}
                          >
                            <ArrowDown className="size-3" />
                          </button>
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-red-400"
                            onClick={() => removeEditingStep(step.id)}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </aside>
        )}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[220px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-2xl shadow-black/50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {(() => {
            const targetNode = contextMenu.nodeId
              ? nodesById.get(contextMenu.nodeId)
              : null;
            const canNest =
              targetNode != null && targetNode.kind !== "ingredient";
            const parentId = canNest ? targetNode!.id : root.id;

            return (
              <>
                {canNest && (
                  <>
                    <ContextMenuItem
                      icon={Pencil}
                      label="Edit here"
                      onClick={() => {
                        setEditingId(targetNode!.id);
                        setHint(`Editing ${targetNode!.name} on the map`);
                        closeContextMenu();
                      }}
                    />
                    <ContextMenuItem
                      icon={MousePointer2}
                      label="Focus on map"
                      onClick={() => {
                        onSelectNode(targetNode!.id);
                        closeContextMenu();
                      }}
                    />
                    <ContextMenuItem
                      icon={Link2}
                      label="Connect from this"
                      onClick={() => {
                        setTool("connect");
                        beginConnect(targetNode!.id);
                        closeContextMenu();
                      }}
                    />
                    <div className="my-1 h-px bg-zinc-800" />
                  </>
                )}

                <ContextMenuItem
                  icon={Package}
                  label={canNest ? "Add ingredient under…" : "Add ingredient"}
                  onClick={() => openAddNode("ingredient", parentId)}
                />
                <ContextMenuItem
                  icon={GitBranch}
                  label={canNest ? "Add subrecipe under…" : "Add subrecipe"}
                  onClick={() => openAddNode("subrecipe", parentId)}
                />
                {!canNest && (
                  <ContextMenuItem
                    icon={Plus}
                    label="Add & link recipe"
                    onClick={() => openAddNode("recipe", root.id)}
                  />
                )}
                <div className="my-1 h-px bg-zinc-800" />
                <ContextMenuItem
                  icon={Link2}
                  label={tool === "connect" ? "Exit connect mode" : "Connect mode"}
                  active={tool === "connect"}
                  onClick={toggleConnectTool}
                />
                <ContextMenuItem
                  icon={MousePointer2}
                  label="Select / drag"
                  active={tool === "select"}
                  onClick={() => {
                    setTool("select");
                    setConnectFrom(null);
                    setHint(null);
                    closeContextMenu();
                  }}
                />
                <div className="my-1 h-px bg-zinc-800" />
                <ContextMenuItem
                  icon={Workflow}
                  label="Auto layout"
                  onClick={() => {
                    relayout();
                    closeContextMenu();
                  }}
                />
                <ContextMenuItem
                  icon={Maximize2}
                  label="Fit view"
                  onClick={() => {
                    fitView();
                    closeContextMenu();
                  }}
                />
              </>
            );
          })()}
        </div>
      )}

      <Dialog open={nodeOpen} onOpenChange={setNodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nodeDraft.kind === "ingredient"
                ? "Add ingredient"
                : nodeDraft.kind === "subrecipe"
                  ? "Add subrecipe"
                  : "Add recipe"}
            </DialogTitle>
            <DialogDescription>
              Creates a node and links it under the parent you choose on the map.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="map-parent">Parent on map</Label>
              <select
                id="map-parent"
                value={nodeDraft.parentId}
                onChange={(event) =>
                  setNodeDraft((current) => ({
                    ...current,
                    parentId: event.target.value,
                  }))
                }
                className={selectClassName()}
              >
                {parentOptions.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.code ? `${node.code} · ` : ""}
                    {node.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="map-name">Name</Label>
              <Input
                id="map-name"
                value={nodeDraft.name}
                onChange={(event) =>
                  setNodeDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            {nodeDraft.kind !== "ingredient" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="map-code">WIP #</Label>
                  <Input
                    id="map-code"
                    value={nodeDraft.code}
                    onChange={(event) =>
                      setNodeDraft((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="map-dept">Department</Label>
                  <select
                    id="map-dept"
                    value={nodeDraft.department}
                    onChange={(event) =>
                      setNodeDraft((current) => ({
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
                    <Label htmlFor="map-type">Type</Label>
                    <select
                      id="map-type"
                      value={nodeDraft.recipeType}
                      onChange={(event) =>
                        setNodeDraft((current) => ({
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
                    <Label htmlFor="map-uom">U/M</Label>
                    <Input
                      id="map-uom"
                      value={nodeDraft.uom}
                      onChange={(event) =>
                        setNodeDraft((current) => ({
                          ...current,
                          uom: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                {nodeDraft.recipeType === "batch" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="map-batch">Desired batch</Label>
                      <Input
                        id="map-batch"
                        type="number"
                        min="0"
                        step="any"
                        value={nodeDraft.batchSize}
                        onChange={(event) =>
                          setNodeDraft((current) => ({
                            ...current,
                            batchSize: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="map-yield">Batch yield</Label>
                      <Input
                        id="map-yield"
                        type="number"
                        step="any"
                        value={nodeDraft.batchYield}
                        onChange={(event) =>
                          setNodeDraft((current) => ({
                            ...current,
                            batchYield: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="map-yield-pct">Yield %</Label>
                      <Input
                        id="map-yield-pct"
                        type="number"
                        step="any"
                        value={nodeDraft.yieldPct}
                        onChange={(event) =>
                          setNodeDraft((current) => ({
                            ...current,
                            yieldPct: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            {nodeDraft.kind === "ingredient" && (
              <div className="grid gap-1.5">
                <Label htmlFor="map-iuom">U/M</Label>
                <select
                  id="map-iuom"
                  value={
                    (RECIPE_UOM_OPTIONS as readonly string[]).includes(
                      nodeDraft.uom
                    )
                      ? nodeDraft.uom
                      : nodeDraft.uom || "LB"
                  }
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      uom: event.target.value,
                    }))
                  }
                  className={selectClassName()}
                >
                  {!(RECIPE_UOM_OPTIONS as readonly string[]).includes(
                    nodeDraft.uom
                  ) && nodeDraft.uom ? (
                    <option value={nodeDraft.uom}>{nodeDraft.uom}</option>
                  ) : null}
                  {RECIPE_UOM_OPTIONS.map((uom) => (
                    <option key={uom} value={uom}>
                      {uom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="map-qty">Quantity used by parent</Label>
              <Input
                id="map-qty"
                type="number"
                min="0"
                step="any"
                value={nodeDraft.quantity}
                onChange={(event) =>
                  setNodeDraft((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </div>
            {nodeError && <p className="text-sm text-destructive">{nodeError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNodeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddNode}>
              Add to map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Link quantity</DialogTitle>
            <DialogDescription>
              How much of <strong>{linkDraft.toName}</strong> does the parent use?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="link-qty">Quantity</Label>
              <Input
                id="link-qty"
                type="number"
                min="0"
                step="any"
                value={linkDraft.quantity}
                onChange={(event) =>
                  setLinkDraft((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-uom">U/M</Label>
              <select
                id="link-uom"
                value={
                  (RECIPE_UOM_OPTIONS as readonly string[]).includes(
                    linkDraft.uom
                  )
                    ? linkDraft.uom
                    : linkDraft.uom || "LB"
                }
                onChange={(event) =>
                  setLinkDraft((current) => ({
                    ...current,
                    uom: event.target.value,
                  }))
                }
                className={selectClassName()}
              >
                {!(RECIPE_UOM_OPTIONS as readonly string[]).includes(
                  linkDraft.uom
                ) && linkDraft.uom ? (
                  <option value={linkDraft.uom}>{linkDraft.uom}</option>
                ) : null}
                {RECIPE_UOM_OPTIONS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {linkError && <p className="text-sm text-destructive">{linkError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveLink}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
        active
          ? "bg-emerald-500/15 text-emerald-300"
          : "text-zinc-200 hover:bg-zinc-800"
      )}
    >
      <Icon className="size-3.5 shrink-0 text-zinc-400" />
      {label}
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex h-[26px] items-center justify-between gap-2 border-b border-zinc-800/80 px-3 text-[11px]">
      <span className="truncate text-zinc-200">{label}</span>
      <span className="shrink-0 truncate text-zinc-500">{value}</span>
    </li>
  );
}
