"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Mail,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { approveSchedule, copyWeekIntoDraft, discardSchedule } from "@/lib/hr/actions";
import type { WeekOnScreen } from "@/lib/hr/fetch";
import { SendDialog, type SendOption } from "@/components/hr/send-dialog";
import {
  addDays,
  approvalState,
  monthDay,
  weekStartOf,
  type ApprovalStep,
  type Department,
  type Schedule,
} from "@/lib/hr/model";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { departmentColor } from "@/lib/hr/colors";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The page header's controls, in the same places the production plan and the
 * HR dashboard put them so nobody has to learn two layouts.
 *
 * Left: Edit. Right, together: which department; Day, Week or Range and the
 * dates; and for a single week, which version - approved or a draft - with
 * signing, sending, printing and copying beside it.
 */

export type Span = "day" | "week" | "range";

/**
 * Edit, top left.
 *
 * On a week that is already approved, pressing it asks first, then opens a
 * copy of the approved schedule as your draft - so you change the exceptions,
 * not retype the week - and that draft has to be approved again. The approved
 * week stays posted until it is.
 */
export function EditWeekButton({
  editing,
  departmentId,
  approvedToCopy,
}: {
  editing: boolean;
  departmentId: string;
  /** Approved weeks on screen you have no draft for yet. Empty when nothing needs asking. */
  approvedToCopy: { weekStart: string; scheduleId: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  function navigate(on: boolean) {
    const search = new URLSearchParams(params.toString());
    if (on) search.set("edit", "1");
    else search.delete("edit");
    search.delete("view");
    router.push(`/hr/schedule?${search}`);
  }

  async function start() {
    if (approvedToCopy.length === 0) {
      navigate(true);
      return;
    }
    const ok = await confirm({
      title: approvedToCopy.length === 1 ? "Change the approved week?" : `Change ${approvedToCopy.length} approved weeks?`,
      description:
        "A copy of the approved schedule opens as your draft for you to change. The approved week stays posted until your draft is approved again.",
      confirmLabel: "Yes, change it",
      cancelLabel: "No",
    });
    if (!ok) return;
    startTransition(async () => {
      for (const week of approvedToCopy) {
        const result = await copyWeekIntoDraft({
          departmentId,
          weekStart: week.weekStart,
          fromScheduleId: week.scheduleId,
          shiftDays: 0,
        });
        if (!result.ok) {
          await confirm({ title: result.message, cancelLabel: false });
          return;
        }
      }
      navigate(true);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (editing ? navigate(false) : start())}
      aria-pressed={editing}
      title={
        editing
          ? "Open for changes. They go into your draft. Press again to lock."
          : approvedToCopy.length > 0
            ? "Approved and locked. Press to change it - you will be asked, and the change needs approval again."
            : "Locked. Press to change hours."
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition-colors disabled:opacity-60",
        editing ? "bg-success text-white" : "bg-primary text-primary-foreground hover:opacity-90"
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : editing ? <CheckCircle2 className="size-3.5" /> : <Pencil className="size-3.5" />}
      {editing ? "Editing - press to lock" : "Edit the week"}
    </button>
  );
}

export function WeekControls({
  departments,
  departmentId,
  span,
  from,
  to,
  today,
  week,
  lastWeekApproved,
  chain,
  chainNames,
  canSignNext,
  isAdmin,
  sendOptions,
}: {
  departments: Department[];
  departmentId: string;
  span: Span;
  from: string;
  to: string;
  today: string;
  /** The single week on screen, when Day or Week. Null across a range. */
  week: WeekOnScreen | null;
  /** Last week's approved schedule, if there was one, to copy from. */
  lastWeekApproved: Schedule | null;
  /** This department's approval chain, in order. */
  chain: ApprovalStep[];
  chainNames: [string, string][];
  canSignNext: boolean;
  isAdmin: boolean;
  /** Departments with an approved week to email, for the send dialog. */
  sendOptions: SendOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const schedules = week?.schedules ?? [];
  const viewing = week?.viewing ?? null;
  const approved = schedules.find((s) => s.status === "approved") ?? null;
  const drafts = schedules.filter((s) => s.status === "draft");
  const nameOf = new Map(chainNames);

  function go(patch: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    setOpen(false);
    router.push(`/hr/schedule?${search}`);
  }

  /** Switching span keeps the day being looked at as the anchor. */
  function setSpan(next: Span) {
    const anchor = span === "day" ? from : from <= today && today <= to ? today : from;
    if (next === "day") go({ span: "day", from: anchor, to: null, view: null });
    else if (next === "week") go({ span: null, from: weekStartOf(anchor), to: null, view: null });
    else go({ span: "range", from: weekStartOf(anchor), to: addDays(weekStartOf(anchor), 13), view: null });
  }

  function step(direction: 1 | -1) {
    if (span === "day") go({ from: addDays(from, direction), view: null });
    else if (span === "week") go({ from: addDays(from, direction * 7), view: null });
    else {
      const length = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
      go({ from: addDays(from, direction * length), to: addDays(to, direction * length), view: null });
    }
  }

  async function sign(schedule: Schedule) {
    const state = approvalState(chain, schedule.approvals);
    const last = chain.length === 0 || state.done + 1 >= chain.length;
    const ok = await confirm({
      title: last
        ? `Approve this week for ${departments.find((d) => d.id === departmentId)?.name ?? "the department"}?`
        : `Sign step ${state.nextStep?.step ?? 1} of ${chain.length}?`,
      description: last
        ? "It becomes the schedule that prints and gets sent. A previously approved week is kept as the record and this replaces it."
        : `Your signature is recorded. The week is approved once ${chain.length - state.done - 1} more step${chain.length - state.done - 1 === 1 ? "" : "s"} sign.`,
      confirmLabel: last ? "Approve" : "Sign",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await approveSchedule({ scheduleId: schedule.id });
      if (!result.ok) setError(result.message);
      else if (result.complete) go({ view: null, edit: null });
      router.refresh();
    });
  }

  async function copyFrom(source: Schedule, shiftDays: number, label: string) {
    const ok = await confirm({
      title: `Copy ${label} into your draft?`,
      description:
        "Every shift comes across so you change the exceptions instead of retyping the week. Anything already in your draft for the same days is replaced. People borrowed from other departments are not copied.",
      confirmLabel: "Copy",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      // The Monday, not `from` - in Day span `from` is the day being looked at.
      const result = await copyWeekIntoDraft({ departmentId, weekStart: weekStartOf(from), fromScheduleId: source.id, shiftDays });
      if (!result.ok) setError(result.message);
      else go({ edit: "1", view: null });
      router.refresh();
    });
  }

  async function discard(schedule: Schedule) {
    const ok = await confirm({
      title: schedule.status === "approved" ? "Remove the approved week?" : "Discard this draft?",
      description:
        schedule.status === "approved"
          ? "The department will have no approved schedule for this week until another is approved."
          : "Every shift in it is thrown away.",
      confirmLabel: schedule.status === "approved" ? "Remove" : "Discard",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await discardSchedule({ scheduleId: schedule.id });
      if (!result.ok) setError(result.message);
      else go({ view: null, edit: null });
      router.refresh();
    });
  }

  const weekStart = weekStartOf(from);

  return (
    <span className="relative flex flex-wrap items-center gap-2">
      <select
        value={departmentId}
        onChange={(event) => go({ dept: event.target.value, view: null, edit: null })}
        aria-label="Department"
        className="h-7 max-w-48 rounded-sm bg-card px-1.5 text-xs font-semibold ring-1 ring-foreground/15 focus:ring-primary focus:outline-none"
      >
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.line ? `${department.line} › ` : ""}
            {department.name}
          </option>
        ))}
      </select>

      {/* Day, Week or Range, and the dates. The same control as the dashboard. */}
      <span className="flex items-center overflow-hidden rounded-sm ring-1 ring-foreground/15">
        {(
          [
            ["day", "Day"],
            ["week", "Week"],
            ["range", "Range"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSpan(id)}
            aria-pressed={span === id}
            className={cn(
              "h-7 border-r border-foreground/15 px-2 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
              span === id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => step(-1)} aria-label="Earlier" className="inline-flex size-7 items-center justify-center text-primary hover:bg-muted">
          <ChevronLeft className="size-4" />
        </button>
        {span === "day" && (
          <input
            type="date"
            value={from}
            aria-label="Day"
            onChange={(event) => event.target.value && go({ from: event.target.value, view: null })}
            className="h-7 bg-card px-1 text-xs tabular-nums focus:outline-none"
          />
        )}
        {span === "week" && (
          <span className="px-1.5 text-xs font-semibold tabular-nums">
            {monthDay(weekStart)} – {monthDay(addDays(weekStart, 6))}
          </span>
        )}
        {span === "range" && (
          <>
            <input
              type="date"
              value={from}
              max={to}
              aria-label="From"
              onChange={(event) => event.target.value && go({ from: event.target.value, view: null })}
              className="h-7 bg-card px-1 text-xs tabular-nums focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">&rarr;</span>
            <input
              type="date"
              value={to}
              min={from}
              aria-label="To"
              onChange={(event) => event.target.value && go({ to: event.target.value, view: null })}
              className="h-7 bg-card px-1 text-xs tabular-nums focus:outline-none"
            />
          </>
        )}
        <button type="button" onClick={() => step(1)} aria-label="Later" className="inline-flex size-7 items-center justify-center text-primary hover:bg-muted">
          <ChevronRight className="size-4" />
        </button>
      </span>

      {/* Approved, or a draft: only meaningful for one week at a time. */}
      {week ? (
        <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
          <button
            type="button"
            onClick={() => approved && go({ view: approved.id, edit: null })}
            disabled={!approved}
            aria-pressed={viewing?.status === "approved"}
            title={approved ? "The approved week - what prints and gets sent" : "Nothing approved for this week yet"}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 px-2 text-xs font-semibold transition-colors disabled:opacity-40",
              viewing?.status === "approved" ? "bg-success text-white" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            <span className="text-[0.5625rem] font-bold tracking-wider uppercase">Approved</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "inline-flex h-7 items-center gap-1 border-l border-foreground/15 px-2 text-xs font-semibold transition-colors",
              viewing?.status === "draft" ? "bg-warning-foreground text-white" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {viewing?.status === "draft" ? (
              <>
                <span className="text-[0.5625rem] font-bold tracking-wider uppercase">Draft</span>
                <span className="max-w-24 truncate">{viewing.createdByName ?? "yours"}</span>
              </>
            ) : (
              <>
                Drafts <span className="tabular-nums opacity-70">{drafts.length}</span>
              </>
            )}
            <ChevronDown className="size-3" />
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
          Several weeks
          <Hint text="Approving, printing and emailing are done one week at a time. Switch to Week for those." />
        </span>
      )}

      {/* The signature, out in the open: a draft on screen that this person can
          sign gets its button right here, not buried in the menu. */}
      {week && viewing?.status === "draft" && (canSignNext || isAdmin) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => sign(viewing)}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-success px-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {chain.length === 0 || approvalState(chain, viewing.approvals).done + 1 >= chain.length
            ? "Approve this week"
            : `Sign step ${approvalState(chain, viewing.approvals).nextStep?.step ?? 1} of ${chain.length}`}
        </button>
      )}
      {week && viewing?.status === "draft" && !(canSignNext || isAdmin) && chain.length > 0 && (
        <span className="flex items-center gap-1 rounded-sm bg-warning-muted px-2 py-1 text-[0.6875rem] font-medium text-warning-foreground">
          {approvalState(chain, viewing.approvals).done} of {chain.length} signed
          {(() => {
            const next = approvalState(chain, viewing.approvals).nextStep;
            return next ? ` · waiting on ${nameOf.get(next.employeeId) ?? "?"}` : "";
          })()}
        </span>
      )}

      {week && sendOptions.length > 0 && (
        <button
          type="button"
          onClick={() => setSendOpen(true)}
          title={
            approved?.sentAt
              ? `Sent ${new Date(approved.sentAt).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" })}. Send again.`
              : "Email an approved week to a department. You choose which, and confirm twice."
          }
          className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Mail className="size-3.5" />
          {approved?.sentAt && viewing?.id === approved.id ? "Sent" : "Email"}
        </button>
      )}
      {week && (
        <SendDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          options={sendOptions}
          initialDepartmentId={departmentId}
          weekLabel={`${monthDay(weekStart)} – ${monthDay(addDays(weekStart, 6))}`}
        />
      )}

      {week && approved && viewing?.id === approved.id && (
        <>
          <Link
            href={`/hr/schedule/print?dept=${departmentId}&week=${weekStart}`}
            title="Print the approved week for this department"
            className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10"
          >
            <Printer className="size-3.5" />
            Print
          </Link>
        </>
      )}

      {open && week && (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-[55] cursor-default" />
          <div className="absolute top-9 right-0 z-[60] w-84 overflow-hidden rounded-sm bg-card shadow-lg ring-1 ring-foreground/15">
            <p className="flex items-center gap-1.5 border-b border-border bg-surface-sunk px-2.5 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Drafts
              <span className="font-normal">{drafts.length}</span>
              <Hint text="A supervisor's unapproved week. Nothing prints or sends until the approval chain has signed it." />
            </p>

            {chain.length > 0 ? (
              <p className="border-b border-border/50 px-2.5 py-1 text-[0.6875rem] text-muted-foreground">
                Approves in order:{" "}
                {chain.map((s, i) => (
                  <span key={s.step}>
                    {i > 0 && " → "}
                    <span className="font-medium text-foreground">{nameOf.get(s.employeeId) ?? "?"}</span>
                  </span>
                ))}
              </p>
            ) : (
              <p className="border-b border-border/50 px-2.5 py-1 text-[0.6875rem] text-warning-foreground">
                No approval chain set for this department. Only an administrator can approve until one is set in Configuration.
              </p>
            )}

            {drafts.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No drafts. Press Edit the week and tap a day to open one.</p>
            )}

            {drafts.map((draft) => {
              const state = approvalState(chain, draft.approvals);
              const next = state.nextStep ? nameOf.get(state.nextStep.employeeId) : null;
              return (
                <div key={draft.id} className={cn("border-b border-border/50 last:border-b-0", draft.id === viewing?.id && "bg-warning-muted/50")}>
                  <button type="button" onClick={() => go({ view: draft.id, edit: null })} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted">
                    <span className="min-w-0 flex-1 truncate font-medium">{draft.name ?? `${draft.createdByName ?? "Someone"}'s draft`}</span>
                    <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
                      {new Date(draft.updatedAt).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </button>
                  {chain.length > 0 && (
                    <p className="px-2.5 pb-1 text-[0.625rem] text-muted-foreground">
                      {state.done} of {chain.length} signed
                      {next && (
                        <>
                          {" "}· next: <span className="font-medium text-foreground">{next}</span>
                        </>
                      )}
                    </p>
                  )}
                  <div className="flex gap-1.5 px-2.5 pb-1.5">
                    {(canSignNext || isAdmin) && (
                      <button type="button" disabled={pending} onClick={() => sign(draft)} className="inline-flex h-6 items-center gap-1 rounded-sm bg-success px-2 text-[0.6875rem] font-semibold text-white disabled:opacity-50">
                        {pending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                        {chain.length === 0 || state.done + 1 >= chain.length ? "Approve this week" : `Sign step ${state.nextStep?.step ?? 1}`}
                      </button>
                    )}
                    <button type="button" disabled={pending} onClick={() => discard(draft)} className="inline-flex h-6 items-center gap-1 rounded-sm px-2 text-[0.6875rem] text-muted-foreground hover:text-destructive disabled:opacity-50">
                      <Trash2 className="size-3" />
                      Discard
                    </button>
                  </div>
                </div>
              );
            })}

            <p className="flex items-center gap-1.5 border-y border-border bg-surface-sunk px-2.5 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Start from
              <Hint text="Most weeks look like the last one. Copy it in and change the exceptions." />
            </p>
            {approved && <MenuRow icon={<Copy />} label="This week's approved schedule" onClick={() => copyFrom(approved, 0, "the approved week")} disabled={pending} />}
            {lastWeekApproved ? (
              <MenuRow icon={<Copy />} label={`Last week (${monthDay(addDays(weekStart, -7))})`} disabled={pending} onClick={() => copyFrom(lastWeekApproved, 7, "last week")} />
            ) : (
              <p className="px-2.5 py-1.5 text-[0.6875rem] text-muted-foreground">No approved schedule last week to copy.</p>
            )}

            {approved && isAdmin && (
              <>
                <p className="border-y border-border bg-surface-sunk px-2.5 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">Administrator</p>
                <MenuRow icon={<Trash2 />} label="Remove the approved week" disabled={pending} onClick={() => discard(approved)} />
              </>
            )}

            {error && <p className="bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
          </div>
        </>
      )}
    </span>
  );
}

function MenuRow({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-left text-xs font-medium last:border-b-0 hover:bg-muted disabled:opacity-40 [&>svg]:size-3.5 [&>svg]:text-primary"
    >
      {icon}
      {label}
    </button>
  );
}

/** Colour swatch for a department, for lists. */
export function DeptSwatch({ department, index }: { department: Department; index: number }) {
  const look = departmentColor(department.color, index);
  return <span className={cn("block h-3.5 w-1 shrink-0", look.dot)} />;
}
