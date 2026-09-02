"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  clearLiveSchedule,
  discardAllDrafts,
} from "@/lib/production/schedule/actions";
import { SettingsPage } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Starting again.
 *
 * There is a real moment coming where the trial data has to go and the first
 * real week goes in, and doing that by deleting cells one at a time is how
 * something gets left behind. So it is a page - but a page you have to go
 * looking for, in Configuration, not a button on the plan somebody can hit
 * while scrolling.
 *
 * Both actions make you type the word. A confirm dialog is dismissed by
 * reflex; typing EMPTY is not something anybody does by accident.
 */
export function ResetSettings({
  isAdmin,
  plannedEntries,
  draftCount,
}: {
  isAdmin: boolean;
  plannedEntries: number;
  draftCount: number;
}) {
  return (
    <SettingsPage
      intro={
        <>
          For the reset before the first real week. Nothing here is
          recoverable, so both actions are administrator-only and both make you
          type the word before they run. Recipes, timing windows and WIP counts
          are never touched — this is only the plan.
        </>
      }
    >
      {!isAdmin ? (
        <p className="flex items-center gap-2 rounded-sm bg-warning-muted px-2.5 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="size-3.5 shrink-0" />
          Emptying the plan is limited to administrators.
        </p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          <Danger
            title="Discard every open draft"
            count={draftCount}
            noun={draftCount === 1 ? "draft" : "drafts"}
            body="Every unconfirmed change, from everybody, thrown away. The confirmed plan is untouched — this only clears what nobody has confirmed yet."
            word="DISCARD"
            run="drafts"
          />

          <Danger
            title="Empty the confirmed plan"
            count={plannedEntries}
            noun={plannedEntries === 1 ? "planned cell" : "planned cells"}
            body="Everything the floor is working from, gone. The schedule itself survives, so nothing has to be set up again — it is the numbers in it that go."
            word="EMPTY"
            run="live"
          />
        </div>
      )}
    </SettingsPage>
  );
}

/** One irreversible action, behind a typed word. */
function Danger({
  title,
  count,
  noun,
  body,
  word,
  run,
}: {
  title: string;
  count: number;
  noun: string;
  body: string;
  word: string;
  run: "drafts" | "live";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === word;

  function go() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result =
        run === "live"
          ? await clearLiveSchedule()
          : await discardAllDrafts();
      if (!result.ok) {
        setError(result.message ?? "That did not work");
        return;
      }
      setNotice(
        run === "live"
          ? `Emptied. ${"cleared" in result ? result.cleared : 0} planned cells removed.`
          : `Discarded ${"discarded" in result ? result.discarded : 0} drafts.`
      );
      setOpen(false);
      setTyped("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-sm bg-card ring-1 ring-destructive/30">
      <header className="flex items-baseline gap-2 border-b border-destructive/20 px-2.5 py-1.5">
        <h2 className="text-sm font-semibold text-destructive">{title}</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {count} {noun}
        </span>
      </header>

      <div className="flex flex-col gap-2 p-2.5">
        <p className="text-xs leading-snug text-muted-foreground">{body}</p>

        {notice && (
          <p className="rounded-sm bg-success/10 px-2 py-1 text-xs text-success">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-sm bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {error}
          </p>
        )}

        {!open ? (
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setOpen(true)}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-sm border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            {count === 0 ? "Nothing to remove" : title}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              Type <strong className="font-mono">{word}</strong>
              <input
                value={typed}
                autoFocus
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && armed) go();
                  if (event.key === "Escape") setOpen(false);
                }}
                aria-label={`Type ${word} to confirm`}
                className="h-8 w-28 rounded-sm border border-destructive/50 bg-card px-2 font-mono text-xs uppercase focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="h-8 rounded-sm px-2.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={go}
              disabled={!armed || pending}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-white transition-opacity",
                armed ? "bg-destructive" : "bg-destructive/40",
                pending && "opacity-60"
              )}
            >
              {pending && <Loader2 className="size-3 animate-spin" />}
              Do it
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
