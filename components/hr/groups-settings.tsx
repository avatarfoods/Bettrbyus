"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteGroup, saveGroup } from "@/lib/hr/actions";
import { displayName, isSchedulable, type Department, type Employee, type Group } from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, TBody, TD, THead, TR, TableEmpty } from "@/components/ui/data-table";
import {
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

/**
 * Groups: who sees what.
 *
 * A group is a name, the people in it, and a rule: every department, or the
 * ones ticked. Members always see their own department too. A second switch
 * decides whether the group sees money. Administrators see everything without
 * being in a group. Who may APPROVE is a different question, answered in
 * Approval.
 */
export function GroupsSettings({
  groups,
  departments,
  employees,
  canEdit,
}: {
  groups: Group[];
  departments: Department[];
  employees: Employee[];
  canEdit: boolean;
}) {
  const { run, pending, notice } = useConfigRunner();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Partial<Group> | null>(null);
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "?";

  return (
    <SettingsPage intro="Groups decide what people can see. A manager group sees every department; a supervisor group sees its members' own department plus the shared ones you tick, such as Stewarding and Quality Control. Money is never shown to a group - only HR administrators see cost.">
      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "Group" },
            { label: "Sees" },
            { label: "Members", numeric: true },
            { label: "", className: "w-24" },
          ]}
        />
        <TBody>
          {groups.map((group) => (
            <TR key={group.id}>
              <TD strong>{group.name}</TD>
              <TD>
                {group.seesAllDepartments ? (
                  <span className="rounded-sm bg-brand-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
                    Every department
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Own department
                    {group.departmentIds.length > 0 && ` + ${group.departmentIds.map(deptName).join(", ")}`}
                  </span>
                )}
              </TD>
              <TD numeric>{group.memberIds.length}</TD>
              <TD>
                {canEdit && (
                  <span className="flex justify-end gap-1">
                    <IconButton label="Edit group" onClick={() => setDraft(group)}>
                      Edit
                    </IconButton>
                    <IconButton
                      label="Delete group"
                      danger
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete the ${group.name} group?`,
                          description: "Its members keep seeing their own department and nothing more.",
                          confirmLabel: "Delete",
                          cancelLabel: "Cancel",
                          tone: "danger",
                        });
                        if (ok) run(() => deleteGroup({ id: group.id }), `${group.name} deleted`);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </span>
                )}
              </TD>
            </TR>
          ))}
          {groups.length === 0 && (
            <TableEmpty colSpan={4}>
              No groups yet. Until there are, only administrators can see the schedules. Start with Manager and Supervisor.
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {canEdit &&
        (draft ? (
          <GroupEditor
            draft={draft}
            departments={departments}
            employees={employees}
            pending={pending}
            onCancel={() => setDraft(null)}
            onSave={(value) => {
              run(() => saveGroup(value), "Group saved");
              setDraft(null);
            }}
          />
        ) : (
          <AddButton onClick={() => setDraft({ name: "", seesAllDepartments: false, seesCost: false, sortOrder: groups.length + 1, departmentIds: [], memberIds: [] })}>
            Add a group
          </AddButton>
        ))}
    </SettingsPage>
  );
}

function GroupEditor({
  draft,
  departments,
  employees,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<Group>;
  departments: Department[];
  employees: Employee[];
  pending: boolean;
  onCancel: () => void;
  onSave: (value: Parameters<typeof saveGroup>[0]) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [seesAll, setSeesAll] = useState(draft.seesAllDepartments ?? false);
  const [departmentIds, setDepartmentIds] = useState<string[]>(draft.departmentIds ?? []);
  const [memberIds, setMemberIds] = useState<string[]>(draft.memberIds ?? []);
  const [search, setSearch] = useState("");

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => e.active && e.employeeType !== "contractor")
      .filter((e) => !q || displayName(e).toLowerCase().includes(q) || (e.email ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(b.isSupervisor) - Number(a.isSupervisor) || a.lastName.localeCompare(b.lastName));
  }, [employees, search]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="flex flex-col gap-2 rounded-sm bg-card p-3 ring-1 ring-primary/40">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Labelled label="Name" hint="Manager, Supervisor, Team member... whatever you call them.">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Supervisor" className={inputClass} />
        </Labelled>
        <Labelled label="Departments" hint="Every department, or each member's own plus the ones ticked below.">
          <span className="flex h-8 items-center gap-2 text-sm">
            <input type="checkbox" checked={seesAll} onChange={(event) => setSeesAll(event.target.checked)} className="size-4" />
            {seesAll ? "Every department" : "Own department plus the ticked ones"}
          </span>
        </Labelled>
      </div>

      {!seesAll && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Also sees
            <Hint text="Shared departments everyone in this group can look at, on top of their own. Stewarding and Quality Control are the usual ones." />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {departments.map((d, index) => {
              const on = departmentIds.includes(d.id);
              const look = departmentColor(d.color, index);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(departmentIds, d.id, setDepartmentIds)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs ring-1 transition",
                    on ? "bg-brand-muted font-semibold text-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:ring-foreground/30"
                  )}
                >
                  <span className={cn("block h-3 w-1", look.dot)} />
                  {d.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Members
          <span className="font-normal tabular-nums">{memberIds.length}</span>
          <Hint text="Matched to the person who logs in by their work email. Supervisors are listed first." />
        </p>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a person…"
          className={cn(inputClass, "mb-1 max-w-xs")}
        />
        <div className="grid max-h-56 gap-x-4 overflow-y-auto rounded-sm bg-surface-sunk p-2 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((e) => (
            <label key={e.id} className="flex items-center gap-2 py-0.5 text-xs">
              <input type="checkbox" checked={memberIds.includes(e.id)} onChange={() => toggle(memberIds, e.id, setMemberIds)} className="size-3.5" />
              <span className="min-w-0 truncate">{displayName(e)}</span>
              {e.isSupervisor && <span className="text-[0.5625rem] font-semibold text-muted-foreground">SUP</span>}
              {!e.email && <span className="text-[0.5625rem] text-warning-foreground" title="No work email, so this person cannot be matched when they log in">no login email</span>}
              {!isSchedulable(e) && <span className="text-[0.5625rem] text-muted-foreground">off schedule</span>}
            </label>
          ))}
          {candidates.length === 0 && <p className="text-xs text-muted-foreground">Nobody matches.</p>}
        </div>
      </div>

      <EditorActions
        pending={pending}
        disabled={!name.trim()}
        saveLabel="Save group"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: draft.id,
            name: name.trim(),
            seesAllDepartments: seesAll,
            seesCost: false,
            sortOrder: draft.sortOrder ?? 0,
            departmentIds: seesAll ? [] : departmentIds,
            memberIds,
          })
        }
      />
    </div>
  );
}
