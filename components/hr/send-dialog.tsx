"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MailX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { prepareSend } from "@/lib/hr/actions";
import { departmentColor } from "@/lib/hr/colors";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

export type SendOption = {
  departmentId: string;
  name: string;
  colorKey: string | null;
  colorIndex: number;
  scheduleId: string;
  /** People with an email on file. */
  recipients: number;
  /** People with none, by name. */
  missing: string[];
};

/**
 * Emailing the week.
 *
 * Sending goes to real people, so it is deliberate: pick the department,
 * see who will and will not get it, then say yes twice. Only approved weeks
 * can be sent, so the list is the departments approved this week.
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
  const [departmentId, setDepartmentId] = useState(
    options.some((o) => o.departmentId === initialDepartmentId) ? initialDepartmentId : (options[0]?.departmentId ?? "")
  );
  const chosen = options.find((o) => o.departmentId === departmentId) ?? null;

  async function send() {
    if (!chosen) return;
    const first = await confirm({
      title: `Send ${chosen.name}'s week to ${chosen.recipients} ${chosen.recipients === 1 ? "person" : "people"}?`,
      description: `Week of ${weekLabel}. ${chosen.missing.length > 0 ? `${chosen.missing.length} without email will not get it. ` : ""}The approved schedule goes out as it is now.`,
      confirmLabel: "Yes, continue",
      cancelLabel: "Not yet",
    });
    if (!first) return;
    const second = await confirm({
      title: "Are you sure?",
      description: `Your mail program opens with ${chosen.recipients} addresses in Bcc and the week typed in. You still press Send there.`,
      confirmLabel: "Yes, open the email",
      cancelLabel: "Cancel",
    });
    if (!second) return;

    startTransition(async () => {
      const result = await prepareSend({ scheduleId: chosen.scheduleId });
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
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-sm p-0">
        <div className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" />
            Email the week of {weekLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Only approved weeks can be sent. Pick the department, check who gets it, then confirm.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          {options.length === 0 ? (
            <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
              No department has an approved week for {weekLabel} yet. Approve one first.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Department
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                  className="h-9 w-full rounded-sm bg-card px-2 text-sm font-medium normal-case tracking-normal ring-1 ring-foreground/15 focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {options.map((o) => (
                    <option key={o.departmentId} value={o.departmentId}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>

              {chosen && (
                <div className={cn("flex flex-col gap-1 rounded-sm px-3 py-2", departmentColor(chosen.colorKey, chosen.colorIndex).tint)}>
                  <p className="flex items-center gap-2 text-xs">
                    <span className={cn("block h-4 w-1", departmentColor(chosen.colorKey, chosen.colorIndex).dot)} />
                    <span className="font-bold">{chosen.name}</span>
                    <span className="ml-auto font-semibold tabular-nums">
                      {chosen.recipients} <span className="font-normal text-muted-foreground">will get it</span>
                    </span>
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
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-sm bg-card px-3 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!chosen || chosen.recipients === 0 || pending}
            onClick={send}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
            Continue
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
