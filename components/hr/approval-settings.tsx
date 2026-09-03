"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { saveApprovalChain } from "@/lib/hr/actions";
import { displayName, type ApprovalStep, type Department, type Employee } from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { DataTable, TBody, TD, THead, TR, TableEmpty } from "@/components/ui/data-table";
import {
  EditorActions,
  Hint,
  IconButton,
  Notice,
  SettingsPage,
  inputClass,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Approval: who signs each department's week, and in what order.
 *
 * One person or several. With one, their signature approves the week. With
 * several, each signs in turn and the week is approved when the last one has.
 * An administrator may sign any step. A department with nobody set can only
 * be approved by an administrator.
 */
export function ApprovalSettings({
  departments,
  employees,
  steps,
  canEdit,
}: {
  departments: Department[];
  employees: Employee[];
  steps: ApprovalStep[];
  canEdit: boolean;
}) {
  const { run, pending, notice } = useConfigRunner();
  const [editing, setEditing] = useState<string | null>(null);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? displayName(e) : "?";
  };

  return (
    <SettingsPage intro="Who approves each department's week. One person, or a chain that signs in order. The week prints and sends only once the last step has signed. Administrators can sign any step.">
      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "", className: "w-6" },
            { label: "Department" },
            { label: "Approves, in order" },
            { label: "", className: "w-16" },
          ]}
        />
        <TBody>
          {departments.map((department) => {
            const chain = steps.filter((s) => s.departmentId === department.id).sort((a, b) => a.step - b.step);
            return (
              <TR key={department.id}>
                <TD>
                  <span aria-hidden className={cn("block h-4 w-1.5", departmentColor(department.color, department.colorIndex).dot)} />
                </TD>
                <TD strong>{department.name}</TD>
                <TD>
                  {chain.length === 0 ? (
                    <span className="text-xs text-warning-foreground">Nobody yet - administrators only</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1 text-xs">
                      {chain.map((s, i) => (
                        <span key={s.step} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground">→</span>}
                          <span className="rounded-sm bg-muted px-1.5 py-0.5">
                            <span className="mr-1 text-[0.5625rem] font-bold text-muted-foreground">{s.step}</span>
                            {nameOf(s.employeeId)}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </TD>
                <TD>
                  {canEdit && (
                    <span className="flex justify-end">
                      <IconButton label="Edit chain" onClick={() => setEditing(department.id)}>
                        Edit
                      </IconButton>
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
          {departments.length === 0 && <TableEmpty colSpan={4}>No departments yet.</TableEmpty>}
        </TBody>
      </DataTable>

      {editing && (
        <ChainEditor
          key={editing}
          department={departments.find((d) => d.id === editing)!}
          employees={employees}
          initial={steps.filter((s) => s.departmentId === editing).sort((a, b) => a.step - b.step).map((s) => s.employeeId)}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(employeeIds) =>
            run(async () => {
              const result = await saveApprovalChain({ departmentId: editing, employeeIds });
              if (result.ok) setEditing(null);
              return result;
            }, "Approval chain saved")
          }
        />
      )}
    </SettingsPage>
  );
}

function ChainEditor({
  department,
  employees,
  initial,
  pending,
  onCancel,
  onSave,
}: {
  department: Department;
  employees: Employee[];
  initial: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (employeeIds: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(initial.length > 0 ? initial : [""]);

  // Supervisors first, then this department's people, then everyone else.
  const candidates = useMemo(
    () =>
      employees
        .filter((e) => e.active && e.employeeType !== "contractor")
        .sort((a, b) => {
          const rank = (e: Employee) => (e.isSupervisor ? 0 : e.departmentId === department.id ? 1 : 2);
          return rank(a) - rank(b) || a.lastName.localeCompare(b.lastName);
        }),
    [employees, department.id]
  );

  const move = (index: number, delta: number) => {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIds(next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-sm bg-card p-3 ring-1 ring-primary/40">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {department.name}
        <Hint text="Step 1 signs first. The week is approved when the last step has signed. One step means one signature approves it." />
      </p>

      <div className="flex flex-col gap-1">
        {ids.map((id, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-12 text-[0.625rem] font-bold tracking-wider text-muted-foreground uppercase">
              Step {index + 1}
            </span>
            <select
              value={id}
              aria-label={`Step ${index + 1}`}
              onChange={(event) => setIds(ids.map((v, i) => (i === index ? event.target.value : v)))}
              className={cn(inputClass, "max-w-xs")}
            >
              <option value="">Choose a person…</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id} disabled={ids.includes(e.id) && e.id !== id}>
                  {displayName(e)}
                  {e.isSupervisor ? " (supervisor)" : ""}
                  {!e.email ? " - no login email" : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="inline-flex size-6 items-center justify-center text-muted-foreground disabled:opacity-30">
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === ids.length - 1} aria-label="Move down" className="inline-flex size-6 items-center justify-center text-muted-foreground disabled:opacity-30">
              <ArrowDown className="size-3.5" />
            </button>
            <button type="button" onClick={() => setIds(ids.filter((_, i) => i !== index))} aria-label="Remove step" className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-destructive">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIds([...ids, ""])}
          className="inline-flex h-7 w-fit items-center gap-1 rounded-sm px-1.5 text-xs text-primary hover:bg-primary/10"
        >
          <Plus className="size-3.5" />
          Add a step
        </button>
      </div>

      <EditorActions
        pending={pending}
        saveLabel="Save chain"
        onCancel={onCancel}
        onSave={() => onSave(ids.filter(Boolean))}
      />
    </div>
  );
}
