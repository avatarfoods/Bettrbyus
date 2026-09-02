"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteProductionLine,
  saveProductionLine,
} from "@/lib/production/config-actions";
import type { ProductionConfig, ProductionLine } from "@/lib/production/config";
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
  slugify,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The production lines themselves - what they are called and what order they
 * appear in. Which Odoo category each one pulls from is a separate setting,
 * because that answers a different question: where the orders come from.
 */
export function LinesSettings({ config }: { config: ProductionConfig }) {
  const { run, pending, notice } = useConfigRunner();
  const [draft, setDraft] = useState<Partial<ProductionLine> | null>(null);

  return (
    <SettingsPage intro="Each line becomes a tab on the order schedule. Add one when you start running a new product family.">
      <FallbackBanner show={config.usingFallback} />
      <Notice notice={notice} />

      <DataTable>
        <THead
          columns={[
            { label: "Name" },
            { label: "Key" },
            { label: "Order", numeric: true },
            { label: "Active" },
            { label: "", className: "w-20" },
          ]}
        />
        <TBody>
          {config.lines.map((line) => (
            <TR key={line.id}>
              <TD strong>{line.name}</TD>
              <TD mono muted>
                {line.key}
              </TD>
              <TD numeric muted>
                {line.sortOrder}
              </TD>
              <TD>
                <ActiveDot active={line.active} />
              </TD>
              <TD>
                <span className="flex justify-end gap-1">
                  <IconButton label="Edit line" onClick={() => setDraft(line)}>
                    Edit
                  </IconButton>
                  <IconButton
                    label="Delete line"
                    danger
                    disabled={pending || line.id.startsWith("fallback-")}
                    onClick={() => {
                      if (!confirm(`Delete the ${line.name} line?`)) return;
                      run(
                        () => deleteProductionLine(line.id),
                        `${line.name} deleted`
                      );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </span>
              </TD>
            </TR>
          ))}
          {config.lines.length === 0 && (
            <TableEmpty colSpan={5}>No lines configured.</TableEmpty>
          )}
        </TBody>
      </DataTable>

      {draft ? (
        <LineEditor
          draft={draft}
          pending={pending}
          onCancel={() => setDraft(null)}
          onSave={(value) => {
            run(() => saveProductionLine(value), "Line saved");
            setDraft(null);
          }}
        />
      ) : (
        <AddButton
          onClick={() =>
            setDraft({
              key: "",
              name: "",
              odooCategoryIds: [],
              sortOrder: config.lines.length + 1,
              active: true,
            })
          }
        >
          Add a line
        </AddButton>
      )}
    </SettingsPage>
  );
}

function LineEditor({
  draft,
  pending,
  onCancel,
  onSave,
}: {
  draft: Partial<ProductionLine>;
  pending: boolean;
  onCancel: () => void;
  onSave: (value: {
    id?: string;
    key: string;
    name: string;
    odooCategoryIds: number[];
    sortOrder: number;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [key, setKey] = useState(draft.key ?? "");
  const [sortOrder, setSortOrder] = useState(String(draft.sortOrder ?? 0));
  const [active, setActive] = useState(draft.active ?? true);

  const isNew = !draft.id || draft.id.startsWith("fallback-");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Name">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // Auto-fill the slug only while adding. Renaming later must not
              // silently change a key that saved views already point at.
              if (isNew) setKey(slugify(event.target.value));
            }}
            placeholder="Pizza Cupcake"
            className={inputClass}
          />
        </Labelled>
        <Labelled label="Key" hint="Used in links and saved views. Renaming the label must not break a bookmark, which is why this is separate.">
          <input
            value={key}
            onChange={(event) => setKey(slugify(event.target.value))}
            placeholder="pizza-cupcake"
            className={cn(inputClass, "font-mono")}
          />
        </Labelled>
        <Labelled label="Sort order">
          <input
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className={cn(inputClass, "tabular-nums")}
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
        disabled={!name.trim() || !key.trim()}
        saveLabel="Save line"
        onCancel={onCancel}
        onSave={() =>
          onSave({
            id: isNew ? undefined : draft.id,
            key: key.trim(),
            name: name.trim(),
            // Owned by the Orders setting; carried through untouched so saving
            // a rename here cannot wipe the category mapping.
            odooCategoryIds: draft.odooCategoryIds ?? [],
            sortOrder: Number(sortOrder) || 0,
            active,
          })
        }
      />
    </div>
  );
}
