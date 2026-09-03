"use client";

import { useState } from "react";
import { savePaySettings } from "@/lib/hr/actions";
import { burdenPct, money, weekCost, type PaySettings, type SalaryRule } from "@/lib/hr/model";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { Hint, Notice, SettingsPage, primaryButton, useConfigRunner } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The rules the cost is worked out by.
 *
 * Three short sections down the left - overtime, salaried people, employer
 * taxes - each a handful of label-left rows in the Odoo style, and on the
 * right a worked example that recomputes as the numbers change so a wrong
 * percentage is caught before it is saved. One Save for the lot.
 */
export function PaySettingsForm({ settings, canEdit }: { settings: PaySettings; canEdit: boolean }) {
  const { run, pending, notice } = useConfigRunner();
  const [form, setForm] = useState(() => toForm(settings));
  const parsed = fromForm(form);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(settings);

  const hourly = weekCost(
    { id: "h", payType: "hourly", payRate: 15 },
    ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map((d) => ({
      workDate: d,
      startTime: "06:00",
      endTime: "16:00",
      breakMinutes: 0,
    })),
    parsed,
    1
  );
  const salaried = weekCost(
    { id: "s", payType: "salary", payRate: 1200 },
    [
      { workDate: "2026-01-05", startTime: "08:00", endTime: "16:00", breakMinutes: 0 },
      { workDate: "2026-01-06", startTime: "08:00", endTime: "16:00", breakMinutes: 0 },
    ],
    parsed,
    0
  );

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <SettingsPage intro="The rules every cost on the dashboard and the schedule is worked out by: when overtime starts, how salaried people are counted, and what the company pays on top of wages. The worked example on the right recomputes as you type.">
      <Notice notice={notice} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <Section
            title="Overtime"
            hint={`When an hour is paid at the higher rate. Weekly applies to every hourly person. Daily is Nevada's over-8-in-a-day rule for lower earners${form.dailyOvertimeEnabled ? "; it is on." : "; it is off because everyone signed a 4 x 10 agreement."}`}
          >
            <Row label="Weekly, after">
              <Num value={form.weeklyOvertimeAfter} onChange={set("weeklyOvertimeAfter")} unit="hours" disabled={!canEdit} />
            </Row>
            <Row label="Rate">
              <Num value={form.overtimeMultiplier} onChange={set("overtimeMultiplier")} unit="x the hourly rate" disabled={!canEdit} />
            </Row>
            <Row label="Daily rule" hint="Nevada: over 8 hours in a day is overtime for anyone earning under 1.5 x minimum wage. Leave off under a 4 x 10 agreement.">
              <span className="flex h-8 items-center gap-2 text-sm">
                <Switch
                  checked={form.dailyOvertimeEnabled}
                  disabled={!canEdit}
                  onCheckedChange={(on) => setForm((prev) => ({ ...prev, dailyOvertimeEnabled: on }))}
                  aria-label="Daily overtime rule"
                >
                  <SwitchThumb />
                </Switch>
                <span className={form.dailyOvertimeEnabled ? "font-medium" : "text-muted-foreground"}>{form.dailyOvertimeEnabled ? "On" : "Off"}</span>
              </span>
            </Row>
            {form.dailyOvertimeEnabled && (
              <>
                <Row label="Daily, after">
                  <Num value={form.dailyOvertimeAfter} onChange={set("dailyOvertimeAfter")} unit="hours in a day" disabled={!canEdit} />
                </Row>
                <Row label="Applies under" hint="Hourly rate below which the daily rule applies. 1.5 x Nevada minimum wage of $12 is $18.">
                  <Num value={form.dailyOvertimeRateCeiling} onChange={set("dailyOvertimeRateCeiling")} unit="$ per hour" disabled={!canEdit} />
                </Row>
              </>
            )}
          </Section>

          <Section
            title="Salaried people"
            hint="Salaried people have no overtime. The question is how much of the week they cost when they are only scheduled part of it."
          >
            <Row label="Paid" hint="Whole week: the full weekly rate the moment any day is scheduled - what exempt means. Per day: the weekly rate split across the days below, times the days scheduled.">
              <select
                value={form.salaryRule}
                onChange={set("salaryRule")}
                disabled={!canEdit}
                className={SELECT}
              >
                <option value="week_if_any">The whole week if any day is worked</option>
                <option value="per_day">Per day worked</option>
              </select>
            </Row>
            {form.salaryRule === "per_day" && (
              <Row label="Days in a week" hint="A weekly salary divided by this is one day's pay.">
                <Num value={form.salaryDaysPerWeek} onChange={set("salaryDaysPerWeek")} unit="days" disabled={!canEdit} />
              </Row>
            )}
            <Row label="Weekly rate" hint="Comes from Paychex: the annual salary divided by 52. Change a person's rate in People.">
              <span className="text-xs text-muted-foreground">From Paychex, annual ÷ 52</span>
            </Row>
          </Section>

          <Section
            title="Employer taxes"
            hint="Percent of wages the company pays on top, added together and applied to every dollar of wages, hourly or salary. No workers' comp for now."
          >
            <Row label="FICA" hint="Social Security 6.2% plus Medicare 1.45%. The employer's half.">
              <Num value={form.ficaPct} onChange={set("ficaPct")} unit="%" disabled={!canEdit} />
            </Row>
            <Row label="FUTA" hint="Federal unemployment. 0.6% after the state credit, applied flat here.">
              <Num value={form.futaPct} onChange={set("futaPct")} unit="%" disabled={!canEdit} />
            </Row>
            <Row label="Nevada MBT" hint="Modified business tax, as a percent of wages. Your rate is on the Paychex tax notice.">
              <Num value={form.statePct} onChange={set("statePct")} unit="%" disabled={!canEdit} />
            </Row>
            <Row label="Together">
              <span className="text-sm font-bold tabular-nums">{(burdenPct(parsed) * 100).toFixed(2)}%</span>
              <span className="ml-1.5 text-xs text-muted-foreground">on top of wages</span>
            </Row>
          </Section>
        </div>

        {/* The rules applied to two people, recomputed as you type. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-sm bg-card ring-1 ring-foreground/10">
            <p className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Worked example
              <Hint text="Recomputed from the numbers on the left as you type, so a wrong rate shows up here before it is saved." />
            </p>
            <Example
              title="Hourly at $15"
              subtitle="Five days, 6:00 to 4:00, 1 hour break"
              rows={[
                ["Paid hours", `${hourly.hours.toFixed(0)} h`],
                ["Regular", `${hourly.regularHours.toFixed(0)} h`],
                ["Overtime", `${hourly.overtimeHours.toFixed(0)} h`],
                ["Wages", money(hourly.wages)],
                ["Employer taxes", money(hourly.burden)],
              ]}
              total={money(hourly.total)}
            />
            <Example
              title="Salaried at $1,200 a week"
              subtitle="Scheduled two days"
              rows={[
                ["Owed", parsed.salaryRule === "per_day" ? `2 of ${parsed.salaryDaysPerWeek} days` : "The whole week"],
                ["Wages", money(salaried.wages)],
                ["Employer taxes", money(salaried.burden)],
              ]}
              total={money(salaried.total)}
            />
          </div>

          {canEdit && (
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={() => run(() => savePaySettings(parsed), "Pay rules saved")}
              className={cn(primaryButton, "justify-center rounded-sm")}
            >
              {dirty ? "Save pay rules" : "Saved"}
            </button>
          )}
          {!canEdit && (
            <p className="text-center text-xs text-muted-foreground">Read only. Administrators change these.</p>
          )}
        </aside>
      </div>
    </SettingsPage>
  );
}

/* ---------------- pieces ---------------- */

const SELECT =
  "h-8 w-full max-w-xs rounded-sm bg-card px-2 text-sm ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring disabled:opacity-60";

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm bg-card ring-1 ring-foreground/10">
      <h2 className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
        <Hint text={hint} />
      </h2>
      <div className="px-3 py-1">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="flex w-40 shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
    </div>
  );
}

function Num({
  value,
  onChange,
  unit,
  disabled,
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  unit: string;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="decimal"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-8 w-20 rounded-sm bg-card px-2 text-right text-sm tabular-nums ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring disabled:opacity-60"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </span>
  );
}

function Example({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string;
  subtitle: string;
  rows: [string, string][];
  total: string;
}) {
  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mb-1 text-[0.6875rem] text-muted-foreground">{subtitle}</p>
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between gap-4 py-0.5 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{value}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between gap-4 border-t border-border pt-1 text-xs font-bold">
        <span>Costs the company</span>
        <span className="tabular-nums">{total}</span>
      </p>
    </div>
  );
}

/* ---------------- form state ---------------- */

type FormState = {
  weeklyOvertimeAfter: string;
  dailyOvertimeAfter: string;
  dailyOvertimeEnabled: boolean;
  dailyOvertimeRateCeiling: string;
  overtimeMultiplier: string;
  salaryRule: SalaryRule;
  salaryDaysPerWeek: string;
  ficaPct: string;
  futaPct: string;
  statePct: string;
};

function toForm(s: PaySettings): FormState {
  return {
    weeklyOvertimeAfter: String(s.weeklyOvertimeAfter),
    dailyOvertimeAfter: String(s.dailyOvertimeAfter),
    dailyOvertimeEnabled: s.dailyOvertimeEnabled,
    dailyOvertimeRateCeiling: String(s.dailyOvertimeRateCeiling),
    overtimeMultiplier: String(s.overtimeMultiplier),
    salaryRule: s.salaryRule,
    salaryDaysPerWeek: String(s.salaryDaysPerWeek),
    ficaPct: String(s.ficaPct),
    futaPct: String(s.futaPct),
    statePct: String(s.statePct),
  };
}

function fromForm(f: FormState): PaySettings {
  const n = (v: string, fallback: number) => {
    const number = Number(v);
    return Number.isFinite(number) && v.trim() !== "" ? number : fallback;
  };
  return {
    weeklyOvertimeAfter: n(f.weeklyOvertimeAfter, 40),
    dailyOvertimeAfter: n(f.dailyOvertimeAfter, 8),
    dailyOvertimeEnabled: f.dailyOvertimeEnabled,
    dailyOvertimeRateCeiling: n(f.dailyOvertimeRateCeiling, 18),
    overtimeMultiplier: n(f.overtimeMultiplier, 1.5),
    salaryRule: f.salaryRule === "per_day" ? "per_day" : "week_if_any",
    salaryDaysPerWeek: Math.max(1, n(f.salaryDaysPerWeek, 5)),
    ficaPct: n(f.ficaPct, 0),
    futaPct: n(f.futaPct, 0),
    statePct: n(f.statePct, 0),
    workersCompPct: 0,
  };
}
