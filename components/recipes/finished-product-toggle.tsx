"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck } from "lucide-react";
import { setRecipeFinishedProduct } from "@/lib/recipes/actions";
import { cn } from "@/lib/utils";

/**
 * The finished-product tick.
 *
 * This is not cosmetic: it decides what the schedule cascades from. Ticking a
 * recipe makes it drive demand for everything beneath it; unticking one stops
 * it. So it says what it does, and only an admin can move it.
 */
export function FinishedProductToggle({
  recipeId,
  isFinished,
  canEdit,
}: {
  recipeId: string;
  isFinished: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(isFinished);

  function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await setRecipeFinishedProduct({
        recipeId,
        isFinished: next,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setChecked(!next);
        setError(result.message);
      }
    });
  }

  if (!canEdit) {
    return checked ? (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary">
        <PackageCheck className="size-3.5" />
        Finished product
      </span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
          checked
            ? "bg-primary/15 text-primary"
            : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => toggle(event.target.checked)}
          className="size-3.5 accent-[var(--color-primary)]"
        />
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <PackageCheck className="size-3.5" />
        )}
        Finished product
      </label>
      {error && (
        <span className="max-w-48 text-[0.625rem] leading-tight text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
