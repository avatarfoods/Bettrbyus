"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MailX, Pencil, Search } from "lucide-react";
import { setShowOnSchedule } from "@/lib/hr/actions";
import { displayName, money, sendTo, type Department, type Employee } from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ActiveDot, Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Everyone, dense, with the columns that matter frozen.
 *
 * The same control bar as the dashboard - line, then department, then the
 * narrowing - so the plant learns one filter. ID, person and department stay
 * put while the rest scrolls. The on-schedule switch is right there, one
 * flick; everything else about a person is on their own page.
 */
export function PeopleList({
  employees,
  departments,
  canEdit,
  seesCost,
}: {
  employees: Employee[];
  departments: Department[];
  canEdit: boolean;
  /** Pay rates are money: administrators only. */
  seesCost: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [line, setLine] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [pay, setPay] = useState<"all" | "hourly" | "salary">("all");
  const [more, setMore] = useState<"any" | "supervisors" | "no-email" | "no-rate" | "off" | "contractors">("any");
  const [switching, startSwitch] = useTransition();

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const lines = useMemo(() => [...new Set(departments.map((d) => d.line).filter(Boolean) as string[])].sort(), [departments]);
  const deptChoices = useMemo(() => departments.filter((d) => !line || d.line === line), [departments, line]);

  /** Off the schedule for any reason reads as inactive. */
  const isInactive = (e: Employee) => !e.active || !e.showOnSchedule || e.employeeType === "contractor";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // "Switched off" and "Contractors" are inactive by definition, so they win over the status filter.
    const statusMatters = more !== "off" && more !== "contractors";
    return employees.filter((e) => {
      if (statusMatters && status === "active" && isInactive(e)) return false;
      if (statusMatters && status === "inactive" && !isInactive(e)) return false;
      if (pay !== "all" && e.payType !== pay) return false;
      if (more === "supervisors" && !e.isSupervisor) return false;
      if (more === "no-email" && sendTo(e)) return false;
      if (more === "no-rate" && e.payRate !== null) return false;
      if (more === "off" && e.showOnSchedule) return false;
      if (more === "contractors" && e.employeeType !== "contractor") return false;
      const d = e.departmentId ? deptById.get(e.departmentId) : undefined;
      if (line && d?.line !== line) return false;
      if (dept && e.departmentId !== dept) return false;
      if (q) {
        const hay = `${displayName(e)} ${e.firstName} ${e.paychexId} ${e.email ?? ""} ${e.personalEmail ?? ""} ${d?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, status, pay, more, line, dept, query, deptById]);

  return (
    <div className="flex flex-col gap-2 px-3 py-2 sm:px-4">
      {/* One bar, centred: find, then narrow - line, department, status, pay. */}
      <div className="flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-sm bg-card px-2 py-1.5 ring-1 ring-foreground/10">
          <label className="flex h-7 items-center gap-1.5 rounded-sm bg-surface-sunk px-2 text-xs">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, id, email…"
              aria-label="Search people"
              className="w-40 bg-transparent text-xs focus:outline-none"
            />
          </label>

          <Divider />

          <select
            value={line}
            onChange={(event) => {
              setLine(event.target.value);
              setDept("");
            }}
            aria-label="Line"
            className={cn(SELECT, line && "font-semibold text-foreground")}
          >
            <option value="">All lines</option>
            {lines.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
          <span className="flex items-center gap-1.5">
            {dept && (() => {
              const d = deptById.get(dept);
              return d ? <span className={cn("block h-3.5 w-1 shrink-0", departmentColor(d.color, d.colorIndex).dot)} /> : null;
            })()}
            <select value={dept} onChange={(event) => setDept(event.target.value)} aria-label="Department" className={cn(SELECT, dept && "font-semibold text-foreground")}>
              <option value="">All departments</option>
              {deptChoices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </span>

          <Divider />

          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Status" className={cn(SELECT, status !== "active" && "font-semibold text-foreground")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">Everyone</option>
          </select>
          <select value={pay} onChange={(event) => setPay(event.target.value as typeof pay)} aria-label="Pay" className={cn(SELECT, pay !== "all" && "font-semibold text-foreground")}>
            <option value="all">Hourly and salary</option>
            <option value="hourly">Hourly</option>
            <option value="salary">Salaried</option>
          </select>
          <select value={more} onChange={(event) => setMore(event.target.value as typeof more)} aria-label="More" className={cn(SELECT, more !== "any" && "font-semibold text-foreground")}>
            <option value="any">Anyone</option>
            <option value="supervisors">Supervisors</option>
            <option value="no-email">No email</option>
            {seesCost && <option value="no-rate">No pay rate</option>}
            <option value="off">Switched off</option>
            <option value="contractors">Contractors</option>
          </select>

          <span className="text-[0.625rem] text-muted-foreground tabular-nums">{shown.length}</span>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[64rem] border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-brand-muted">
              {/* ID and person stay put everywhere; department joins them from tablet width up. */}
              <Th className="sticky left-0 z-30 w-16 bg-brand-muted">ID</Th>
              <Th className="sticky left-16 z-30 w-48 bg-brand-muted">Person</Th>
              <Th className="w-44 border-r border-border bg-brand-muted md:sticky md:left-64 md:z-30">Department</Th>
              <Th>Pay</Th>
              {seesCost && <Th right>Rate</Th>}
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>
                <span className="flex items-center gap-1">
                  On schedule
                  <Hint text="Off takes the person off every schedule without touching Paychex. They read as inactive. Contractors are off automatically." />
                </span>
              </Th>
              <Th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const d = e.departmentId ? deptById.get(e.departmentId) : undefined;
              const look = d ? departmentColor(d.color, d.colorIndex) : null;
              const onSchedule = e.showOnSchedule && e.employeeType !== "contractor";
              const inactive = isInactive(e);
              return (
                <tr key={e.id} className={cn("group border-b border-border/50 last:border-b-0 hover:bg-muted/40", inactive && "text-muted-foreground")}>
                  <Td className="sticky left-0 z-10 bg-card font-mono text-[0.625rem] text-muted-foreground group-hover:bg-muted/40">{e.paychexId}</Td>
                  <Td className="sticky left-16 z-10 bg-card group-hover:bg-muted/40">
                    <Link href={`/hr/people/${e.id}`} className="flex items-center gap-1.5 hover:text-primary hover:underline">
                      <span className={cn("min-w-0 truncate font-medium", inactive && "line-through decoration-muted-foreground/40")}>{displayName(e)}</span>
                      {e.isSupervisor && <span className="shrink-0 text-[0.5625rem] font-semibold text-muted-foreground">SUP</span>}
                      {e.employeeType === "contractor" && <span className="shrink-0 text-[0.5625rem] font-semibold text-muted-foreground">1099</span>}
                      {!e.fullTime && <span className="shrink-0 text-[0.5625rem] font-semibold text-muted-foreground">PT</span>}
                    </Link>
                  </Td>
                  <Td className="border-r border-border bg-card group-hover:bg-muted/40 md:sticky md:left-64 md:z-10">
                    {d ? (
                      <span className="flex items-center gap-1.5">
                        <span className={cn("block h-3.5 w-1 shrink-0", look?.dot)} />
                        <span className="truncate">{d.name}</span>
                      </span>
                    ) : (
                      <span className="text-warning-foreground">No department</span>
                    )}
                  </Td>
                  <Td>
                    <span className={cn("rounded-sm px-1 py-0.5 text-[0.5625rem] font-semibold", e.payType === "salary" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                      {e.payType === "salary" ? "Salary" : "Hourly"}
                    </span>
                  </Td>
                  {seesCost && (
                    <Td right>
                      {e.payRate === null ? (
                        <span className="text-warning-foreground" title="No rate from Paychex. Counted as costing nothing.">— ?</span>
                      ) : e.payType === "salary" ? (
                        `${money(e.payRate)}/wk`
                      ) : (
                        `$${e.payRate.toFixed(2)}/h`
                      )}
                    </Td>
                  )}
                  <Td>
                    {sendTo(e) ? (
                      <span className="block max-w-48 truncate">{sendTo(e)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-warning-foreground" title="No email on file. The schedule cannot be emailed to this person - print it.">
                        <MailX className="size-3" /> none ?
                      </span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{e.phone ?? ""}</Td>
                  <Td>
                    <ActiveDot active={!inactive} />
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <Switch
                        checked={onSchedule}
                        disabled={!canEdit || switching || e.employeeType === "contractor"}
                        aria-label={`${displayName(e)} on the schedule`}
                        onCheckedChange={(show) =>
                          startSwitch(async () => {
                            const result = await setShowOnSchedule({ id: e.id, show });
                            if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
                            router.refresh();
                          })
                        }
                        className="h-5 w-9"
                      >
                        <SwitchThumb className="size-4" />
                      </Switch>
                      <span className={cn("text-[0.625rem] font-semibold", onSchedule ? "text-success" : "text-muted-foreground")}>{onSchedule ? "On" : "Off"}</span>
                    </span>
                  </Td>
                  <Td>
                    <Link
                      href={`/hr/people/${e.id}`}
                      className="inline-flex h-6 items-center gap-1 rounded border border-border bg-card px-1.5 text-[0.6875rem] text-foreground transition-colors hover:bg-muted"
                    >
                      <Pencil className="size-3" />
                      {canEdit ? "Edit" : "Open"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={seesCost ? 10 : 9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {employees.length === 0 ? "Nobody yet. Import the Paychex export to bring everyone in." : "Nobody matches."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn("border-b border-primary/15 px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase", right && "text-right", className)}>
      {children}
    </th>
  );
}

function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-2 py-1 align-middle", right && "text-right tabular-nums", className)}>{children}</td>;
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

const SELECT = "h-7 max-w-44 rounded-sm border-none bg-transparent px-1 text-xs text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none";
