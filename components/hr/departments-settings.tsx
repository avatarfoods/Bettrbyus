"use client";

import { useState } from "react";
import { saveDepartment } from "@/lib/hr/actions";
import type { Department, Employee } from "@/lib/hr/model";
import { DEPARTMENT_PALETTE, departmentColor } from "@/lib/hr/colors";
import { ColorGrid } from "@/components/hr/color-grid";
import { DataTable, TBody, TD, THead, TR, TableEmpty } from "@/components/ui/data-table";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import {
  ActiveDot,
  AddButton,
  EditorActions,
  Hint,
  IconButton,
  Labelled,
  Notice,
  SettingsPage,
  inputClass,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

const LINES = ["Bettr Bowl", "Pizza", "Warehouse", "Stewarding", "Quality", "Maintenance", "Office"];

/**
 * Departments: which line, what colour, how long the break, where it sits.
 *
 * Paychex creates them on import with their code and line; this is where they
 * are finished. Who approves each one is set separately in Approval.
 */
export function HrDepartmentsSettings({
  departments,
  employees,
  canEdit,
}: {
  departments: Department[];
  employees: Employee[];
  canEdit: boolean;
}) {
  const { run, pending, notice } = useConfigRunner();
  const [draft, setDraft] = useState<Partial<Department> | null>(null);

  const headcount = new Map<string, number>();
  for (const e of employees) {
    if (e.active && e.departmentId) headcount.set(e.departmentId, (headcount.get(e.departmentId) ?? 0) + 1);
  }

  return (
    <SettingsPage intro="Departments come in from Paychex with their code and line. Set each one's break, colour and order here. Who approves each department is in Approval; who sees it is in Groups.">
      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "", className: "w-6" },
            { label: "Department" },
            { label: "Code" },
            { label: "Line" },
            { label: "Break / day", numeric: true },
            { label: "People", numeric: true },
            { label: "Order", numeric: true },
            { label: "Active" },
            { label: "", className: "w-16" },
          ]}
        />
        <TBody>
          {departments.map((department) => (
            <TR key={department.id}>
              <TD>
                <span aria-hidden className={cn("block h-4 w-1.5", departmentColor(department.color, department.colorIndex).dot)} />
              </TD>
              <TD strong>{department.name}</TD>
              <TD mono muted>
                {department.paychexCode ?? ""}
              </TD>
              <TD>
                {department.line ? (
                  <span className="rounded-sm bg-brand-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
                    {department.line}
                  </span>
                ) : (
                  <span className="text-xs text-warning-foreground">no line</span>
                )}
              </TD>
              <TD numeric>{department.breakHours > 0 ? `${department.breakHours} h` : <span className="text-muted-foreground">none</span>}</TD>
              <TD numeric>{headcount.get(department.id) ?? 0}</TD>
              <TD numeric muted>
                {department.sortOrder}
              </TD>
              <TD>
                <ActiveDot active={department.active} />
              </TD>
              <TD>
                {canEdit && (
                  <span className="flex justify-end">
                    <IconButton label="Edit department" onClick={() => setDraft(department)}>
                      Edit
                    </IconButton>
                  </span>
                )}
              </TD>
            </TR>
          ))}
          {departments.length === 0 && (
            <TableEmpty colSpan={9}>
              No departments yet. Import the Paychex export and they come in with the people, or add one by hand.
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {canEdit &&
        (draft ? (
          <DepartmentEditor
            key={draft.id ?? "new"}
            draft={draft}
            pending={pending}
            onCancel={() => setDraft(null)}
            onSave={(value) =>
              // The editor closes only once the save is known to have worked.
              run(async () => {
                const result = await saveDepartment(value);
                if (result.ok) setDraft(null);
                return result;
              }, "Department saved")
            }
          />
        ) : (
          <AddButton onClick={() => setDraft({ name: "", sortOrder: departments.length + 1, active: true, color: null, breakHours: 0 })}>
            Add a department
          </AddButton>
        ))}
    </SettingsPage>
  );
}

function DepartmentEditor({
  draft,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<Department>;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: Parameters<typeof saveDepartment>[0]) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [line, setLine] = useState(draft.line ?? "");
  const [breakHours, setBreakHours] = useState(String(draft.breakHours ?? 0));
  const [sortOrder, setSortOrder] = useState(String(draft.sortOrder ?? 0));
  const [active, setActive] = useState(draft.active ?? true);
  const [color, setColor] = useState<string | null>(draft.color ?? null);

  const lineOptions = LINES.includes(line) || !line ? LINES : [...LINES, line];

  return (
    <div className="flex flex-col gap-2 rounded-sm bg-card p-3 ring-1 ring-primary/40">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Labelled label="Name" hint="As Paychex spells it, so the next import lands people in the same place.">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </Labelled>
        <Labelled label="Line" hint="Bettr Bowl, Pizza, Warehouse... The dashboard asks for the line first, then the department.">
          <select value={line} onChange={(event) => setLine(event.target.value)} className={inputClass}>
            <option value="">No line</option>
            {lineOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Break per day" hint="Unpaid hours taken off every shift in this department. 6:00 to 5:00 with a 1 hour break is 10 paid hours. People decide when to take it.">
          <span className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={breakHours}
              onChange={(event) => setBreakHours(event.target.value)}
              className={cn(inputClass, "w-24 tabular-nums")}
            />
            <span className="text-xs text-muted-foreground">hours</span>
          </span>
        </Labelled>
        <Labelled label="Order" hint="Where it sits in the department list and on the dashboard.">
          <input inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className={cn(inputClass, "w-24 tabular-nums")} />
        </Labelled>
        <Labelled label="Active" hint="Inactive departments drop off the schedule and dashboard but keep their history.">
          <span className="flex h-8 items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} aria-label="Active">
              <SwitchThumb />
            </Switch>
            <ActiveDot active={active} />
          </span>
        </Labelled>
      </div>

      <ColourRow hint="The band people scan for before they read the name. Automatic hands out the palette in order.">
        <ColorGrid value={color} onChange={setColor} allowAutomatic index={draft.colorIndex ?? 0} columns={DEPARTMENT_PALETTE} />
      </ColourRow>

      <EditorActions
        pending={pending}
        disabled={!name.trim()}
        saveLabel="Save department"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: draft.id,
            name: name.trim(),
            line: line || null,
            color,
            breakHours: Number(breakHours) || 0,
            sortOrder: Number(sortOrder) || 0,
            active,
          })
        }
      />
    </div>
  );
}

/** Like Labelled, but not a label: a label would click the first swatch for you. */
function ColourRow({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 py-1 last:border-b-0">
      <span className="flex w-40 shrink-0 items-center gap-1 pt-1.5 text-xs text-muted-foreground">
        <span className="min-w-0">Colour</span>
        <Hint text={hint} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
