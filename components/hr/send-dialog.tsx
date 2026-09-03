"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Mail, MailX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { prepareSend, previewSend, type SendPreviewRow } from "@/lib/hr/actions";
import { departmentColor } from "@/lib/hr/colors";
import { DAY_NAMES, monthDay } from "@/lib/hr/model";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

export type SendOption = {
  departmentId: string;
  name: string;
  line: string | null;
  colorKey: string | null;
  colorIndex: number;
  /** Where the department stands this week. Only approved can be sent. */
  status: "approved" | "draft" | "none";
  /** The approved schedule, when there is one. */
  scheduleId: string | null;
  /** People with an email on file. */
  recipients: number;
  /** People with none, by name. */
  missing: string[];
};

type Preview = { departmentName: string; dates: string[]; rows: SendPreviewRow[]; recipients: number; missing: string[] };

/**
 * Emailing the week.
 *
 * Sending goes to real people, so it is deliberate. Every department is in
 * the list whatever schedule is on screen - the ones not approved yet say so
 * and cannot be picked. Continue asks once, then shows the week itself, small,
 * exactly as it will be read, and only after a second yes does the mail
 * program open.
 */
export function SendDialog({
  open,
  onClose,
  options,
  initialDepartmentId,
  weekLabel,
}: {
  open: boolean;
  onClose: () => void;
  options: SendOption[];
  initialDepartmentId: string;
  weekLabel: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const sendable = options.filter((o) => o.status === "approved" && o.scheduleId);
  const [departmentId, setDepartmentId] = useState(
    sendable.some((o) => o.departmentId === initialDepartmentId) ? initialDepartmentId : (sendable[0]?.departmentId ?? "")
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const chosen = options.find((o) => o.departmentId === departmentId) ?? null;
  const canSend = !!chosen && chosen.status === "approved" && !!chosen.scheduleId;

  function close() {
    setPreview(null);
    onClose();
  }

  /** Step one: ask, then fetch the week to look at. */
  async function goToPreview() {
    if (!chosen || !chosen.scheduleId) return;
    const first = await confirm({
      title: `Send ${chosen.name}'s week to ${chosen.recipients} ${chosen.recipients === 1 ? "person" : "people"}?`,
      description: `Week of ${weekLabel}. ${chosen.missing.length > 0 ? `${chosen.missing.length} without email will not get it. ` : ""}You will see the week before anything is sent.`,
      confirmLabel: "Yes, show me the week",
      cancelLabel: "Not yet",
    });
    if (!first) return;
    startTransition(async () => {
      const result = await previewSend({ scheduleId: chosen.scheduleId! });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      setPreview({
        departmentName: result.departmentName ?? chosen.name,
        dates: result.dates ?? [],
        rows: result.rows ?? [],
        recipients: result.recipients ?? 0,
        missing: result.missing ?? [],
      });
    });
  }

  /** Step two: the last yes, then the mail program. */
  async function send() {
    if (!chosen || !chosen.scheduleId || !preview) return;
    const second = await confirm({
      title: "Are you sure?",
      description: `Your mail program opens with ${preview.recipients} addresses in Bcc and the week typed in. You still press Send there.`,
      confirmLabel: "Yes, open the email",
      cancelLabel: "Cancel",
    });
    if (!second) return;
    startTransition(async () => {
      const result = await prepareSend({ scheduleId: chosen.scheduleId! });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      const recipients = result.recipients ?? [];
      if (recipients.length === 0) {
        await confirm({ title: "Nobody in this department has an email on file", description: "Print the week for them instead.", cancelLabel: false });
        return;
      }
      window.location.href =
        `mailto:?bcc=${encodeURIComponent(recipients.join(","))}` +
        `&subject=${encodeURIComponent(result.subject ?? "Schedule")}` +
        `&body=${encodeURIComponent(result.body ?? "")}`;
      close();
      router.refresh();
    });
  }

  const tone = chosen ? departmentColor(chosen.colorKey, chosen.colorIndex) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className={cn("rounded-sm p-0", preview ? "max-w-3xl" : "max-w-md")}>
        <div className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" />
            Email the week of {weekLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {preview
              ? "This is the week exactly as it will be read. Check it, then open the email."
              : "Pick the department, check who gets it, then continue. Only approved weeks can be sent."}
          </DialogDescription>
        </div>

        {!preview ? (
          <div className="flex flex-col gap-3 px-4 py-3">
            <label className="flex flex-col gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Department
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className="h-8 w-full rounded-sm bg-card px-2 text-sm font-medium normal-case tracking-normal ring-1 ring-foreground/15 focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {departmentId === "" && <option value="">Choose a department…</option>}
                {options.map((o) => (
                  <option key={o.departmentId} value={o.departmentId} disabled={o.status !== "approved"}>
                    {o.status === "approved" ? "✓ " : o.status === "draft" ? "✎ " : "○ "}
                    {o.line ? `${o.line} › ` : ""}
                    {o.name}
                    {o.status === "approved" ? " · Approved" : o.status === "draft" ? " · Draft, not approved yet" : " · Not started"}
                  </option>
                ))}
              </select>
            </label>

            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3 text-success" /> {sendable.length} approved
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3 text-warning-foreground" /> {options.length - sendable.length} not ready
              </span>
              <Hint text="Every department you can see is listed, whichever schedule you were looking at. A week that is a draft, or not started, cannot be sent until it is approved." />
            </p>

            {chosen && tone && (
              <div className={cn("flex flex-col gap-1 rounded-sm px-3 py-2", tone.tint)}>
                <p className="flex items-center gap-2 text-xs">
                  <span className={cn("block h-4 w-1", tone.dot)} />
                  <span className="font-bold">{chosen.name}</span>
                  {canSend ? (
                    <span className="ml-auto font-semibold tabular-nums">
                      {chosen.recipients} <span className="font-normal text-muted-foreground">will get it</span>
                    </span>
                  ) : (
                    <span className="ml-auto text-warning-foreground">Not approved yet</span>
                  )}
                </p>
                {chosen.missing.length > 0 && (
                  <p className="flex items-start gap-1.5 text-[0.6875rem] text-warning-foreground">
                    <MailX className="mt-0.5 size-3 shrink-0" />
                    <span>
                      No email: {chosen.missing.join(", ")}. Print the week for them.
                      <Hint text="Add their email in People and they are included next time." />
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-3">
            <p className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-bold uppercase", tone?.tint)}>
                <span className={cn("block h-3.5 w-1", tone?.dot)} />
                {preview.departmentName}
              </span>
              <span className="font-semibold tabular-nums">{weekLabel}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {preview.rows.length} people · {preview.recipients} will get it
                {preview.missing.length > 0 && ` · ${preview.missing.length} without email`}
              </span>
            </p>
            {/* The week, small: the same shape as the wall sheet. */}
            <div className="max-h-[50vh] overflow-auto rounded-sm ring-1 ring-foreground/10">
              <table className="w-full min-w-[36rem] border-collapse text-[0.6875rem] leading-tight">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-brand-muted text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                    <th className="px-2 py-1 text-left">Name</th>
                    {preview.dates.map((date, i) => (
                      <th key={date} className={cn("px-1 py-1 text-center", i >= 5 && "bg-muted/60")}>
                        <span className="block">{DAY_NAMES[i].slice(0, 3)}</span>
                        <span className="block font-bold text-foreground tabular-nums">{monthDay(date)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, r) => (
                    <tr key={`${row.name}-${r}`} className={cn("border-t border-border/50", r % 2 === 1 && "bg-muted/30")}>
                      <td className="px-2 py-0.5 font-semibold whitespace-nowrap">
                        {row.name}
                        {row.from && <span className="ml-1 text-[0.5625rem] font-normal text-primary">from {row.from}</span>}
                      </td>
                      {row.days.map((d, i) => (
                        <td
                          key={i}
                          className={cn(
                            "px-1 py-0.5 text-center tabular-nums whitespace-nowrap",
                            i >= 5 && "bg-muted/40",
                            d.off ? "font-black tracking-wider text-muted-foreground" : cn("font-medium", tone?.tint)
                          )}
                        >
                          {d.off ? d.label : d.label.replace("-", " – ")}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {preview.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                        Nobody on this week.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {preview && (
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mr-auto inline-flex h-8 items-center gap-1 rounded-sm px-2 text-sm text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="inline-flex h-8 items-center rounded-sm bg-card px-3 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
          >
            Cancel
          </button>
          {!preview ? (
            <button
              type="button"
              disabled={!canSend || chosen!.recipients === 0 || pending}
              onClick={goToPreview}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || preview.recipients === 0}
              onClick={send}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-success px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Looks right, open the email
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
