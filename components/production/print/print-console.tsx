"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, FileText, Printer, ScrollText } from "lucide-react";
import type { ScheduleSummary } from "@/lib/production/schedule/fetch";

/**
 * The print console.
 *
 * Carlos described this exactly: pick the day, then press button by button.
 * Each button opens the sheet it names, already filtered to that day and
 * department, with the browser's print dialog one keystroke away.
 */
export function PrintConsole({
  schedules,
  scheduleId,
  departments,
  defaultDate,
}: {
  schedules: ScheduleSummary[];
  scheduleId: string | null;
  departments: string[];
  /** Passed in from the server so the two never disagree about "today". */
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [schedule, setSchedule] = useState(scheduleId ?? "");

  const query = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ date, ...extra });
    if (schedule) params.set("id", schedule);
    return params.toString();
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md bg-card p-3 ring-1 ring-foreground/10">
        <label className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Production date
          </span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
          />
        </label>

        {schedules.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Schedule
            </span>
            <select
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              {schedules.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.status})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <section>
        <h2 className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          For the supervisors
        </h2>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <PrintCard
            href={`/production/print/report?${query()}`}
            icon={FileText}
            title="Production report"
            description="The day on one page — every department, what to make and what it is for. This is the sheet that goes on top."
          />
          <PrintCard
            href={`/production/print/need?${query()}`}
            icon={ClipboardList}
            title="Production need"
            description="What each department is required to make, with the gap against what is scheduled."
          />
          <PrintCard
            href={`/production/print/release?${query()}`}
            icon={ScrollText}
            title="Product release"
            description="Finished products only, with lot, expiration and sign-off lines."
          />
        </div>
      </section>

      <section>
        <h2 className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Batch sheets — one page per recipe
        </h2>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <PrintCard
            href={`/production/print/batch?${query()}`}
            icon={Printer}
            title="Every department"
            description="All batch sheets for the day, in department order."
          />
          {departments.map((department) => (
            <PrintCard
              key={department}
              href={`/production/print/batch?${query({ dept: department })}`}
              icon={Printer}
              title={department}
              description="Batch sheets for this department only."
            />
          ))}
        </div>
        {departments.length === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is scheduled on {date}. Pick another day, or add quantities
            on the schedule first.
          </p>
        )}
      </section>
    </div>
  );
}

function PrintCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Printer;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-md bg-card p-3 ring-1 ring-foreground/10 transition-colors hover:bg-brand-muted"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}
