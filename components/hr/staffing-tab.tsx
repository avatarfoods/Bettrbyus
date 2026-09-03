"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import { saveStaffing } from "@/lib/hr/actions";
import {
  displayName,
  displayTime,
  isSchedulable,
  runsAllDay,
  timeOptions,
  timeToHours,
  type Department,
  type Employee,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The staffing sheet, as a tab - Carlos's spreadsheet, on one page.
 *
 * One row per department, grouped by line the way the codes group them: who
 * supervises it, how many it should have, how many Paychex says are active,
 * how many are missing in red. Down the right, the whole day from 4 AM round
 * to 4 AM as one bar per department in its colour, so the shape of the plant
 * is visible without scrolling sideways. Reading is for everyone. Changing
 * anything is behind Edit, and Edit is only there for administrators.
 */
export function StaffingTab({
  departments,
  allDepartments,
  employees,
  canEdit,
}: {
  departments: Department[];
  allDepartments: Department[];
  employees: Employee[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const look = (d: Department) => departmentColor(d.color, allDepartments.indexOf(d));
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  /** Who can be picked as a supervisor: everyone active, supervisors first. */
  const people = useMemo(
    () =>
      [...employees]
        .filter((e) => e.active)
        .sort((a, b) => Number(b.isSupervisor) - Number(a.isSupervisor) || displayName(a).localeCompare(displayName(b))),
    [employees]
  );

  const rows = departments.map((department) => {
    const active = employees.filter((e) => e.departmentId === department.id && isSchedulable(e)).length;
    const missing = Math.max(0, department.requiredHeadcount - active);
    const supervisor = department.supervisorId ? empById.get(department.supervisorId) : undefined;
    return { department, active, missing, supervisor };
  });

  /* Grouped by line, in the order departments come. */
  const groups: { line: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    const line = row.department.line ?? "Other";
    const group = groups.find((g) => g.line === line);
    if (group) group.rows.push(row);
    else groups.push({ line, rows: [row] });
  }

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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big label="required" value={String(totals.required)} hint="How many people the departments are supposed to have, added up." />
        <Big label="active in Paychex" value={String(totals.active)} hint="Active people on the schedule, from the last Paychex import. Contractors and anyone switched off are not counted." />
        <Big label="to hire" value={String(totals.missing)} warn={totals.missing > 0} />
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[0.6875rem] text-muted-foreground sm:flex">
            The bar is the hours each department usually runs
            <Hint text="Not the schedule - the shape of the day, 4 AM round to 4 AM, so Main Kitchen at 6:30 AM to 3:00 AM reads at a glance." />
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              title={editing ? "Done. Changes were saved as you made them." : "Change required people, usual hours and supervisors. Administrators only."}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-semibold transition-colors",
                editing ? "bg-success text-white" : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {editing ? <CheckCircle2 className="size-3.5" /> : <Pencil className="size-3.5" />}
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[58rem] table-fixed border-collapse text-[0.6875rem] leading-tight">
          <colgroup>
            <col style={{ width: "11.5rem" }} />
            <col style={{ width: editing ? "10rem" : "8rem" }} />
            <col style={{ width: "3.75rem" }} />
            <col style={{ width: "3.5rem" }} />
            <col style={{ width: "3.75rem" }} />
            <col style={{ width: editing ? "12rem" : "8.5rem" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="bg-surface-sunk">
              <Th className="sticky left-0 z-10 bg-surface-sunk">Department</Th>
              <Th>Supervisor</Th>
              <Th right>Required</Th>
              <Th right>Active</Th>
              <Th right>Missing</Th>
              <Th>Usual hours</Th>
              <Th className="px-1">
                <Timeline.Header />
              </Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const sum = group.rows.reduce(
                (s, r) => ({ required: s.required + r.department.requiredHeadcount, active: s.active + r.active, missing: s.missing + r.missing }),
                { required: 0, active: 0, missing: 0 }
              );
              return [
                <tr key={`line-${group.line}`} className="border-y border-border/60 bg-muted/40">
                  <td className="sticky left-0 z-10 bg-muted/40 px-3 py-0.5 text-[0.5625rem] font-bold tracking-wider text-muted-foreground uppercase">
                    {group.line}
                  </td>
                  <td className="px-2 py-0.5 text-[0.5625rem] text-muted-foreground">
                    {group.rows.length} department{group.rows.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[0.625rem] font-semibold text-muted-foreground tabular-nums">{sum.required}</td>
                  <td className="px-2 py-0.5 text-right text-[0.625rem] font-semibold text-muted-foreground tabular-nums">{sum.active}</td>
                  <td className={cn("px-2 py-0.5 text-right text-[0.625rem] font-semibold tabular-nums", sum.missing > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {sum.missing}
                  </td>
                  <td colSpan={2} />
                </tr>,
                ...group.rows.map(({ department, active, missing, supervisor }) => (
                  <StaffingRow
                    key={department.id}
                    department={department}
                    style={look(department)}
                    active={active}
                    missing={missing}
                    supervisor={supervisor ?? null}
                    people={people}
                    editing={canEdit && editing}
                  />
                )),
              ];
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-foreground/20 bg-surface-sunk font-semibold">
              <td colSpan={2} className="sticky left-0 z-10 bg-surface-sunk px-3 py-1 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">
                Total
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{totals.required}</td>
              <td className="px-2 py-1 text-right tabular-nums">{totals.active}</td>
              <td className={cn("px-2 py-1 text-right tabular-nums", totals.missing > 0 && "text-destructive")}>{totals.missing}</td>
              <td colSpan={2} className="px-1 py-1">
                <Timeline.Header ticksOnly />
              </td>
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
  supervisor,
  people,
  editing,
}: {
  department: Department;
  style: ReturnType<typeof departmentColor>;
  active: number;
  missing: number;
  supervisor: Employee | null;
  people: Employee[];
  editing: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [required, setRequired] = useState(String(department.requiredHeadcount));
  const [start, setStart] = useState(department.usualStart ?? "");
  const [end, setEnd] = useState(department.usualEnd ?? "");
  const [supervisorId, setSupervisorId] = useState(department.supervisorId ?? "");
  const options = useMemo(() => timeOptions(), []);

  const allDay = !!start && start === end;
  const liveMissing = Math.max(0, (Number(required) || 0) - active);

  function save(next: { required?: string; start?: string; end?: string; supervisorId?: string }) {
    const r = Number(next.required ?? required);
    const s = next.start ?? start;
    const e = next.end ?? end;
    const sup = next.supervisorId ?? supervisorId;
    // Hours save only when both ends are chosen.
    if ((s === "") !== (e === "")) return;
    if (
      r === department.requiredHeadcount &&
      (s || null) === department.usualStart &&
      (e || null) === department.usualEnd &&
      (sup || null) === department.supervisorId
    ) {
      return;
    }
    startTransition(async () => {
      const result = await saveStaffing({
        departmentId: department.id,
        requiredHeadcount: Number.isFinite(r) ? Math.round(r) : 0,
        usualStart: s || null,
        usualEnd: e || null,
        supervisorId: sup || null,
      });
      if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
      router.refresh();
    });
  }

  const shownMissing = editing ? liveMissing : missing;

  return (
    <tr className={cn("group border-b border-border/40 last:border-b-0 hover:bg-muted/30", pending && "opacity-60")}>
      <td className="sticky left-0 z-10 bg-card py-0.5 pr-2 pl-0 group-hover:bg-muted/30">
        <span className="flex items-center gap-2">
          <span className={cn("block h-5 w-1.5 shrink-0", style.dot)} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-semibold">{department.name}</span>
            <span className="text-[0.5625rem] text-muted-foreground">{department.paychexCode}</span>
          </span>
        </span>
      </td>
      <td className="px-2 py-0.5">
        {editing ? (
          <select
            value={supervisorId}
            onChange={(event) => {
              setSupervisorId(event.target.value);
              save({ supervisorId: event.target.value });
            }}
            aria-label={`Supervisor of ${department.name}`}
            className={INPUT}
          >
            <option value="">Nobody yet…</option>
            <optgroup label="Supervisors in Paychex">
              {people
                .filter((p) => p.isSupervisor)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Everyone else">
              {people
                .filter((p) => !p.isSupervisor)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
            </optgroup>
          </select>
        ) : supervisor ? (
          <span className="truncate">{displayName(supervisor)}</span>
        ) : (
          <span className="text-warning-foreground" title="No supervisor chosen. An administrator sets it with Edit.">
            Nobody yet
          </span>
        )}
      </td>
      <td className="px-2 py-0.5 text-right tabular-nums">
        {editing ? (
          <input
            inputMode="numeric"
            value={required}
            onChange={(event) => setRequired(event.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => save({ required })}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
            aria-label={`People required in ${department.name}`}
            className={cn(INPUT, "w-12 text-right font-semibold")}
          />
        ) : (
          <span className="text-xs font-semibold">{department.requiredHeadcount}</span>
        )}
      </td>
      <td className="px-2 py-0.5 text-right text-xs font-semibold tabular-nums">{active}</td>
      <td className="px-2 py-0.5 text-right">
        {shownMissing > 0 ? (
          <span className="inline-block min-w-6 rounded-sm bg-destructive/10 px-1 text-xs font-bold text-destructive tabular-nums">{shownMissing}</span>
        ) : (
          <span className="text-xs font-semibold text-success tabular-nums">0</span>
        )}
      </td>
      <td className="px-2 py-0.5">
        {editing ? (
          <span className="flex items-center gap-1">
            <select
              value={allDay ? "" : start}
              disabled={allDay}
              onChange={(event) => {
                setStart(event.target.value);
                save({ start: event.target.value });
              }}
              aria-label="Usually from"
              className={cn(INPUT, "w-[5.25rem] disabled:opacity-40")}
            >
              <option value="">From…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">–</span>
            <select
              value={allDay ? "" : end}
              disabled={allDay}
              onChange={(event) => {
                setEnd(event.target.value);
                save({ end: event.target.value });
              }}
              aria-label="Usually to"
              className={cn(INPUT, "w-[5.25rem] disabled:opacity-40")}
            >
              <option value="">To…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={allDay}
              title="Runs around the clock"
              onClick={() => {
                if (allDay) {
                  setStart("");
                  setEnd("");
                  save({ start: "", end: "" });
                } else {
                  setStart("00:00");
                  setEnd("00:00");
                  save({ start: "00:00", end: "00:00" });
                }
              }}
              className={cn(
                "h-6 shrink-0 rounded-sm px-1.5 text-[0.625rem] font-semibold ring-1 transition-colors",
                allDay ? "bg-foreground text-background ring-foreground" : "bg-card text-muted-foreground ring-foreground/15 hover:bg-muted"
              )}
            >
              24h
            </button>
            {pending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </span>
        ) : runsAllDay(department) ? (
          <span className="font-medium">Around the clock</span>
        ) : department.usualStart && department.usualEnd ? (
          <span className="tabular-nums">
            {displayTime(department.usualStart)} – {displayTime(department.usualEnd)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-1 py-0.5">
        <Timeline.Bar start={start || null} end={end || null} className={style.dot} />
      </td>
    </tr>
  );
}

/* ---------------- the hours bar ---------------- */

/** The day runs 4:00 AM round to 4:00 AM in half hours, so a night shift does not split in two. */
const SLOTS = 48;
const ORIGIN_MINUTES = 4 * 60;

function slotOf(time: string): number {
  const minutes = timeToHours(time) * 60;
  return Math.round(((((minutes - ORIGIN_MINUTES) % 1440) + 1440) % 1440) / 30);
}

/** "4a", "12p", "2a": the label an hour gets in the header. */
function shortHour(minutes: number): string {
  const h = Math.floor((minutes % 1440) / 60);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${h >= 12 ? "p" : "a"}`;
}

const Timeline = {
  Header({ ticksOnly }: { ticksOnly?: boolean }) {
    return (
      <span
        className="grid text-[0.5625rem] font-semibold text-muted-foreground tabular-nums"
        style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SLOTS }, (_, i) => {
          const minutes = (ORIGIN_MINUTES + i * 30) % 1440;
          const tick = i % 4 === 0;
          return (
            <span key={i} className={cn("h-3.5 truncate pl-0.5", tick ? "border-l border-foreground/25" : i % 2 === 0 ? "border-l border-border/40" : "")}>
              {tick && !ticksOnly ? shortHour(minutes) : ""}
            </span>
          );
        })}
      </span>
    );
  },
  Bar({ start, end, className }: { start: string | null; end: string | null; className: string }) {
    if (!start || !end) {
      return <Ruler>{null}</Ruler>;
    }
    const a = slotOf(start);
    let b = slotOf(end);
    if (b <= a) b += SLOTS;
    const segments: [number, number][] = b > SLOTS ? [[a, SLOTS], [0, b - SLOTS]] : [[a, b]];
    return (
      <Ruler>
        {segments.map(([from, to], i) => (
          <span
            key={i}
            className={cn("absolute inset-y-0.5 rounded-[2px]", className)}
            style={{ left: `${(from / SLOTS) * 100}%`, width: `${((to - from) / SLOTS) * 100}%` }}
          />
        ))}
      </Ruler>
    );
  },
};

/** The track a bar sits on, with the same ticks as the header so bars line up. */
function Ruler({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block h-5 rounded-sm bg-muted/50">
      <span className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}>
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} className={cn(i % 4 === 0 && i > 0 && "border-l border-foreground/10")} />
        ))}
      </span>
      {children}
    </span>
  );
}

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("border-b border-border px-2 py-1 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase", right && "text-right", className)}>
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

const INPUT = "h-6 w-full rounded-sm bg-card px-1.5 text-[0.6875rem] ring-1 ring-foreground/15 focus:ring-primary focus:outline-none";
