"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveEmployee } from "@/lib/hr/actions";
import { displayName, money, type Department, type Employee } from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ActiveDot, Hint, Labelled, inputClass } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * One person, on their own page.
 *
 * Left: what Paychex says, read-only, replaced on every import. Right: what
 * HR sets on top and keeps - the department when Paychex has it wrong, the
 * pay the cost is worked out from, who to email, and the on-schedule switch.
 */
export function PersonForm({
  employee,
  departments,
  canEdit,
}: {
  employee: Employee;
  departments: Department[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [payType, setPayType] = useState(employee.payType);
  const [payRate, setPayRate] = useState(employee.payRate === null ? "" : String(employee.payRate));
  const [email, setEmail] = useState(employee.email ?? "");
  const [personalEmail, setPersonalEmail] = useState(employee.personalEmail ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [isSupervisor, setIsSupervisor] = useState(employee.isSupervisor);
  const [showOnSchedule, setShow] = useState(employee.showOnSchedule);

  const department = departments.find((d) => d.id === (departmentId || employee.departmentId));
  const look = department ? departmentColor(department.color, departments.indexOf(department)) : null;
  const inactive = !employee.active || !showOnSchedule || employee.employeeType === "contractor";

  function save() {
    startTransition(async () => {
      const result = await saveEmployee({
        id: employee.id,
        departmentId: departmentId || null,
        payType,
        payRate: payRate.trim() === "" ? null : Number(payRate) || null,
        email: email.trim() || null,
        personalEmail: personalEmail.trim() || null,
        phone: phone.trim() || null,
        isSupervisor,
        showOnSchedule,
      });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      router.push("/hr/people");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      {/* Who this is, said once, big. */}
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm px-3 py-2", look?.tint ?? "bg-card ring-1 ring-foreground/10")}>
        <span className={cn("block h-6 w-1.5", look?.dot ?? "bg-muted-foreground/40")} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{displayName(employee)}</h2>
          <p className="text-xs text-muted-foreground">
            {department?.name ?? "No department"}
            {department?.line && ` · ${department.line}`}
            <span className="ml-2 font-mono text-[0.625rem]">{employee.paychexId}</span>
          </p>
        </div>
        <span className="ml-auto flex items-center gap-3">
          {employee.isSupervisor && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider text-muted-foreground uppercase">Supervisor</span>}
          <ActiveDot active={!inactive} />
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="From Paychex" hint="Replaced on every import. Change these in Paychex, not here.">
          <Row label="Legal name">{employee.firstName} {employee.lastName}</Row>
          <Row label="Goes by">{employee.preferredName ?? <Muted>same</Muted>}</Row>
          <Row label="Employee ID"><span className="font-mono">{employee.paychexId}</span></Row>
          <Row label="Hired">{employee.hiredOn ?? <Muted>unknown</Muted>}</Row>
          <Row label="Type">
            {employee.employeeType === "contractor" ? "Independent contractor" : "Employee"} · {employee.fullTime ? "Full time" : "Part time"}
          </Row>
          <Row label="In last import">
            <ActiveDot active={employee.active} />
          </Row>
          {employee.paychexSupervisorId && <Row label="Paychex supervisor"><span className="font-mono">{employee.paychexSupervisorId}</span></Row>}
        </Section>

        <Section title="Set here" hint="Kept across imports. This is what the schedule and the cost use.">
          <Labelled label="Department" hint="Which schedule this person appears on.">
            <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} disabled={!canEdit} className={inputClass}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.line ? `${d.line} › ` : ""}
                  {d.name}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="On the schedule" hint="Off takes the person off every schedule without touching Paychex. They read as inactive.">
            <span className="flex h-8 items-center gap-2">
              <Switch
                checked={showOnSchedule}
                disabled={!canEdit || employee.employeeType === "contractor"}
                onCheckedChange={setShow}
                aria-label="On the schedule"
              >
                <SwitchThumb />
              </Switch>
              <span className={cn("text-xs font-semibold", showOnSchedule ? "text-success" : "text-muted-foreground")}>
                {employee.employeeType === "contractor" ? "Contractors are never on the schedule" : showOnSchedule ? "On" : "Off"}
              </span>
            </span>
          </Labelled>
          <Labelled label="Pay type" hint="Salaried people are paid by the week. Hourly people are paid the hours scheduled, with overtime.">
            <select value={payType} onChange={(event) => setPayType(event.target.value as "hourly" | "salary")} disabled={!canEdit} className={inputClass}>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
          </Labelled>
          <Labelled
            label={payType === "salary" ? "Weekly salary" : "Hourly rate"}
            hint={payType === "salary" ? "Per week, before employer taxes. Paychex's annual figure divided by 52." : "Per hour, before employer taxes."}
          >
            <span className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={payRate}
                onChange={(event) => setPayRate(event.target.value)}
                disabled={!canEdit}
                placeholder={payType === "salary" ? "1200" : "15.50"}
                className={cn(inputClass, "w-32 tabular-nums")}
              />
              <span className="text-xs text-muted-foreground">
                {payRate && Number(payRate) > 0 ? (payType === "salary" ? `${money(Number(payRate) * 52)} a year` : `${money(Number(payRate) * 40)} for 40 h`) : ""}
              </span>
            </span>
          </Labelled>
          <Labelled label="Supervisor" hint="Marks the person as a supervisor. Who approves which department is set in Configuration, Approval chain.">
            <span className="flex h-8 items-center">
              <Switch checked={isSupervisor} disabled={!canEdit} onCheckedChange={setIsSupervisor} aria-label="Supervisor">
                <SwitchThumb />
              </Switch>
            </span>
          </Labelled>
          <Labelled label="Work email" hint="The one they log into Bettrbyus with. This is how the app knows which person is signed in.">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!canEdit} className={inputClass} />
          </Labelled>
          <Labelled label="Personal email" hint="Where the approved schedule is sent. Falls back to the work email.">
            <input type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} disabled={!canEdit} className={inputClass} />
          </Labelled>
          <Labelled label="Phone">
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={!canEdit} className={inputClass} />
          </Labelled>
        </Section>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/hr/people")}
          className="inline-flex h-8 items-center rounded-sm bg-card px-3 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
        >
          {canEdit ? "Cancel" : "Back to people"}
        </button>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm bg-card ring-1 ring-foreground/10">
      <h3 className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
        <Hint text={hint} />
      </h3>
      <div className="px-3 py-1">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-1.5 text-sm last:border-b-0">
      <span className="w-40 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
