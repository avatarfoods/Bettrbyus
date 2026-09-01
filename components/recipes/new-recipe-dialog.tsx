"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createRecipe } from "@/lib/recipes/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Starting a recipe.
 *
 * Four fields, and only four: what it is called, the item number the floor
 * will write on the sheet, where it is made and what it is measured in.
 * Everything else - ingredients, batch size, method, timing - belongs on the
 * recipe's own page, where there is room for it and where it can be filled in
 * over several sittings. A form that asks for all of it at once is a form
 * people abandon halfway and start again tomorrow.
 *
 * Saving goes straight to the new recipe, because the next thing anyone wants
 * is to add ingredients to it.
 */
export function NewRecipeDialog({
  departments,
  canCreate,
}: {
  departments: string[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [wipCode, setWipCode] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [uom, setUom] = useState("LB");
  const [isFinished, setIsFinished] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createRecipe({
        wipCode,
        name,
        department: department || null,
        uom,
        isFinished,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setWipCode("");
      setName("");
      router.push(`/recipes/${result.id}`);
      router.refresh();
    });
  }

  if (!canCreate) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="size-3.5" />
        New
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New recipe</DialogTitle>
            <DialogDescription>
              Just enough to open it. Ingredients, batch size and the method go
              on the recipe itself.
            </DialogDescription>
          </DialogHeader>

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
                  placeholder="AL PASTOR CREAM"
                  className={cn(INPUT, "uppercase")}
                />
              </Field>
            </div>

            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label="Department">
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className={INPUT}
                >
                  <option value="">Not set yet</option>
                  {departments.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Measured in">
                <select
                  value={uom}
                  onChange={(event) => setUom(event.target.value)}
                  className={INPUT}
                >
                  {["LB", "EA", "CS", "OZ", "GAL"].map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/*
              A choice, not a tick.

              This is the one decision that cannot be walked back on the page
              afterwards - a finished product is what the whole plan cascades
              from - so it is two buttons you have to land on rather than a
              checkbox you can skip past without reading.
            */}
            <Field label="What is it">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [false, "Sub-recipe", "Made to go into something else"],
                    [true, "Finished product", "Shipped to a customer"],
                  ] as const
                ).map(([value, title, note]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setIsFinished(value)}
                    aria-pressed={isFinished === value}
                    className={cn(
                      "rounded-sm border px-2.5 py-2 text-left transition-colors",
                      isFinished === value
                        ? "border-primary bg-brand-muted ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm font-semibold",
                        isFinished === value && "text-primary"
                      )}
                    >
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">
                      {note}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <p className="text-[0.6875rem] leading-snug text-muted-foreground">
              This is fixed once the recipe exists. Changing it later takes an
              administrator, from the gear on the recipe.
            </p>

            {error && (
              <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !name.trim() || !wipCode.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                Create and open
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const INPUT =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none";

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
