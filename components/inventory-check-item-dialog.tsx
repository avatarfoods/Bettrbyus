"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createInventoryCheckTemplateItem,
  TEMPLATE_ITEM_SAVE_ERROR_MESSAGE,
  updateInventoryCheckTemplateItem,
} from "@/lib/inventory-checks/save-template-item";
import { formatDepartmentName } from "@/lib/inventory-checks/format-department";
import {
  getInventoryCheckUnitOptions,
  normalizeInventoryCheckUnit,
} from "@/lib/inventory-checks/unit-options";
import { resolveItemDepartmentName } from "@/lib/inventory-checks/resolve-department";
import type {
  DepartmentSummary,
  InventoryCheckItem,
} from "@/lib/inventory-checks/types";
import {
  formatParQuantityInput,
  inventoryCheckTemplateItemSchema,
  parseParQuantityInput,
} from "@/lib/validations/inventory-check-template";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InventoryCheckItemDialogProps = {
  mode: "add" | "edit";
  item: InventoryCheckItem | null;
  departments: DepartmentSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: InventoryCheckItem) => void;
};

type InventoryCheckItemFormProps = {
  mode: "add" | "edit";
  item: InventoryCheckItem | null;
  departments: DepartmentSummary[];
  onCancel: () => void;
  onSaved: (item: InventoryCheckItem) => void;
};

function getInitialFormValues(
  mode: "add" | "edit",
  item: InventoryCheckItem | null,
  departments: DepartmentSummary[]
) {
  if (mode === "edit" && item) {
    return {
      departmentId: item.department_id,
      itemCode: item.item_code,
      itemName: item.item_name,
      parQuantity: formatParQuantityInput(item.par_quantity),
      unit: item.unit ?? "",
    };
  }

  return {
    departmentId: departments[0]?.id ?? "",
    itemCode: "",
    itemName: "",
    parQuantity: "",
    unit: "",
  };
}

function InventoryCheckItemForm({
  mode,
  item,
  departments,
  onCancel,
  onSaved,
}: InventoryCheckItemFormProps) {
  const initial = getInitialFormValues(mode, item, departments);
  const unitOptions = getInventoryCheckUnitOptions(initial.unit);
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [itemCode, setItemCode] = useState(initial.itemCode);
  const [itemName, setItemName] = useState(initial.itemName);
  const [parQuantity, setParQuantity] = useState(initial.parQuantity);
  const [unit, setUnit] = useState(initial.unit);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const parsedPar = parseParQuantityInput(parQuantity);
    if (parQuantity.trim() && parsedPar === null) {
      setFormError("Enter a valid par quantity or leave it blank for N/A.");
      return;
    }

    const payload = {
      departmentId,
      itemCode,
      itemName,
      parQuantity: parsedPar,
      unit: normalizeInventoryCheckUnit(unit),
    };

    const validation = inventoryCheckTemplateItemSchema.safeParse(payload);
    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? "Invalid item data.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const result =
      mode === "edit" && item
        ? await updateInventoryCheckTemplateItem(
            supabase,
            item.id,
            validation.data
          )
        : await createInventoryCheckTemplateItem(supabase, validation.data);

    setIsSubmitting(false);

    if (!result.success) {
      setFormError(TEMPLATE_ITEM_SAVE_ERROR_MESSAGE);
      return;
    }

    onSaved(result.data);
  }

  return (
    <>
      <div className="grid gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-department">Department</Label>
          <select
            id="template-department"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {formatDepartmentName(department.name)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-item-code">Item ID</Label>
          <Input
            id="template-item-code"
            value={itemCode}
            onChange={(event) => setItemCode(event.target.value)}
            placeholder="e.g. 160287"
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-item-name">Item name</Label>
          <Input
            id="template-item-name"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Item description"
            className="h-10"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-par-quantity">Par quantity</Label>
            <Input
              id="template-par-quantity"
              type="number"
              inputMode="decimal"
              step="any"
              value={parQuantity}
              onChange={(event) => setParQuantity(event.target.value)}
              placeholder="N/A"
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-unit">Unit</Label>
            <select
              id="template-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
            >
              {unitOptions.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || departments.length === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : mode === "edit" ? (
            "Save changes"
          ) : (
            "Add item"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

export function InventoryCheckItemDialog({
  mode,
  item,
  departments,
  open,
  onOpenChange,
  onSaved,
}: InventoryCheckItemDialogProps) {
  const formKey = `${mode}-${item?.id ?? "new"}`;
  const departmentName =
    mode === "edit" && item
      ? resolveItemDepartmentName(item, departments)
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit item" : "Add item"}
            {departmentName ? (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {departmentName}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update par quantity, unit, department, and other item details."
              : "Add a new item to the inventory check list."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <InventoryCheckItemForm
            key={formKey}
            mode={mode}
            item={item}
            departments={departments}
            onCancel={() => onOpenChange(false)}
            onSaved={(savedItem) => {
              onSaved(savedItem);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
