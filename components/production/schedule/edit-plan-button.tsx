"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * The switch that opens the plan for typing.
 *
 * It sits with Confirm, because those two are the start and end of the same
 * job: open the plan, change it, put it live. The mode lives in the URL so a
 * refresh does not lock the grid again under you.
 *
 * Opening it asks first. Typing lands in a draft rather than on the live
 * plan, so this is not the dangerous step - but it is the step where people
 * think they are changing what the floor runs, and the gate belongs where
 * the intention is formed. The one that actually moves live asks again.
 */
export function EditPlanButton({ editing }: { editing: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();

  async function toggle() {
    if (!editing) {
      const ok = await confirm({
        title: "Open the live plan for editing?",
        description:
          "Your changes go into your own draft first — the floor keeps running the current plan until you confirm.",
        confirmLabel: "Open it",
        cancelLabel: "Leave it locked",
      });
      if (!ok) return;
    }

    const search = new URLSearchParams(params.toString());
    if (editing) search.delete("edit");
    else search.set("edit", "1");
    router.push(`/production/schedule?${search}`);
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
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
