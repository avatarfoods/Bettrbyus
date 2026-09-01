"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search, Trash2, X } from "lucide-react";
import {
  deleteGroup,
  removeMember,
  saveGroup,
  saveMember,
} from "@/lib/groups/actions";
import type {
  GroupsData,
  ItemGroup,
  MaterialOption,
} from "@/lib/groups/fetch-groups";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import {
  AddButton,
  EditorActions,
  IconButton,
  Labelled,
  Notice,
  inputClass,
  useConfigRunner,
  type Runner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Interchangeable item groups.
 *
 * Membership is chosen by hand rather than inferred from the item code: dash
 * suffixes look like families but 220096-1 and 220096-2 are a box top and a
 * box bottom, which are used together and must never be swapped.
 *
 * Pack size is the field that matters. Within one group the same ingredient
 * arrives as a 44 lb pail, a 20 L bag and a 2,204 lb tote — substituting
 * case-for-case would order forty times too much.
 */
export function GroupsSettings({
  data,
  materials,
}: {
  data: GroupsData;
  materials: MaterialOption[];
}) {
  const { run, pending, notice } = useConfigRunner();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [groupDraft, setGroupDraft] = useState<Partial<ItemGroup> | null>(null);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (data.missingTables) {
    return (
      <div className="px-3 py-4 sm:px-4">
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The group tables do not exist yet. Run the{" "}
            <code>20260828_item_groups</code> migration, then reload.
          </span>
        </div>
      </div>
    );
  }

  const totalIncomplete = data.groups.reduce(
    (sum, group) => sum + group.incompleteCount,
    0
  );

  return (
    <div className="flex flex-col gap-3 px-3 py-4 sm:px-4">
      <p className="text-sm text-muted-foreground">
        Items that can stand in for one another. When the preferred item runs
        short, the system falls through the ranks — converting by pack size, so
        a 44&nbsp;lb pail is never swapped one-for-one with a 2,204&nbsp;lb tote.
      </p>

      {totalIncomplete > 0 && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {totalIncomplete} member{totalIncomplete === 1 ? " has" : "s have"} no
            pack size and will be skipped when substituting.
          </span>
        </div>
      )}

      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "Group" },
            { label: "Compared in" },
            { label: "Members", numeric: true },
            { label: "Status" },
            { label: "", className: "w-20" },
          ]}
        />
        <TBody>
          {data.groups.map((group) => {
            const expanded = open.has(group.id);
            return [
              <TR key={group.id} onClick={() => toggle(group.id)}>
                <TD strong>
                  <span className="flex items-center gap-1.5">
                    {expanded ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {group.name}
                    {!group.active && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                        off
                      </span>
                    )}
                  </span>
                </TD>
                <TD muted>{group.uom}</TD>
                <TD numeric>{group.members.length}</TD>
                <TD>
                  {group.incompleteCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-[1px] bg-warning-muted px-2 py-0.5 text-[0.6875rem] font-medium text-warning-foreground">
                      <AlertTriangle className="size-3" />
                      {group.incompleteCount} missing pack size
                    </span>
                  ) : group.members.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No members yet
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-[1px] bg-success" />
                      Ready
                    </span>
                  )}
                </TD>
                <TD>
                  <span className="flex justify-end gap-1">
                    <IconButton
                      label="Edit group"
                      onClick={() => setGroupDraft(group)}
                    >
                      Edit
                    </IconButton>
                    <IconButton
                      label="Delete group"
                      danger
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete the ${group.name} group?`)) return;
                        run(() => deleteGroup(group.id), `${group.name} deleted`);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </span>
                </TD>
              </TR>,
              ...(expanded
                ? [
                    <tr key={`${group.id}-members`} className="bg-muted/30">
                      <td colSpan={5} className="px-2.5 py-3">
                        <MemberPanel
                          group={group}
                          materials={materials}
                          pending={pending}
                          run={run}
                        />
                      </td>
                    </tr>,
                  ]
                : []),
            ];
          })}
          {data.groups.length === 0 && (
            <TableEmpty colSpan={5}>
              No groups yet. Create one for an ingredient you buy under more
              than one item number.
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {groupDraft ? (
        <GroupEditor
          draft={groupDraft}
          pending={pending}
          onCancel={() => setGroupDraft(null)}
          onSave={(value) => {
            run(() => saveGroup(value), "Group saved");
            setGroupDraft(null);
          }}
        />
      ) : (
        <AddButton
          onClick={() =>
            setGroupDraft({ name: "", uom: "LB", notes: null, active: true })
          }
        >
          Create a group
        </AddButton>
      )}
    </div>
  );
}

function GroupEditor({
  draft,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<ItemGroup>;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: {
    id?: string;
    name: string;
    uom: string;
    notes: string | null;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [uom, setUom] = useState(draft.uom ?? "LB");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [active, setActive] = useState(draft.active ?? true);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Group name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Coconut cream"
            className={inputClass}
          />
        </Labelled>
        <Labelled label="Compared in">
          <input
            value={uom}
            onChange={(event) => setUom(event.target.value)}
            placeholder="LB"
            className={cn(inputClass, "uppercase")}
          />
        </Labelled>
        <Labelled label="Note (optional)">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Why these are interchangeable"
            className={inputClass}
          />
        </Labelled>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-4"
        />
        Active
      </label>

      <EditorActions
        pending={pending}
        disabled={!name.trim() || !uom.trim()}
        saveLabel="Save group"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: draft.id,
            name: name.trim(),
            uom: uom.trim().toUpperCase(),
            notes: notes.trim() || null,
            active,
          })
        }
      />
    </div>
  );
}

function MemberPanel({
  group,
  materials,
  pending,
  run,
}: {
  group: ItemGroup;
  materials: MaterialOption[];
  pending: boolean;
  run: Runner;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <DataTable>
        <THead
          columns={[
            { label: "Rank", numeric: true },
            { label: "Item" },
            { label: "Name" },
            { label: `Pack size (${group.uom})`, numeric: true },
            { label: "On hand", numeric: true },
            { label: "", className: "w-10" },
          ]}
        />
        <TBody>
          {group.members.map((member) => (
            <TR key={member.id}>
              <TD numeric muted>
                {member.rank}
              </TD>
              <TD mono muted>
                {member.itemCode}
              </TD>
              <TD>
                <span className="flex items-center gap-1.5">
                  {member.name}
                  {member.warning && (
                    <span
                      title={member.warning}
                      className="inline-flex cursor-help items-center text-warning-foreground"
                    >
                      <AlertTriangle className="size-3.5" />
                    </span>
                  )}
                </span>
              </TD>
              <TD numeric>
                {member.packSize ?? (
                  <span className="text-warning-foreground">not set</span>
                )}
              </TD>
              <TD numeric muted>
                {member.onHand ?? "—"}
              </TD>
              <TD>
                <span className="flex justify-end">
                  <IconButton
                    label="Remove from group"
                    danger
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remove ${member.itemCode} from ${group.name}?`))
                        return;
                      run(
                        () => removeMember(member.id),
                        `${member.itemCode} removed`
                      );
                    }}
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </span>
              </TD>
            </TR>
          ))}
          {group.members.length === 0 && (
            <TableEmpty colSpan={6}>
              Add the items that can stand in for one another.
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {adding ? (
        <MemberPicker
          group={group}
          materials={materials}
          pending={pending}
          onCancel={() => setAdding(false)}
          onAdd={(value) => {
            run(() => saveMember(value), "Item added");
            setAdding(false);
          }}
        />
      ) : (
        <AddButton onClick={() => setAdding(true)}>Add an item</AddButton>
      )}
    </div>
  );
}

function MemberPicker({
  group,
  materials,
  pending,
  onCancel,
  onAdd,
}: {
  group: ItemGroup;
  materials: MaterialOption[];
  pending: boolean;
  onCancel: () => void;
  onAdd: (value: {
    groupId: string;
    materialId: string;
    packSize: number | null;
    rank: number;
    notes: string | null;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MaterialOption | null>(null);
  const [packSize, setPackSize] = useState("");
  const [rank, setRank] = useState(String(group.members.length + 1));

  const alreadyIn = new Set(group.members.map((m) => m.materialId));

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return materials
      .filter(
        (material) =>
          !alreadyIn.has(material.id) &&
          `${material.itemCode} ${material.name}`.toLowerCase().includes(needle)
      )
      .slice(0, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, query, group.members]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3">
      {selected ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">
              {selected.itemCode}
            </span>
            <span className="font-medium">{selected.name}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-primary hover:underline"
            >
              change
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Labelled label={`Pack size (${group.uom})`}>
              <input
                inputMode="decimal"
                value={packSize}
                onChange={(event) => setPackSize(event.target.value)}
                placeholder="44"
                className={cn(inputClass, "tabular-nums")}
              />
            </Labelled>
            <Labelled label="Rank">
              <input
                inputMode="numeric"
                value={rank}
                onChange={(event) => setRank(event.target.value)}
                className={cn(inputClass, "tabular-nums")}
              />
            </Labelled>
          </div>

          <p className="text-xs text-muted-foreground">
            Pack size is how much of one {group.uom} unit a single purchase unit
            holds. Leave it blank and this item is listed but never substituted.
          </p>

          <EditorActions
            pending={pending}
            saveLabel="Add to group"
            onCancel={onCancel}
            onSave={() =>
              onAdd({
                groupId: group.id,
                materialId: selected.id,
                packSize: packSize.trim() ? Number(packSize) : null,
                rank: Number(rank) || 1,
                notes: null,
              })
            }
          />
        </>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by item number or name…"
              className={cn(inputClass, "pl-8")}
            />
          </div>

          {query.trim().length >= 2 && (
            <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
              {matches.map((material) => (
                <li key={material.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(material);
                      // Pre-fill from the material's known weight per case.
                      if (material.lbsPerCase) {
                        setPackSize(String(material.lbsPerCase));
                      }
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                      {material.itemCode}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {material.name}
                    </span>
                    {material.groupName && (
                      <span className="shrink-0 rounded bg-warning-muted px-1.5 py-0.5 text-[0.625rem] text-warning-foreground">
                        in {material.groupName}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                  Nothing matches.
                </li>
              )}
            </ul>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
