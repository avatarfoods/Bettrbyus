"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Package, Plus, Search, Soup } from "lucide-react";
import { createRecipe } from "@/lib/recipes/actions";
import type { OdooFinishedOption } from "@/lib/finished-products/fetch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Starting a recipe: what kind, then who it is.
 *
 * Two steps, and the first is one tap. Department, unit, batch and the rest
 * were being asked for before the recipe existed, which is a form to fill in
 * before you have started rather than a way to start - and every one of them
 * is editable on the recipe itself a moment later.
 *
 * What is asked for is what cannot be worked out afterwards and cannot be
 * blank: what kind of thing it is, and the name and number it will be known
 * by. A finished product takes both from Odoo, because the product already
 * exists there and typing it again is how a name ends up spelled two ways.
 */
export function NewRecipeDialog({
  canCreate,
  odooOptions,
  odooError,
}: {
  canCreate: boolean;
  /** Finished goods from Odoo, for picking rather than typing. */
  odooOptions: OdooFinishedOption[];
  odooError: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<"sub" | "finished" | null>(null);
  const [wipCode, setWipCode] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const free = odooOptions.filter((option) => !option.taken);
    if (!needle) return free.slice(0, 40);
    return free
      .filter((option) =>
        `${option.itemCode} ${option.name}`.toLowerCase().includes(needle)
      )
      .slice(0, 40);
  }, [odooOptions, query]);

  function reset() {
    setKind(null);
    setWipCode("");
    setName("");
    setQuery("");
    setError(null);
  }

  function create(code: string, label: string) {
    setError(null);
    startTransition(async () => {
      const result = await createRecipe({
        wipCode: code,
        name: label,
        department: null,
        uom: kind === "finished" ? "CS" : "LB",
        isFinished: kind === "finished",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/recipes/${result.id}`);
      router.refresh();
    });
  }

  if (!canCreate) return null;

  const ready = name.trim().length > 0 && wipCode.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="size-3.5" />
        New
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {kind && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Back"
                  className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              New recipe
            </DialogTitle>
            <DialogDescription>
              {kind === null
                ? "What kind of thing is it? Everything else is set on the recipe itself."
                : kind === "finished"
                  ? "Pick it from Odoo. The name and number come from there."
                  : "Name it and give it an item number. That is all it needs to exist."}
            </DialogDescription>
          </DialogHeader>

          {/* Step one. One tap, and it decides everything that follows. */}
          {kind === null && (
            <div className="grid gap-2 sm:grid-cols-2">
              <KindCard
                icon={<Soup />}
                title="Sub-recipe"
                note="Made to go into something else. Named and numbered by you."
                onClick={() => setKind("sub")}
              />
              <KindCard
                icon={<Package />}
                title="Finished product"
                note="Shipped to a customer. Chosen from Odoo, and the plan cascades down from it."
                onClick={() => setKind("finished")}
              />
            </div>
          )}

          {/* Step two, for something made in-house. */}
          {kind === "sub" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[8rem_1fr] gap-2">
                <Field label="Item number">
                  <input
                    value={wipCode}
                    onChange={(event) => setWipCode(event.target.value)}
                    placeholder="160650"
                    inputMode="numeric"
                    autoFocus
                    className={INPUT}
                  />
                </Field>
                <Field label="Name">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && ready) {
                        create(wipCode, name);
                      }
                    }}
                    placeholder="AL PASTOR CREAM"
                    className={cn(INPUT, "uppercase")}
                  />
                </Field>
              </div>

              {error && <Problem>{error}</Problem>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-8 rounded-sm border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => create(wipCode, name)}
                  disabled={pending || !ready}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  Create and open
                </button>
              </div>
            </div>
          )}

          {/* Step two, for something that already exists in Odoo. */}
          {kind === "finished" && (
            <div className="flex flex-col gap-2">
              {odooError ? (
                <Problem>
                  Odoo is not reachable, so the list cannot be shown: {odooError}
                </Problem>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search Avatar Natural Foods finished goods…"
                      className={cn(INPUT, "pl-8")}
                    />
                  </div>

                  <ul className="max-h-72 overflow-y-auto rounded-sm border border-border">
                    {matches.map((option) => (
                      <li key={option.odooProductId}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => create(option.itemCode, option.name)}
                          className="flex w-full items-center gap-2 border-b border-border/50 px-2.5 py-2 text-left text-sm last:border-b-0 hover:bg-brand-muted disabled:opacity-50"
                        >
                          <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                            {option.itemCode}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {option.name}
                          </span>
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 && (
                      <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                        {query
                          ? "Nothing matches."
                          : "Every finished product in Odoo already has a recipe."}
                      </li>
                    )}
                  </ul>

                  <p className="text-[0.6875rem] text-muted-foreground">
                    Products already carrying a recipe are left out. Picking one
                    creates it and opens it.
                  </p>
                </>
              )}

              {error && <Problem>{error}</Problem>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const INPUT =
  "h-8 w-full rounded-sm border border-border bg-card px-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none";

function KindCard({
  icon,
  title,
  note,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-sm bg-card p-3 ring-1 ring-foreground/10 text-left transition-colors hover:border-primary hover:bg-brand-muted"
    >
      <span className="text-primary [&>svg]:size-5">{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-[0.6875rem] leading-snug text-muted-foreground">
        {note}
      </span>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-sm bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
      {children}
    </p>
  );
}
