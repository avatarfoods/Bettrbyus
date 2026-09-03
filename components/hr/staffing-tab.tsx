"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import { saveStaffing } from "@/lib/hr/actions";
import {
  displayName,
  displayTime,
  isSchedulable,
  runsAllDay,
  shortTime,
  timeOptions,
  timeToHours,
  type Department,
  type Employee,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * The staffing sheet, as a tab - Carlos's spreadsheet, on one page, quiet.
 *
 * One row per department, grouped by line: how many it should have in blue,
 * how many Paychex says are active in green, and the gap - red when people
 * are missing, blue with a minus when there are more than required, a quiet
 * green nought when it is exactly right. The supervisor is a "?" you tap, not
 * a column of names. Down the right, the whole day from 4 AM round to 4 AM as
 * one soft bar per department with its hours written on it. Reading is for
 * everyone. Changing anything is behind Edit, and Edit is only there for
 * administrators.
 */
export function StaffingTab({
  departments,
  employees,
  canEdit,
}: {
  departments: Department[];
  employees: Employee[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const look = (d: Department) => departmentColor(d.color, d.colorIndex);
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
    // Positive: people to hire. Negative: more than required.
    const gap = department.requiredHeadcount - active;
    const supervisor = department.supervisorId ? empById.get(department.supervisorId) : undefined;
    return { department, active, gap, supervisor };
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
      missing: sum.missing + Math.max(0, r.gap),
      extra: sum.extra + Math.max(0, -r.gap),
    }),
    { required: 0, active: 0, missing: 0, extra: 0 }
  );

  const columns = editing ? 7 : 6;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big label="required" value={String(totals.required)} tone="blue" />
        <Big label="active" value={String(totals.active)} tone="green" />
        <Big label="to hire" value={String(totals.missing)} tone={totals.missing > 0 ? "red" : "green"} />
        {totals.extra > 0 && <Big label="over" value={`-${totals.extra}`} tone="blue" />}
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[0.6875rem] text-muted-foreground sm:inline">
            Blue: what each department should have. Green: who is active in Paychex. Red: people to hire. A minus: more than required.
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
        <table className={cn("w-full table-fixed border-collapse text-[0.6875rem] leading-tight", editing ? "min-w-[58rem]" : "min-w-[46rem]")}>
          <colgroup>
            <col style={{ width: "11rem" }} />
            <col style={{ width: editing ? "10rem" : "2.25rem" }} />
            <col style={{ width: "4rem" }} />
            <col style={{ width: "3.5rem" }} />
            <col style={{ width: "4.25rem" }} />
            {editing && <col style={{ width: "12rem" }} />}
            <col />
          </colgroup>
          <thead>
            <tr className="bg-brand-muted">
              <Th className="sticky left-0 z-10 bg-brand-muted">Department</Th>
              <Th className={cn(!editing && "px-0 text-center")}>{editing ? "Supervisor" : "Sup"}</Th>
              <Th right>Required</Th>
              <Th right>Active</Th>
              <Th right>Missing</Th>
              {editing && <Th>Usual hours</Th>}
              <Th className="px-1">
                <Timeline.Header />
              </Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const sum = group.rows.reduce(
                (s, r) => ({
                  required: s.required + r.department.requiredHeadcount,
                  active: s.active + r.active,
                  missing: s.missing + Math.max(0, r.gap),
                  extra: s.extra + Math.max(0, -r.gap),
                }),
                { required: 0, active: 0, missing: 0, extra: 0 }
              );
              return [
                <tr key={`line-${group.line}`} className="border-y border-primary/15 bg-brand-muted/40">
                  <td className="sticky left-0 z-10 bg-brand-muted/40 px-3 py-0.5 text-[0.5625rem] font-bold tracking-wider text-primary uppercase">
                    {group.line}
                  </td>
                  <td className="px-1 py-0.5 text-center text-[0.5625rem] text-primary/70 tabular-nums">{group.rows.length}</td>
                  <td className="px-2 py-0.5 text-right text-[0.625rem] font-semibold text-primary tabular-nums">{sum.required}</td>
                  <td className="px-2 py-0.5 text-right text-[0.625rem] font-semibold text-success tabular-nums">{sum.active}</td>
                  <td className="px-2 py-0.5 text-right text-[0.625rem] font-bold tabular-nums">
                    <Gap missing={sum.missing} extra={sum.extra} small />
                  </td>
                  <td colSpan={editing ? 2 : 1} />
                </tr>,
                ...group.rows.map(({ department, active, gap, supervisor }) => (
                  <StaffingRow
                    key={department.id}
                    department={department}
                    style={look(department)}
                    active={active}
                    gap={gap}
                    supervisor={supervisor ?? null}
                    people={people}
                    editing={canEdit && editing}
                  />
                )),
              ];
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-success/40 bg-success/10 font-semibold">
              <td colSpan={2} className="sticky left-0 z-10 bg-success/10 px-3 py-1 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">
                Total
              </td>
              <td className="px-2 py-1 text-right text-primary tabular-nums">{totals.required}</td>
              <td className="px-2 py-1 text-right text-success tabular-nums">{totals.active}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                <Gap missing={totals.missing} extra={totals.extra} />
              </td>
              <td colSpan={editing ? 2 : 1} className="px-1 py-1">
                <Timeline.Header ticksOnly />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Missing in red, extra in blue with a minus, exactly right as a quiet green nought. */
function Gap({ missing, extra, small }: { missing: number; extra: number; small?: boolean }) {
  if (missing > 0) {
    return (
      <span className={cn("font-black text-destructive tabular-nums", small ? "text-[0.625rem]" : "text-sm")}>
        {missing}
        {extra > 0 && <span className="ml-1 text-[0.5625rem] font-semibold text-primary">-{extra}</span>}
      </span>
    );
  }
  if (extra > 0) return <span className={cn("font-bold text-primary tabular-nums", small ? "text-[0.625rem]" : "text-xs")}>-{extra}</span>;
  return <span className={cn("font-semibold text-success/70 tabular-nums", small ? "text-[0.625rem]" : "text-xs")}>0</span>;
}

function StaffingRow({
  department,
  style,
  active,
  gap,
  supervisor,
  people,
  editing,
}: {
  department: Department;
  style: ReturnType<typeof departmentColor>;
  active: number;
  /** Required minus active: positive to hire, negative over. */
  gap: number;
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
  const shownRequired = editing ? Number(required) || 0 : department.requiredHeadcount;
  const shownGap = editing ? shownRequired - active : gap;

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

  const hoursLabel = allDay ? "24 h" : start && end ? `${shortTime(start)} – ${shortTime(end)}` : "";

  return (
    <tr className={cn("group border-b border-border/40 last:border-b-0 hover:bg-brand-muted/30", pending && "opacity-60")}>
      <td className="sticky left-0 z-10 bg-card py-0.5 pr-2 pl-0 group-hover:bg-brand-muted/30">
        <span className="flex items-center gap-2">
          <span className={cn("block h-5 w-1.5 shrink-0", style.dot)} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-semibold">{department.name}</span>
            <span className="text-[0.5625rem] text-muted-foreground">{department.paychexCode}</span>
          </span>
        </span>
      </td>

      {/* Supervisor: a select while editing; otherwise a "?" that tells you who. */}
      <td className={cn("py-0.5", editing ? "px-2" : "px-0 text-center")}>
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
        ) : (
          <Mark
            tone={supervisor ? "blue" : "amber"}
            label={supervisor ? `Supervisor: ${displayName(supervisor)}` : `No supervisor chosen for ${department.name}. An administrator picks one with Edit.`}
          />
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
            className={cn(INPUT, "w-12 text-right font-semibold text-primary")}
          />
        ) : (
          <span className="text-xs font-semibold text-primary">{department.requiredHeadcount}</span>
        )}
      </td>
      <td className="px-2 py-0.5 text-right text-xs font-bold text-success tabular-nums">{active}</td>

      {/* The gap: red when short, blue with a minus when over, a quiet nought when right. */}
      <td className={cn("px-2 py-0.5 text-right", shownGap > 0 && "bg-destructive/10", shownGap < 0 && "bg-brand-muted/60")}>
        {shownGap > 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
            <span className="text-sm font-black text-destructive tabular-nums">{shownGap}</span>
            <Mark tone="red" label={`${department.name} has ${active} active and needs ${shownRequired}. ${shownGap} to hire.`} />
          </span>
        ) : shownGap < 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
            <span className="text-xs font-bold text-primary tabular-nums">{shownGap}</span>
            <Mark tone="blue" label={`${department.name} has ${active} active, ${-shownGap} more than the ${shownRequired} required.`} />
          </span>
        ) : (
          <span className="text-xs font-semibold text-success/70 tabular-nums">0</span>
        )}
      </td>

      {editing && (
        <td className="px-2 py-0.5">
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
                allDay ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-foreground/15 hover:bg-muted"
              )}
            >
              24h
            </button>
            {pending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </span>
        </td>
      )}

      <td className="px-1 py-0.5">
        <Timeline.Bar
          start={start || null}
          end={end || null}
          className={style.soft}
          label={hoursLabel}
          title={
            runsAllDay({ usualStart: start || null, usualEnd: end || null })
              ? `${department.name} runs around the clock`
              : start && end
                ? `${department.name} usually runs ${displayTime(start)} – ${displayTime(end)}`
                : `${department.name}: usual hours not set`
          }
        />
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
    // Twelve cells, one per two hours, so every label has room: 4a 6a 8a ... 12a 2a.
    const marks = SLOTS / 4;
    return (
      <span className="grid text-[0.5625rem] font-semibold text-primary/70 tabular-nums" style={{ gridTemplateColumns: `repeat(${marks}, minmax(0, 1fr))` }}>
        {Array.from({ length: marks }, (_, i) => {
          const minutes = (ORIGIN_MINUTES + i * 120) % 1440;
          return (
            <span key={i} className="h-3.5 overflow-visible border-l border-primary/25 pl-0.5 whitespace-nowrap">
              {ticksOnly ? "" : shortHour(minutes)}
            </span>
          );
        })}
      </span>
    );
  },
  Bar({ start, end, className, label, title }: { start: string | null; end: string | null; className: string; label: string; title: string }) {
    if (!start || !end) {
      return <Ruler title={title}>{null}</Ruler>;
    }
    const a = slotOf(start);
    let b = slotOf(end);
    if (b <= a) b += SLOTS;
    const segments: [number, number][] = b > SLOTS ? [[a, SLOTS], [0, b - SLOTS]] : [[a, b]];
    // The hours are written on the widest piece of the bar.
    const widest = segments.reduce((best, seg) => (seg[1] - seg[0] > best[1] - best[0] ? seg : best), segments[0]);
    return (
      <Ruler title={title}>
        {segments.map(([from, to], i) => (
          <span
            key={i}
            className={cn("absolute inset-y-0.5 flex items-center overflow-hidden rounded-[2px] px-1", className)}
            style={{ left: `${(from / SLOTS) * 100}%`, width: `${((to - from) / SLOTS) * 100}%` }}
          >
            {from === widest[0] && to === widest[1] && (
              <span className="truncate text-[0.5625rem] font-semibold text-foreground/80 tabular-nums">{label}</span>
            )}
          </span>
        ))}
      </Ruler>
    );
  },
};

/** The track a bar sits on, with the same ticks as the header so bars line up. */
function Ruler({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span title={title} className="relative block h-5 rounded-sm bg-brand-muted/30">
      <span className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}>
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} className={cn(i % 4 === 0 && i > 0 && "border-l border-primary/10")} />
        ))}
      </span>
      {children}
    </span>
  );
}

/**
 * A small "?" that explains itself when tapped as well as when hovered, since
 * half the plant reads this on an iPad. Blue for information, amber for
 * something not set, red for a gap.
 */
function Mark({ tone, label }: { tone: "blue" | "amber" | "red"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-sm text-[0.625rem] font-bold transition-colors",
          tone === "blue" && "bg-brand-muted text-primary hover:bg-primary hover:text-primary-foreground",
          tone === "amber" && "bg-warning-muted text-warning-foreground hover:bg-warning-foreground hover:text-white",
          tone === "red" && "bg-destructive/15 text-destructive hover:bg-destructive hover:text-white"
        )}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full left-1/2 z-30 mt-1 w-max max-w-56 -translate-x-1/2 rounded-sm bg-card px-2 py-1 text-left text-[0.6875rem] font-normal text-foreground shadow-lg ring-1 ring-foreground/15 whitespace-normal"
        >
          {label}
        </span>
      )}
    </span>
  );
}

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("border-b border-primary/15 px-2 py-1 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase", right && "text-right", className)}>
      {children}
    </th>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "red" }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("text-lg font-bold tabular-nums", tone === "blue" && "text-primary", tone === "green" && "text-success", tone === "red" && "text-destructive")}>
        {value}
      </span>
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
    </span>
  );
}

const INPUT = "h-6 w-full rounded-sm bg-card px-1.5 text-[0.6875rem] ring-1 ring-primary/25 focus:ring-primary focus:outline-none";
