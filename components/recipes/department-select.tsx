"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setRecipeDepartment } from "@/lib/recipes/actions";

/** A department, and the production line it belongs to. */
export type DepartmentOption = {
  name: string;
  lineName: string | null;
};

const NO_LINE = "—";

/**
 * Line first, then department.
 *
 * A department belongs to a line - Main Kitchen AM is a Bettr Bowl department
 * - so choosing the line first is both how Carlos thinks about it and what
 * makes the second list short enough to be useful. The line itself is not
 * stored on the recipe: it is implied by the department, so there is only
 * ever one thing to keep correct.
 */
export function LineDepartmentSelect({
  recipeId,
  department,
  options,
  lines: configuredLines,
  canEdit,
}: {
  recipeId: string;
  department: string | null;
  options: DepartmentOption[];
  /** Every line configured in Production settings, whether or not it has
   *  departments yet. Deriving the list from departments instead would hide
   *  a line the moment nobody had assigned anything to it. */
  lines: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(department ?? "");
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => {
    // Settings is the source of truth, plus anything a department already
    // points at that settings has not caught up with.
    const names = new Set<string>(configuredLines);
    for (const option of options) {
      if (option.lineName) names.add(option.lineName);
    }
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    // Departments with no line still need somewhere to live.
    return options.some((option) => !option.lineName)
      ? [...sorted, NO_LINE]
      : sorted;
  }, [configuredLines, options]);

  // The line shown is whichever one the current department sits in.
  const currentLine =
    options.find((option) => option.name === value)?.lineName ?? NO_LINE;
  const [line, setLine] = useState(currentLine);

  const departmentsForLine = useMemo(() => {
    const inLine = options
      .filter((option) => (option.lineName ?? NO_LINE) === line)
      .map((option) => option.name);
    // A recipe filed somewhere outside the chosen line still has to show its
    // own value, or the select would silently move it on the next save.
    return value && !inLine.includes(value) ? [value, ...inLine] : inLine;
  }, [options, line, value]);

  if (!canEdit) {
    return (
      <span className="text-sm">
        {department ?? "—"}
        {currentLine !== NO_LINE && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {currentLine}
          </span>
        )}
      </span>
    );
  }

  function save(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setRecipeDepartment({
        recipeId,
        department: next || null,
      });
      if (result.ok) router.refresh();
      else {
        setValue(previous);
        setError(result.message);
      }
    });
  }

  function changeLine(next: string) {
    setLine(next);
    // Moving to a line the current department does not belong to leaves the
    // department blank rather than guessing which one was meant.
    const stillValid = options.some(
      (option) => option.name === value && (option.lineName ?? NO_LINE) === next
    );
    if (!stillValid) setValue("");
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <select
          value={line}
          disabled={pending}
          onChange={(event) => changeLine(event.target.value)}
          aria-label="Production line"
          className="h-7 rounded-md border border-border bg-card px-1.5 text-sm disabled:opacity-60"
        >
          {lines.map((name) => (
            <option key={name} value={name}>
              {name === NO_LINE ? "No line" : name}
            </option>
          ))}
        </select>

        <span className="text-muted-foreground">›</span>

        <select
          value={value}
          disabled={pending}
          onChange={(event) => save(event.target.value)}
          aria-label="Department"
          className="h-7 rounded-md border border-border bg-card px-1.5 text-sm disabled:opacity-60"
        >
          <option value="">Choose a department…</option>
          {departmentsForLine.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {pending && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </span>

      {departmentsForLine.length === 0 && (
        <span className="text-[0.625rem] text-muted-foreground">
          No departments on this line yet — add them in Production settings.
        </span>
      )}
      {error && <span className="text-[0.625rem] text-destructive">{error}</span>}
    </span>
  );
}
