"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FinishedStar } from "@/components/recipes/finished-star";
import { renameRecipe } from "@/lib/recipes/actions";
import { cn } from "@/lib/utils";

/**
 * The recipe's name and item number.
 *
 * These were the two things with nowhere to change them: typed once when the
 * recipe was created and then frozen, so a wrong item number meant archiving
 * the recipe and starting again over a typo.
 *
 * There is no confirm button. Editing is a mode the whole page is in, so
 * leaving the field is the commit - a tick beside every field would mean four
 * ticks to make one correction. What a rejected save needs is not a button
 * but an answer, so a clash stops the page leaving edit mode and says why.
 */
export function RecipeIdentity({
  recipeId,
  wipCode,
  name,
  isFinished,
  editing,
  onError,
}: {
  recipeId: string;
  wipCode: string;
  name: string;
  isFinished: boolean;
  editing: boolean;
  /** A clash, reported up so the page can hold you in edit mode. */
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftCode, setDraftCode] = useState(wipCode);
  const [draftName, setDraftName] = useState(name);
  const saved = useRef({ wipCode, name });
  const drafts = useRef({ code: wipCode, name });
  // Mirrored in an effect, not during render: the leave-edit-mode save runs
  // in its own effect and needs the latest values without re-subscribing.
  useEffect(() => {
    drafts.current = { code: draftCode, name: draftName };
  }, [draftCode, draftName]);

  function save() {
    const code = drafts.current.code.trim();
    const label = drafts.current.name.trim();
    if (code === saved.current.wipCode && label === saved.current.name) return;

    startTransition(async () => {
      const result = await renameRecipe({ recipeId, wipCode: code, name: label });
      if (!result.ok) {
        onError(result.message);
        return;
      }
      saved.current = { wipCode: code, name: label };
      onError(null);
      router.refresh();
    });
  }

  // Leaving edit mode with an unsaved change still saves it: switching the
  // mode off is a commit, not a cancel.
  useEffect(() => {
    if (!editing) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <span className="flex min-w-0 flex-col leading-tight">
        <h1
          className={cn(
            "flex items-center gap-1.5 text-lg font-bold",
            isFinished && "text-primary"
          )}
        >
          {isFinished && <FinishedStar className="size-4" />}
          {name}
        </h1>
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          {wipCode}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <input
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        onBlur={save}
        aria-label="Recipe name"
        autoFocus
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-9 w-full min-w-0 rounded-sm border border-primary bg-card px-2 text-lg font-bold uppercase focus:ring-1 focus:ring-primary focus:outline-none"
      />
      <input
        value={draftCode}
        onChange={(event) => setDraftCode(event.target.value)}
        onBlur={save}
        aria-label="Item number"
        inputMode="numeric"
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-6 w-28 rounded-sm border border-primary bg-card px-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
      />
    </span>
  );
}
