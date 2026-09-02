"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, Trash2 } from "lucide-react";
import {
  confirmDraft,
  discardAllDrafts,
  discardDraft,
} from "@/lib/production/schedule/actions";
import type { DraftSummary } from "@/lib/production/schedule/ensure";
import { Hint, SettingsPage } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The plans, listed.
 *
 * The planning page is for typing numbers; this is for the paperwork around
 * them - what is live, what is open, whose it is, and getting rid of the ones
 * nobody needs. Doing that on the planning page meant a panel that grew every
 * week over the grid it was covering.
 *
 * Exactly one plan is live, and it is always first and always named. It is
 * the only thing the floor, the printed sheets and the dashboard read. A
 * confirmed draft is NOT live: it is the record of a merge, and its numbers
 * are already in the live plan.
 */
export function PlansSettings({
  isAdmin,
  liveName,
  liveEntries,
  drafts,
  myProfileId,
}: {
  isAdmin: boolean;
  liveName: string | null;
  liveEntries: number;
  drafts: DraftSummary[];
  myProfileId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = drafts.filter((draft) => draft.status === "draft");
  const done = drafts.filter((draft) => draft.status === "confirmed");

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.message ?? "That did not work");
    });
  }

  return (
    <SettingsPage
      intro={
        <>
          There is exactly one <strong>live</strong> plan. It is what the floor
          works from, and the only thing the printed sheets, the dashboard and
          the WIP calculator read. Everything else here is a proposal about it,
          or a record of one that was merged — neither drives anything.
        </>
      }
    >
      {error && (
        <p className="rounded-sm bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-sm bg-card ring-1 ring-foreground/10">
        <header className="flex items-baseline gap-2 border-b-2 border-b-success bg-success/10 px-2.5 py-1.5">
          <span className="text-[0.5625rem] font-bold tracking-wider text-success uppercase">
            Live
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {liveName ?? "No live plan yet"}
          </h2>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {liveEntries} {liveEntries === 1 ? "cell" : "cells"}
          </span>
        </header>
        <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
          The one plan the floor works from.
          <Hint text="Every printed sheet, the dashboard and the WIP calculator read this and nothing else. A draft is invisible to all of them until it is merged in, and a merged draft is only a record afterwards." />
          <Link
            href="/production/schedule?view=live"
            className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            Open it
            <ArrowUpRight className="size-3" />
          </Link>
        </p>
      </section>

      <PlanList
        title="Open drafts"
        note="Somebody's unconfirmed changes. Confirming merges them into the live plan; discarding throws them away."
        rows={open}
        empty="Nothing unconfirmed."
        myProfileId={myProfileId}
        isAdmin={isAdmin}
        pending={pending}
        onConfirm={(id) => run(() => confirmDraft({ draftId: id }))}
        onDiscard={(id) => run(() => discardDraft({ draftId: id }))}
      />

      <PlanList
        title="Merged already"
        note="Drafts that were confirmed into the live plan. Their numbers are in the live plan now, so this is only the record of who changed what and when. Removing one deletes the record and nothing else."
        rows={done}
        empty="Nothing has been merged yet."
        myProfileId={myProfileId}
        isAdmin={isAdmin}
        pending={pending}
        onDiscard={(id) => run(() => discardDraft({ draftId: id }))}
      />

      {isAdmin && drafts.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `Clear all ${drafts.length} entries from the list? The live plan is untouched.`
              )
            ) {
              return;
            }
            run(() => discardAllDrafts());
          }}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-sm border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Clear the whole list
        </button>
      )}
    </SettingsPage>
  );
}

function PlanList({
  title,
  note,
  rows,
  empty,
  myProfileId,
  isAdmin,
  pending,
  onConfirm,
  onDiscard,
}: {
  title: string;
  note: string;
  rows: DraftSummary[];
  empty: string;
  myProfileId: string | null;
  isAdmin: boolean;
  pending: boolean;
  onConfirm?: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-1.5 flex items-center gap-1.5 border-b-2 border-b-brand/60 pb-1 text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
        {title}
        <span className="font-normal tracking-normal">{rows.length}</span>
        <Hint text={note} />
      </h2>

      {rows.length === 0 ? (
        <p className="px-0.5 py-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const yours = row.createdById === myProfileId;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-1.5 last:border-b-0"
              >
                <Link
                  href={`/production/schedule?view=${row.id}`}
                  className="min-w-0 truncate text-xs font-medium hover:text-primary hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {row.createdByName}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.entryCount}{" "}
                  {row.entryCount === 1 ? "change" : "changes"}
                </span>
                <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
                  {new Date(row.updatedAt ?? row.createdAt).toLocaleString(
                    undefined,
                    {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "numeric",
                      minute: "2-digit",
                    }
                  )}
                </span>
                {yours && (
                  <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                    yours
                  </span>
                )}

                <span className="ml-auto flex shrink-0 gap-2">
                  {onConfirm && (yours || isAdmin) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onConfirm(row.id)}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                  {(yours || isAdmin) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Remove "${row.name}"?`)) return;
                        onDiscard(row.id);
                      }}
                      className={cn(
                        "text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                      )}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
