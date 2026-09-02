"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  deleteProductionDepartment,
  importDepartmentsFromRecipes,
  saveProductionDepartment,
} from "@/lib/production/config-actions";
import type {
  ProductionConfig,
  ProductionDepartment,
} from "@/lib/production/config";
import {
  DEPARTMENT_COLORS,
  departmentColor,
} from "@/lib/production/department-colors";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import {
  ActiveDot,
  AddButton,
  EditorActions,
  FallbackBanner,
  IconButton,
  Labelled,
  Notice,
  SettingsPage,
  inputClass,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Departments, and which line each belongs to.
 *
 * The same shape as Odoo's warehouse and its locations: the line is the
 * container, departments sit inside it. That link is what lets a filter read
 * "Bettr Bowl > Main Kitchen AM" instead of one flat list of every department
 * in the plant.
 */
export function DepartmentsSettings({ config }: { config: ProductionConfig }) {
  const { run, pending, notice } = useConfigRunner();
  const [draft, setDraft] = useState<Partial<ProductionDepartment> | null>(null);

  return (
    <SettingsPage intro="Departments are where the work happens. Attach each to the line it belongs to.">
      <FallbackBanner show={config.usingFallback} />
      <Notice notice={notice} />

      {config.lines.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-card ring-1 ring-foreground/10 p-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Rather than typing them out, pull every department the recipes
            already use. Names come from the real data, so they cannot fail to
            match later.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const target = config.lines[0];
              if (
                !confirm(
                  `Add every department used by the recipes, attached to ${target.name}?`
                )
              ) {
                return;
              }
              run(
                () => importDepartmentsFromRecipes(target.id),
                `Departments imported onto ${target.name}`
              );
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-card ring-1 ring-foreground/10 px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            <Download className="size-3.5" />
            Import from recipes
          </button>
        </div>
      )}

      <DataTable>
        <THead
          columns={[
            { label: "", className: "w-6" },
            { label: "Department" },
            { label: "Line" },
            { label: "Order", numeric: true },
            { label: "Active" },
            { label: "", className: "w-20" },
          ]}
        />
        <TBody>
          {config.departments.map((department) => (
            <TR key={department.id}>
              <TD>
                <span
                  aria-hidden
                  className={cn(
                    "block h-4 w-1.5 rounded-[1px]",
                    departmentColor(
                      department.color,
                      config.departments.indexOf(department)
                    ).dot
                  )}
                />
              </TD>
              <TD strong>{department.name}</TD>
              <TD>
                {department.lineName ? (
                  <span className="rounded bg-brand-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
                    {department.lineName}
                  </span>
                ) : (
                  <span className="text-xs text-warning-foreground">
                    not linked
                  </span>
                )}
              </TD>
              <TD numeric muted>
                {department.sortOrder}
              </TD>
              <TD>
                <ActiveDot active={department.active} />
              </TD>
              <TD>
                <span className="flex justify-end gap-1">
                  <IconButton
                    label="Edit department"
                    onClick={() => setDraft(department)}
                  >
                    Edit
                  </IconButton>
                  <IconButton
                    label="Delete department"
                    danger
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Delete ${department.name}?`)) return;
                      run(
                        () => deleteProductionDepartment(department.id),
                        `${department.name} deleted`
                      );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </span>
              </TD>
            </TR>
          ))}
          {config.departments.length === 0 && (
            <TableEmpty colSpan={5}>
              No departments yet. Import them from the recipes above, or add one
              by hand.
            </TableEmpty>
          )}
        </TBody>
      </DataTable>

      {draft ? (
        <DepartmentEditor
          draft={draft}
          config={config}
          pending={pending}
          onCancel={() => setDraft(null)}
          onSave={(value) => {
            run(() => saveProductionDepartment(value), "Department saved");
            setDraft(null);
          }}
        />
      ) : (
        <AddButton
          onClick={() =>
            setDraft({
              name: "",
              lineId: config.lines[0]?.id ?? null,
              sortOrder: config.departments.length + 1,
              active: true,
            })
          }
        >
          Add a department
        </AddButton>
      )}
    </SettingsPage>
  );
}

function DepartmentEditor({
  draft,
  config,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<ProductionDepartment>;
  config: ProductionConfig;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: {
    id?: string;
    name: string;
    lineId: string | null;
    sortOrder: number;
    active: boolean;
    color: string | null;
  }) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [lineId, setLineId] = useState(draft.lineId ?? "");
  const [sortOrder, setSortOrder] = useState(String(draft.sortOrder ?? 0));
  const [active, setActive] = useState(draft.active ?? true);
  const [color, setColor] = useState<string | null>(draft.color ?? null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Department name" hint="As the recipes spell it — MAIN KITCHEN AM. It has to match, or nothing files under it.">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="MAIN KITCHEN AM"
            className={inputClass}
          />
        </Labelled>
        <Labelled label="Belongs to line" hint="Which product line this room works for. The plan and the dashboard filter by line first.">
          <select
            value={lineId ?? ""}
            onChange={(event) => setLineId(event.target.value)}
            className={inputClass}
          >
            <option value="">Not linked</option>
            {config.lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Sort order" hint="Where it sits in tree order: finished product first, then assembly, then the kitchens that feed them.">
          <input
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className={cn(inputClass, "tabular-nums")}
          />
        </Labelled>
      </div>

      {/* The plan is read by scanning for a band of colour before anyone
          reads a word, so which colour a department gets is theirs to pick. */}
      <Labelled label="Colour on the plan">
        <div className="flex flex-wrap items-center gap-1.5">
          {DEPARTMENT_COLORS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setColor(option.key)}
              aria-label={option.label}
              aria-pressed={color === option.key}
              title={option.label}
              className={cn(
                "size-7 rounded-md ring-1 transition",
                option.tint,
                color === option.key
                  ? "ring-2 ring-primary"
                  : "ring-border hover:ring-foreground/30"
              )}
            >
              <span
                className={cn("mx-auto block h-3.5 w-1.5 rounded-[1px]", option.dot)}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setColor(null)}
            aria-pressed={color === null}
            className={cn(
              "h-7 rounded-md px-2 text-xs ring-1 transition",
              color === null
                ? "ring-2 ring-primary text-foreground"
                : "text-muted-foreground ring-border hover:ring-foreground/30"
            )}
          >
            Automatic
          </button>
        </div>
      </Labelled>

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
        disabled={!name.trim()}
        saveLabel="Save department"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: draft.id,
            name: name.trim(),
            lineId: lineId || null,
            sortOrder: Number(sortOrder) || 0,
            active,
            color,
          })
        }
      />
    </div>
  );
}
