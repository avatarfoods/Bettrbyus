"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The switch that opens the plan for typing.
 *
 * It sits on the far left of the page header, beside the word Planning,
 * because it is the page's own mode rather than one control among the
 * filters - and because "am I able to change this" is the first thing anyone
 * needs to know, not something to find halfway across a toolbar.
 *
 * The mode lives in the URL. The button is up here and the grid it unlocks is
 * further down the page, so one of them has to own the state, and the address
 * bar is the only thing both can see. It also survives a refresh, which
 * matters when a save has just reloaded the page under you.
 */
export function EditPlanButton({ editing }: { editing: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  function toggle() {
    const search = new URLSearchParams(params.toString());
    if (editing) search.delete("edit");
    else search.set("edit", "1");
    router.push(`/production/schedule?${search}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      title={
        editing
          ? "The plan is open for typing. Changes go into your draft."
          : "The plan is locked. Turn this on to change it."
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition-colors",
        editing
          ? "bg-success text-white"
          : "bg-primary text-primary-foreground hover:opacity-90"
      )}
    >
      {editing ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Pencil className="size-3.5" />
      )}
      {editing ? "Editing" : "Edit the plan"}
    </button>
  );
}
