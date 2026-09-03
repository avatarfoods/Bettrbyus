"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The switch that opens the plan for typing.
 *
 * It sits with Confirm, because those two are the start and end of the same
 * job: open the plan, change it, put it live. The mode lives in the URL so a
 * refresh does not lock the grid again under you.
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
