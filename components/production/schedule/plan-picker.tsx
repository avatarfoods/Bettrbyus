"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Settings2,
  Undo2,
} from "lucide-react";
import {
  clearRange,
  confirmDraft,
  discardDraft,
  duplicateLiveIntoDraft,
  newEmptyDraft,
} from "@/lib/production/schedule/actions";
import type { DraftSummary } from "@/lib/production/schedule/ensure";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Which plan you are looking at, and how one becomes the live one.
 *
 * It sits in the page header beside the count because it is a fact about the
 * whole page, not a control inside the grid - and because the first question
 * anyone has on opening this is "am I looking at what the floor is doing, or
 * at somebody's idea".
 *
 * Exactly one plan is live. Confirming a draft merges its cells into that one
 * plan; it does not create a second live one. That is why the button says
 * what it does rather than saying "confirm", which tells you nothing about
 * what changes.
 */
export function PlanPicker({
  scheduleId,
  from,
  to,
  liveName,
  liveEntries,
  drafts,
  viewingId,
  myDraftId,
  canEdit,
  editing,
}: {
  scheduleId: string;
  from: string;
  to: string;
  liveName: string;
  liveEntries: number;
  drafts: DraftSummary[];
  viewingId: string | null;
  myDraftId: string | null;
  canEdit: boolean;
  /** The plan is open for typing, so the actions that write are offered. */
  editing: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const openDrafts = drafts.filter((draft) => draft.status === "draft");
  const viewed = drafts.find((draft) => draft.id === viewingId) ?? null;

  /** Switches the plan, keeping the range and the WIP day already chosen. */
  function go(next: string) {
    const search = new URLSearchParams(params.toString());
    search.set("view", next);
    setOpen(false);
    router.push(`/production/schedule?${search}`);
  }

  /** A draft with nothing in it, for planning a week from scratch. */
  function startFresh() {
    if (
      !confirm(
        "Start a new draft with nothing in it? Any draft you have open now is thrown away, and the grid opens blank for this range — the live plan is untouched."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await newEmptyDraft({ scheduleId, from, to });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      go(result.id ?? "live");
      router.refresh();
    });
  }

  function makeLive(draftId: string, name: string) {
    if (
      !confirm(
        `Merge "${name}" into the live plan? Its numbers become what the floor works from, and the printed sheets and dashboard change with it.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await confirmDraft({ draftId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      go("live");
      router.refresh();
    });
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      {/*
        Two buttons, not one menu.

        Which plan you are on and which drafts exist are different questions,
        and folding them into a single dropdown meant the answer to "what have
        I got in progress" was hidden behind a click. Live is one tap; Drafts
        opens the list.
      */}
      <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
        <button
          type="button"
          onClick={() => go("live")}
          aria-pressed={viewingId === null}
          title="The plan the floor is working from"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 px-2 text-xs font-semibold transition-colors",
            viewingId === null
              ? "bg-success text-white"
              : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          <span className="text-[0.5625rem] font-bold tracking-wider uppercase">
            Live
          </span>
          <span className="max-w-36 truncate">{liveName}</span>
          {viewingId === null && (
            <span className="text-[0.625rem] font-normal tabular-nums opacity-80">
              {liveEntries}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title="Drafts against this plan"
          className={cn(
            "inline-flex h-7 items-center gap-1 border-l border-foreground/15 px-2 text-xs font-semibold transition-colors",
            viewed
              ? "bg-warning-foreground text-white"
              : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          {viewed ? (
            <>
              <span className="text-[0.5625rem] font-bold tracking-wider uppercase">
                Draft
              </span>
              <span className="max-w-28 truncate">{viewed.name}</span>
            </>
          ) : (
            <>
              Drafts
              <span className="tabular-nums opacity-70">
                {openDrafts.length}
              </span>
            </>
          )}
          <ChevronDown className="size-3" />
        </button>
      </span>

      {/*
        Getting back to the live plan is one click, always visible.

        It was only in the dropdown, which meant the most common thing anyone
        wants - "show me what the floor is actually doing" - took opening a
        menu and finding a row in it. Anything you do in a draft, you do
        wanting to come back.
      */}
      {viewed && (
        <button
          type="button"
          onClick={() => go("live")}
          className="inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/15"
        >
          <Undo2 className="size-3.5" />
          Back to live
        </button>
      )}

      {/*
        The heavy actions, beside the plan they act on.

        Copying a week in or clearing one is done to a specific plan, so they
        belong next to the thing that says which plan you are on rather than
        halfway down a toolbar of filters.
      */}
      {editing && canEdit && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setMenu((value) => !value)}
            aria-expanded={menu}
            aria-label="Plan actions"
            title="Start over, copy the live plan in, clear this range"
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-4" />
          </button>

          {menu && (
            <>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMenu(false)}
                className="fixed inset-0 z-[55] cursor-default"
              />
              <div className="absolute top-8 right-0 z-[60] w-64 overflow-hidden rounded-sm bg-card shadow-lg ring-1 ring-foreground/15">
                <PlanAction
                  title="Copy the live plan in"
                  hint="Takes the live numbers for this range into your draft, so you change them instead of retyping them."
                  disabled={pending}
                  onClick={() => {
                    setMenu(false);
                    startTransition(async () => {
                      const result = await duplicateLiveIntoDraft({
                        scheduleId,
                        from,
                        to,
                      });
                      if (result.ok) router.refresh();
                      else setError(result.message);
                    });
                  }}
                />
                <PlanAction
                  title="Clear this range"
                  danger
                  hint={`Zeroes everything between ${from} and ${to} in your draft. The live plan is untouched until you merge.`}
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Clear everything planned between ${from} and ${to}?`)) return;
                    setMenu(false);
                    startTransition(async () => {
                      const result = await clearRange({ scheduleId, from, to });
                      if (result.ok) router.refresh();
                      else setError(result.message);
                    });
                  }}
                />
                <PlanAction
                  title="Start this draft again"
                  danger
                  hint="Throws away every change in your draft and puts you back where the live plan is."
                  disabled={pending || !myDraftId}
                  onClick={() => {
                    if (!myDraftId) return;
                    if (!confirm("Throw away every change in your draft?")) return;
                    setMenu(false);
                    startTransition(async () => {
                      const result = await discardDraft({ draftId: myDraftId });
                      if (result.ok) {
                        go("live");
                        router.refresh();
                      } else setError(result.message);
                    });
                  }}
                />
              </div>
            </>
          )}
        </span>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[55] cursor-default"
          />
          <div className="absolute top-8 right-0 z-[60] w-80 overflow-hidden rounded-sm bg-card shadow-lg ring-1 ring-foreground/15">
            <button
              type="button"
              onClick={() => go("live")}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors",
                viewingId === null ? "bg-success/10" : "hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "block h-6 w-1 shrink-0",
                  viewingId === null ? "bg-success" : "bg-transparent"
                )}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="text-[0.5625rem] font-bold tracking-wider text-success uppercase">
                  Live
                </span>
                <span className="min-w-0 truncate text-xs font-semibold">
                  {liveName}
                </span>
                <Hint text="The one plan the floor works from. Every printed sheet, the dashboard and the WIP calculator read this and nothing else." />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {liveEntries}
              </span>
            </button>

            <p className="flex items-center gap-1.5 border-y border-border bg-surface-sunk px-2.5 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Drafts
              <span className="font-normal">{openDrafts.length} open</span>
              <Hint text="Somebody's unconfirmed changes. A draft is invisible to the floor, the sheets and the dashboard until it is merged into the live plan." />
              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={startFresh}
                  className="ml-auto inline-flex h-6 items-center gap-1 rounded-sm bg-primary px-1.5 text-[0.625rem] font-semibold text-primary-foreground normal-case disabled:opacity-50"
                >
                  <Plus className="size-3" />
                  New, empty
                </button>
              )}
            </p>

            {openDrafts.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                Nothing unconfirmed.
              </p>
            )}

            {openDrafts.map((draft) => (
              <div
                key={draft.id}
                className={cn(
                  "border-b border-border/50 last:border-b-0",
                  draft.id === viewingId && "bg-warning-muted/50"
                )}
              >
                <button
                  type="button"
                  onClick={() => go(draft.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="min-w-0 truncate text-xs font-medium">
                      {draft.name}
                    </span>
                    {draft.id === myDraftId && (
                      <span className="shrink-0 text-[0.625rem] text-primary">
                        yours
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                      {draft.entryCount}
                    </span>
                    <Hint
                      text={`${draft.createdByName} — ${draft.entryCount} ${draft.entryCount === 1 ? "change" : "changes"} not yet in the live plan.`}
                    />
                  </span>
                </button>

                {canEdit && draft.entryCount > 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => makeLive(draft.id, draft.name)}
                    className="mx-2.5 mb-1.5 inline-flex h-7 items-center gap-1.5 rounded-sm bg-success px-2.5 text-[0.6875rem] font-semibold text-white disabled:opacity-50"
                  >
                    {pending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3" />
                    )}
                    Make this the live plan
                  </button>
                )}
              </div>
            ))}

            {error && (
              <p className="bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </span>
  );
}

/** One action in the plan menu: what it does, behind a "?". */
function PlanAction({
  title,
  hint,
  danger,
  disabled,
  onClick,
}: {
  title: string;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 text-left text-xs font-medium hover:underline disabled:opacity-40",
          danger ? "text-destructive" : "text-foreground"
        )}
      >
        {title}
      </button>
      <Hint text={hint} />
    </span>
  );
}
