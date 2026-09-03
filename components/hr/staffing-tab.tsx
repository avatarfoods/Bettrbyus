"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveStaffing } from "@/lib/hr/actions";
import {
  displayName,
  displayTime,
  isSchedulable,
  timeOptions,
  timeToHours,
  type ApprovalStep,
  type Department,
  type Employee,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The staffing sheet, as a tab.
 *
 * One row per department: who checks its timecards, who supervises it, how
 * many people it should have, how many Paychex says are active, and how many
 * are missing - in red when the answer is not zero. Down the right, a bar in
 * the department's colour for the hours it usually runs, so the shape of the
 * plant's day is visible at a glance. Administrators type the required
 * number and the hours; everyone else reads.
 */
export function StaffingTab({
  departments,
  allDepartments,
  employees,
  approvalSteps,
  canEdit,
}: {
  departments: Department[];
  allDepartments: Department[];
  employees: Employee[];
  approvalSteps: ApprovalStep[];
  canEdit: boolean;
}) {
  const look = (d: Department) => departmentColor(d.color, allDepartments.indexOf(d));
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const rows = departments.map((department) => {
    const active = employees.filter((e) => e.departmentId === department.id && isSchedulable(e)).length;
    const missing = Math.max(0, department.requiredHeadcount - active);
    const firstApprover = approvalSteps
      .filter((s) => s.departmentId === department.id)
      .sort((a, b) => a.step - b.step)[0];
    const supervisor = firstApprover ? empById.get(firstApprover.employeeId) : undefined;
    return { department, active, missing, supervisor };
  });

  const totals = rows.reduce(
    (sum, r) => ({
      required: sum.required + r.department.requiredHeadcount,
      active: sum.active + r.active,
      missing: sum.missing + r.missing,
    }),
    { required: 0, active: 0, missing: 0 }
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big label="required" value={String(totals.required)} hint="How many people the departments are supposed to have, added up. Set per department in this table." />
        <Big label="active in Paychex" value={String(totals.active)} hint="Active people on the schedule, from the last Paychex import. Contractors and anyone switched off are not counted." />
        <Big label="to hire" value={String(totals.missing)} warn={totals.missing > 0} />
        <span className="ml-auto flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
          The bar is the hours each department usually runs
          <Hint text="Not the schedule - just the shape of the day, so Main Kitchen at 6:30 AM to 3:00 AM reads at a glance. Administrators set it here." />
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[72rem] border-collapse text-xs">
          <thead>
            <tr className="bg-surface-sunk">
              <Th className="sticky left-0 z-10 w-48 bg-surface-sunk">Department</Th>
              <Th className="w-28">Timecard check</Th>
              <Th className="w-36">Supervisor</Th>
              <Th right className="w-20">Required</Th>
              <Th right className="w-16">Active</Th>
              <Th right className="w-16">Missing</Th>
              <Th className="w-56">Usual hours</Th>
              <Th>
                <Timeline.Header />
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ department, active, missing, supervisor }) => (
              <StaffingRow
                key={department.id}
                department={department}
                style={look(department)}
                active={active}
                missing={missing}
                supervisorName={supervisor ? displayName(supervisor) : null}
                canEdit={canEdit}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-foreground/20 bg-surface-sunk font-semibold">
              <td colSpan={3} className="sticky left-0 z-10 bg-surface-sunk px-3 py-1.5 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">
                Total
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.required}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.active}</td>
              <td className={cn("px-2 py-1.5 text-right tabular-nums", totals.missing > 0 && "text-destructive")}>{totals.missing}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StaffingRow({
  department,
  style,
  active,
  missing,
  supervisorName,
  canEdit,
}: {
  department: Department;
  style: ReturnType<typeof departmentColor>;
  active: number;
  missing: number;
  supervisorName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [required, setRequired] = useState(String(department.requiredHeadcount));
  const [start, setStart] = useState(department.usualStart ?? "");
  const [end, setEnd] = useState(department.usualEnd ?? "");
  const [check, setCheck] = useState(department.timecardCheck ?? "");
  const options = useMemo(() => timeOptions(), []);

  const liveMissing = Math.max(0, (Number(required) || 0) - active);

  function save(next: { required?: string; start?: string; end?: string; check?: string }) {
    const r = Number(next.required ?? required);
    const s = next.start ?? start;
    const e = next.end ?? end;
    const c = next.check ?? check;
    // Hours save only when both ends are chosen.
    if ((s === "") !== (e === "")) return;
    if (
      r === department.requiredHeadcount &&
      (s || null) === department.usualStart &&
      (e || null) === department.usualEnd &&
      (c.trim() || null) === department.timecardCheck
    ) {
      return;
    }
    startTransition(async () => {
      const result = await saveStaffing({
        departmentId: department.id,
        requiredHeadcount: Number.isFinite(r) ? Math.round(r) : 0,
        usualStart: s || null,
        usualEnd: e || null,
        timecardCheck: c.trim() || null,
      });
      if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
      router.refresh();
    });
  }

  return (
    <tr className={cn("group border-b border-border/50 last:border-b-0 hover:bg-muted/40", pending && "opacity-60")}>
      <td className="sticky left-0 z-10 bg-card py-1 pr-2 pl-0 group-hover:bg-muted/40">
        <span className="flex items-center gap-2">
          <span className={cn("block h-6 w-1.5 shrink-0", style.dot)} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-semibold">{department.name}</span>
            <span className="text-[0.5625rem] text-muted-foreground">
              {department.paychexCode}
              {department.line && ` · ${department.line}`}
            </span>
          </span>
        </span>
      </td>
      <td className="px-2 py-1">
        {canEdit ? (
          <input
            value={check}
            onChange={(event) => setCheck(event.target.value)}
            onBlur={() => save({ check })}
            placeholder="Who"
            aria-label={`Timecard check for ${department.name}`}
            className={INPUT}
          />
        ) : (
          <span className="text-muted-foreground">{department.timecardCheck ?? "—"}</span>
        )}
      </td>
      <td className="px-2 py-1">
        {supervisorName ?? <span className="text-warning-foreground" title="No approval chain set for this department. Set one in Configuration, Approval chain.">Nobody ?</span>}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">
        {canEdit ? (
          <input
            inputMode="numeric"
            value={required}
            onChange={(event) => setRequired(event.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => save({ required })}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
            aria-label={`People required in ${department.name}`}
            className={cn(INPUT, "w-14 text-right font-semibold")}
          />
        ) : (
          <span className="font-semibold">{department.requiredHeadcount}</span>
        )}
      </td>
      <td className="px-2 py-1 text-right font-semibold tabular-nums">{active}</td>
      <td className={cn("px-2 py-1 text-right font-bold tabular-nums", (canEdit ? liveMissing : missing) > 0 ? "bg-destructive/10 text-destructive" : "text-success")}>
        {canEdit ? liveMissing : missing}
      </td>
      <td className="px-2 py-1">
        {canEdit ? (
          <span className="flex items-center gap-1">
            <select value={start} onChange={(event) => { setStart(event.target.value); save({ start: event.target.value }); }} aria-label="Usually from" className={cn(INPUT, "w-24")}>
              <option value="">From…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-muted-foreground">–</span>
            <select value={end} onChange={(event) => { setEnd(event.target.value); save({ end: event.target.value }); }} aria-label="Usually to" className={cn(INPUT, "w-24")}>
              <option value="">To…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {pending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </span>
        ) : department.usualStart && department.usualEnd ? (
          <span className="tabular-nums">
            {displayTime(department.usualStart)} – {displayTime(department.usualEnd)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-1 py-1">
        <Timeline.Bar start={start || null} end={end || null} className={style.dot} />
      </td>
    </tr>
  );
}

/* ---------------- the hours bar ---------------- */

/** The day runs 4:00 AM to 3:30 AM in half hours, so a night shift does not split in two. */
const SLOTS = 48;
const ORIGIN_MINUTES = 4 * 60;

function slotOf(time: string): number {
  const minutes = timeToHours(time) * 60;
  return Math.round((((minutes - ORIGIN_MINUTES) % 1440) + 1440) % 1440 / 30);
}

const Timeline = {
  Header() {
    return (
      <span className="grid text-[0.5rem] font-semibold tracking-wider text-muted-foreground uppercase" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const minutes = (ORIGIN_MINUTES + i * 30) % 1440;
          const label = i % 4 === 0 ? displayTime(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`).replace(":00", "") : "";
          return (
            <span key={i} className="truncate border-l border-border/40 pl-0.5">
              {label}
            </span>
          );
        })}
      </span>
    );
  },
  Bar({ start, end, className }: { start: string | null; end: string | null; className: string }) {
    if (!start || !end) {
      return <span className="block h-5 rounded-sm bg-muted/60" />;
    }
    const a = slotOf(start);
    let b = slotOf(end);
    if (b <= a) b += SLOTS;
    const segments: [number, number][] = b > SLOTS ? [[a, SLOTS], [0, b - SLOTS]] : [[a, b]];
    return (
      <span className="relative block h-5 rounded-sm bg-muted/60">
        {segments.map(([from, to], i) => (
          <span
            key={i}
            className={cn("absolute inset-y-0 rounded-sm opacity-80", className)}
            style={{ left: `${(from / SLOTS) * 100}%`, width: `${((to - from) / SLOTS) * 100}%` }}
          />
        ))}
      </span>
    );
  },
};

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("border-b border-border px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase", right && "text-right", className)}>
      {children}
    </th>
  );
}

function Big({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("text-lg font-bold tabular-nums", warn && "text-destructive")}>{value}</span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </span>
  );
}

const INPUT = "h-7 w-full rounded-sm bg-card px-1.5 text-xs ring-1 ring-foreground/10 focus:ring-primary focus:outline-none";
