"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteAbsenceType, saveAbsenceType } from "@/lib/hr/actions";
import type { AbsenceType } from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { ColorGrid } from "@/components/hr/color-grid";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { DataTable, TBody, TD, THead, TR, TableEmpty } from "@/components/ui/data-table";
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

/**
 * Off because: the reasons a day can be off - what the dropdown on the
 * schedule card offers.
 *
 * PTO, paid holiday, unpaid holiday, furlough, sick - and whatever else the
 * plant needs. Each has a short code for the cell and the printed sheet, a
 * colour, and whether it is paid; a paid one adds its hours at the person's
 * rate with no overtime.
 */
export function AbsenceSettings({ types, canEdit }: { types: AbsenceType[]; canEdit: boolean }) {
  const { run, pending, notice } = useConfigRunner();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Partial<AbsenceType> | null>(null);

  return (
    <SettingsPage intro="The reasons a day can be OFF. Supervisors tap one on the schedule instead of plain OFF, so the reason is on the sheet and in the cost. Paid types add their hours at the person's rate, without overtime.">
      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "", className: "w-6" },
            { label: "Reason" },
            { label: "Code" },
            { label: "Paid" },
            { label: "Hours paid", numeric: true },
            { label: "Order", numeric: true },
            { label: "Active" },
            { label: "", className: "w-24" },
          ]}
        />
        <TBody>
          {types.map((type, index) => {
            const tone = departmentColor(type.color, index);
            return (
              <TR key={type.id}>
                <TD>
                  <span aria-hidden className={cn("block h-4 w-1.5", tone.dot)} />
                </TD>
                <TD strong>{type.name}</TD>
                <TD>
                  <span className={cn("rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-black tracking-wider", tone.tint)}>{type.code}</span>
                </TD>
                <TD>
                  <span className={cn("text-xs", type.paid ? "font-semibold text-success" : "text-muted-foreground")}>{type.paid ? "Paid" : "Unpaid"}</span>
                </TD>
                <TD numeric>{type.paid ? `${type.paidHours} h` : "—"}</TD>
                <TD numeric muted>
                  {type.sortOrder}
                </TD>
                <TD>
                  <ActiveDot active={type.active} />
                </TD>
                <TD>
                  {canEdit && (
                    <span className="flex justify-end gap-1">
                      <IconButton label="Edit reason" onClick={() => setDraft(type)}>
                        Edit
                      </IconButton>
                      <IconButton
                        label="Delete reason"
                        danger
                        disabled={pending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete ${type.name}?`,
                            description: "Days already marked with it stay OFF but lose the reason. Turning it off instead keeps the history.",
                            confirmLabel: "Delete",
                            cancelLabel: "Cancel",
                            tone: "danger",
                          });
                          if (ok) run(() => deleteAbsenceType({ id: type.id }), `${type.name} deleted`);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
          {types.length === 0 && (
            <TableEmpty colSpan={8}>No reasons yet. Run the 20260903_hr_absences migration to get the starting five - PTO, holidays, furlough, sick - or add one.</TableEmpty>
          )}
        </TBody>
      </DataTable>

      {canEdit &&
        (draft ? (
          <TypeEditor
            key={draft.id ?? "new"}
            draft={draft}
            pending={pending}
            onCancel={() => setDraft(null)}
            onSave={(value) =>
              run(async () => {
                const result = await saveAbsenceType(value);
                if (result.ok) setDraft(null);
                return result;
              }, "Reason saved")
            }
          />
        ) : (
          <AddButton onClick={() => setDraft({ name: "", code: "", paid: false, paidHours: 8, color: null, sortOrder: types.length + 1, active: true })}>
            Add a reason
          </AddButton>
        ))}
    </SettingsPage>
  );
}

function TypeEditor({
  draft,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<AbsenceType>;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: Parameters<typeof saveAbsenceType>[0]) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [code, setCode] = useState(draft.code ?? "");
  const [paid, setPaid] = useState(draft.paid ?? false);
  const [paidHours, setPaidHours] = useState(String(draft.paidHours ?? 8));
  const [color, setColor] = useState<string | null>(draft.color ?? null);
  const [sortOrder, setSortOrder] = useState(String(draft.sortOrder ?? 0));
  const [active, setActive] = useState(draft.active ?? true);

  return (
    <div className="flex flex-col gap-2 rounded-sm bg-card p-3 ring-1 ring-primary/40">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Labelled label="Name" hint="What the supervisor taps: PTO, Holiday, Furlough, Sick...">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="PTO" className={inputClass} />
        </Labelled>
        <Labelled label="Code" hint="Short, for the cell and the printed sheet. Up to 6 letters.">
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="PTO" className={cn(inputClass, "w-28 font-black tracking-wider")} />
        </Labelled>
        <Labelled label="Paid" hint="Paid days add their hours at the person's rate, with no overtime and not counting towards the 40.">
          <span className="flex h-8 items-center gap-2 text-sm">
            <Switch checked={paid} onCheckedChange={setPaid} aria-label="Paid">
              <SwitchThumb />
            </Switch>
            <span className={paid ? "font-medium text-success" : "text-muted-foreground"}>{paid ? "Paid" : "Unpaid"}</span>
          </span>
        </Labelled>
        {paid && (
          <Labelled label="Hours paid" hint="Hours paid for one such day. 8 for a five-day week, 10 for a 4 x 10.">
            <span className="flex items-center gap-2">
              <input inputMode="decimal" value={paidHours} onChange={(event) => setPaidHours(event.target.value)} className={cn(inputClass, "w-24 tabular-nums")} />
              <span className="text-xs text-muted-foreground">hours</span>
            </span>
          </Labelled>
        )}
        <Labelled label="Order" hint="Where it sits among the buttons on the day card.">
          <input inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className={cn(inputClass, "w-24 tabular-nums")} />
        </Labelled>
        <Labelled label="Active" hint="Inactive types stay on days already marked but are not offered any more.">
          <span className="flex h-8 items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} aria-label="Active">
              <SwitchThumb />
            </Switch>
            <ActiveDot active={active} />
          </span>
        </Labelled>
      </div>

      <ColourRow hint="How the day looks on the schedule.">
        <ColorGrid value={color} onChange={setColor} />
      </ColourRow>

      <EditorActions
        pending={pending}
        disabled={!name.trim() || !code.trim()}
        saveLabel="Save reason"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: draft.id,
            name: name.trim(),
            code: code.trim(),
            paid,
            paidHours: Number(paidHours) || 0,
            color,
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
