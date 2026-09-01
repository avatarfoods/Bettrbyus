"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  FileText,
  Loader2,
  Package,
  Printer,
  Settings2,
  Soup,
} from "lucide-react";
import {
  setRecipeArchived,
  setRecipeFinishedProduct,
} from "@/lib/recipes/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The gear on a recipe.
 *
 * Home for the things that are ABOUT the recipe rather than in it: printing
 * it, changing what kind of thing it is, taking it out of service. They sit
 * behind a gear rather than on the page because two of the three are hard to
 * undo, and a control you have to go looking for is a control nobody flips by
 * accident on the way past.
 */
export function RecipeGearMenu({
  recipeId,
  recipeName,
  isFinished,
  isArchived,
  usedInCount,
  isAdmin,
}: {
  recipeId: string;
  recipeName: string;
  isFinished: boolean;
  isArchived: boolean;
  /** How many recipes list this one. Shown before archiving. */
  usedInCount: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"type" | "archive" | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "That did not work");
        return;
      }
      setConfirming(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Recipe actions"
        title="Print, change type, archive"
        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings2 className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{recipeName}</DialogTitle>
            <DialogDescription>
              Printing, and the two settings that change what this recipe is.
              Tap <span className="font-semibold">?</span> on any of them to
              see what it does.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Link
              href={`/recipes/${recipeId}/print`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-sm bg-card px-2.5 py-2 text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-brand-muted"
            >
              <Printer className="size-4 shrink-0 text-primary" />
              Print the batch record
            </Link>

            {/* A finished product is the only thing that has a specification
                to print, so the option only exists where it means something. */}
            {isFinished && (
              <Link
                href={`/recipes/${recipeId}/spec`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-sm bg-card px-2.5 py-2 text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-brand-muted"
              >
                <FileText className="size-4 shrink-0 text-primary" />
                Print the spec sheet
              </Link>
            )}

            {isAdmin && (
              <>
                {/*
                  Sub or finished is chosen when the recipe is created and does
                  not change on the page, because the plan cascades down from
                  finished products - flipping it silently changes what drives
                  demand for everything underneath. Here, with the consequence
                  spelled out and a confirmation, is the only place it moves.
                */}
                <ActionCard
                  icon={isFinished ? <Soup /> : <Package />}
                  title={
                    isFinished
                      ? "Make this a sub-recipe"
                      : "Make this a finished product"
                  }
                  body={
                    isFinished
                      ? "It stops driving the plan, and its specification, pallet and timing window come off the page."
                      : "It starts driving the plan: what you schedule against it cascades down to everything it is made from."
                  }
                  open={confirming === "type"}
                  onOpen={() => setConfirming(confirming === "type" ? null : "type")}
                  confirmLabel={isFinished ? "Yes, make it a sub-recipe" : "Yes, make it finished"}
                  pending={pending}
                  onConfirm={() =>
                    run(() =>
                      setRecipeFinishedProduct({
                        recipeId,
                        isFinished: !isFinished,
                      })
                    )
                  }
                />

                <ActionCard
                  icon={isArchived ? <ArchiveRestore /> : <Archive />}
                  danger={!isArchived}
                  title={isArchived ? "Bring it back" : "Archive this recipe"}
                  body={
                    isArchived
                      ? "It returns to Recipes, Planning and WIP, and can be added to other recipes again."
                      : `Out of Recipes, Planning and WIP, and it can no longer be added to anything new. Nothing is deleted — old plans and printed sheets still work.${
                          usedInCount > 0
                            ? ` ${usedInCount} ${usedInCount === 1 ? "recipe still lists" : "recipes still list"} it, and will keep working.`
                            : ""
                        }`
                  }
                  open={confirming === "archive"}
                  onOpen={() =>
                    setConfirming(confirming === "archive" ? null : "archive")
                  }
                  confirmLabel={isArchived ? "Bring it back" : "Yes, archive it"}
                  pending={pending}
                  onConfirm={() =>
                    run(() =>
                      setRecipeArchived({ recipeId, archived: !isArchived })
                    )
                  }
                />
              </>
            )}
          </div>

          {error && (
            <p className="rounded-sm bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * An action that asks once before it happens.
 *
 * The row is the title and nothing else. What it does to the recipe sits
 * behind the "?", because a menu is read to find the thing you already came
 * for - three paragraphs of explanation makes you read all of it to find one
 * line. The explanation still has to be there the first time, or before
 * something irreversible, so it is one tap away rather than gone.
 */
function ActionCard({
  icon,
  title,
  body,
  danger,
  open,
  onOpen,
  confirmLabel,
  onConfirm,
  pending,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  danger?: boolean;
  open: boolean;
  onOpen: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [why, setWhy] = useState(false);

  return (
    <div
      className={cn(
        "rounded-sm bg-card ring-1 transition-colors",
        open
          ? danger
            ? "ring-2 ring-destructive"
            : "ring-2 ring-primary"
          : "ring-foreground/10"
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span
          className={cn(
            "shrink-0 [&>svg]:size-4",
            danger ? "text-destructive" : "text-primary"
          )}
        >
          {icon}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
        >
          {title}
        </button>
        <button
          type="button"
          onClick={() => setWhy((value) => !value)}
          aria-label={`What does "${title}" do?`}
          aria-expanded={why}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[0.625rem] font-bold transition-colors",
            why
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-foreground/15"
          )}
        >
          ?
        </button>
      </div>

      {why && (
        <p className="border-t border-border bg-surface-sunk px-2.5 py-1.5 text-xs leading-snug text-muted-foreground">
          {body}
        </p>
      )}

      {open && (
        <div className="flex justify-end gap-2 border-t border-border px-2.5 py-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="h-7 rounded-sm px-2.5 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-white disabled:opacity-50",
              danger ? "bg-destructive" : "bg-primary"
            )}
          >
            {pending && <Loader2 className="size-3 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
