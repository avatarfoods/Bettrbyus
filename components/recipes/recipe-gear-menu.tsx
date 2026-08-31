"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The gear on a recipe.
 *
 * One thing lives behind it today - seeing the recipe as the floor will get
 * it - but it is the right home for the actions that are about the recipe
 * rather than in it, and it keeps them out of the header where the recipe's
 * own facts belong.
 */
export function RecipeGearMenu({
  recipeId,
  recipeName,
}: {
  recipeId: string;
  recipeName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Recipe actions"
        title="Print, and other actions"
        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings2 className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{recipeName}</DialogTitle>
            <DialogDescription>
              See it the way the floor will get it, then print or save as PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Link
              href={`/recipes/${recipeId}/print`}
              onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 rounded-md bg-card p-3 ring-1 ring-foreground/10 transition-colors hover:bg-brand-muted"
            >
              <Printer className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Batch record</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  The sheet the floor gets — facts, ingredients with a blank lot
                  column, the full and final batch amounts, and the numbered
                  instructions.
                </span>
              </span>
            </Link>
          </div>

          <p className="text-[0.6875rem] text-muted-foreground">
            Opens a print preview where you can set the quantity to print for.
            Choose &ldquo;Save as PDF&rdquo; in the print dialog to keep a copy.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
