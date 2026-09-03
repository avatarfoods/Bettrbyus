"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { importEmployees } from "@/lib/hr/actions";
import { previewImport, type ImportPreview, type ImportedEmployee } from "@/lib/hr/import";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * What HR already knows about a person, for the change review.
 */
export type ExistingPerson = {
  paychexId: string;
  firstName: string;
  lastName: string;
  department: string | null;
  payType: "hourly" | "salary";
  payRate: number | null;
  email: string | null;
  personalEmail: string | null;
  phone: string | null;
  active: boolean;
};

/**
 * Bringing people in from Paychex.
 *
 * The first import just loads everyone. Every import after that is a review:
 * who is new, who changed and what changed, who is no longer in the file, and
 * which departments are new - all shown before anything is written. A hundred
 * and fifty rows are checked by eye, not trusted.
 */
export function ImportButton({
  canImport,
  existing,
}: {
  canImport: boolean;
  /** Everyone HR has now, to compare the file against. */
  existing: ExistingPerson[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(params.get("import") === "1");

  function close() {
    setOpen(false);
    if (params.get("import") === "1") {
      const search = new URLSearchParams(params.toString());
      search.delete("import");
      router.replace(`/hr/people${search.size ? `?${search}` : ""}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canImport}
        title={canImport ? "Bring people and departments in from a Paychex export" : "Only an administrator can import"}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <FileUp className="size-3.5" />
        Import from Paychex
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto rounded-sm p-0">
          <ImportPanel onDone={close} existing={existing} />
        </DialogContent>
      </Dialog>
    </>
  );
}

type Change = { paychexId: string; name: string; fields: { field: string; from: string; to: string }[] };

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const rate = (payType: string, v: number | null) =>
  v === null ? "—" : payType === "salary" ? `$${v.toFixed(0)}/wk` : `$${v.toFixed(2)}/h`;

/** What would change for one person already in HR. */
function diff(before: ExistingPerson, after: ImportedEmployee): Change["fields"] {
  const fields: Change["fields"] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    if (show(a).trim().toLowerCase() !== show(b).trim().toLowerCase()) fields.push({ field, from: show(a), to: show(b) });
  };
  cmp("Name", `${before.firstName} ${before.lastName}`, `${after.firstName} ${after.lastName}`);
  cmp("Department", before.department, after.department);
  cmp("Pay type", before.payType, after.payType);
  if ((before.payRate ?? -1).toFixed(2) !== (after.payRate ?? -1).toFixed(2)) {
    fields.push({ field: "Rate", from: rate(before.payType, before.payRate), to: rate(after.payType, after.payRate) });
  }
  cmp("Work email", before.email, after.email);
  cmp("Personal email", before.personalEmail, after.personalEmail);
  cmp("Phone", before.phone, after.phone);
  if (!before.active && after.active) fields.push({ field: "Status", from: "inactive", to: "active" });
  return fields;
}

function ImportPanel({ onDone, existing }: { onDone: () => void; existing: ExistingPerson[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  /** The open section, or null for "whichever has something to look at". */
  const [sectionChoice, setSection] = useState<"new" | "changed" | "gone" | "same" | null>(null);

  useEffect(() => {
    fileInput.current?.click();
  }, []);

  async function read(file: File) {
    setError(null);
    setResult(null);
    setSection(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = previewImport(buffer);
      if (parsed.employees.length === 0 && parsed.headers.length === 0) {
        setError("The file is empty.");
        setPreview(null);
        return;
      }
      setPreview(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the file");
      setPreview(null);
    }
  }

  /** The review: new, changed, gone, unchanged. */
  const review = useMemo(() => {
    if (!preview) return null;
    const byId = new Map(existing.map((e) => [e.paychexId, e]));
    const inFile = new Set(preview.employees.map((e) => e.paychexId));
    const added: ImportedEmployee[] = [];
    const changed: Change[] = [];
    let same = 0;
    for (const person of preview.employees) {
      const before = byId.get(person.paychexId);
      if (!before) {
        added.push(person);
        continue;
      }
      const fields = diff(before, person);
      if (fields.length > 0) changed.push({ paychexId: person.paychexId, name: `${person.firstName} ${person.lastName}`, fields });
      else same += 1;
    }
    const gone = existing.filter((e) => e.active && !inFile.has(e.paychexId));
    const existingDepts = new Set(existing.map((e) => e.department?.toUpperCase()).filter(Boolean));
    const newDepartments = preview.departments.filter((d) => !existingDepts.has(d.name.toUpperCase()));
    return { added, changed, gone, same, newDepartments, first: existing.length === 0 };
  }, [preview, existing]);

  // Land on whichever section has something to look at, until a counter is tapped.
  const section =
    sectionChoice ??
    (!review
      ? "changed"
      : review.changed.length > 0
        ? "changed"
        : review.added.length > 0
          ? "new"
          : review.gone.length > 0
            ? "gone"
            : "same");

  function run() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const outcome = await importEmployees({ employees: preview.employees });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setResult(
        `${outcome.imported ?? 0} people written` +
          (outcome.departmentsAdded ? `, ${outcome.departmentsAdded} new department${outcome.departmentsAdded === 1 ? "" : "s"}` : "") +
          (outcome.deactivated ? `, ${outcome.deactivated} set inactive` : "")
      );
      router.refresh();
    });
  }

  const blocked = preview ? preview.missing.includes("employee id") || preview.missing.includes("name") : true;
  const contractors = preview?.employees.filter((e) => e.employeeType === "contractor").length ?? 0;
  const nothingToDo = review && !review.first && review.added.length === 0 && review.changed.length === 0 && review.gone.length === 0;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <DialogTitle className="text-sm font-semibold">Import from Paychex</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Drop the Employee Listings export. Nothing is written until you have seen what changes and pressed Import.
        </DialogDescription>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void read(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed px-4 py-4 text-center text-xs transition-colors",
            dragging ? "border-primary bg-brand-muted" : "border-border bg-surface-sunk hover:border-foreground/30"
          )}
        >
          <Upload className="size-5 text-primary" />
          <span className="font-medium">{fileName ?? "Drop the Paychex export here, or click to choose"}</span>
          <span className="text-muted-foreground">.xlsx, .xls or .csv</span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="Paychex export file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
            }}
          />
        </label>

        {preview && review && (
          <div className="flex flex-col gap-2">
            {preview.missing.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-sm bg-warning-muted px-3 py-1.5 text-xs text-warning-foreground">
                <span>
                  Not found in the file: <strong>{preview.missing.join(", ")}</strong>.
                  {blocked ? " The import needs an employee id and a name." : " Those fields stay blank."}
                </span>
                <Hint text={`Columns in the file: ${preview.headers.filter(Boolean).join(", ")}`} />
              </p>
            )}

            {/* The review, as four counters you can open. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Counter label="New people" value={review.added.length} active={section === "new"} onClick={() => setSection("new")} tone="good" />
              <Counter label="Changed" value={review.changed.length} active={section === "changed"} onClick={() => setSection("changed")} tone="warn" />
              <Counter label="No longer in file" value={review.gone.length} active={section === "gone"} onClick={() => setSection("gone")} tone="bad" hint="Set inactive and taken off every schedule. Paychex only exports active people." />
              <Counter label="Unchanged" value={review.same} active={section === "same"} onClick={() => setSection("same")} tone="muted" />
            </div>

            {review.newDepartments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">New departments: </span>
                {review.newDepartments.map((d) => `${d.name}${d.line ? ` (${d.line})` : ""}`).join(" · ")}
              </p>
            )}
            {contractors > 0 && (
              <p className="text-xs text-muted-foreground">
                {contractors} contractor{contractors === 1 ? "" : "s"} in the file, kept off the schedule.
              </p>
            )}

            <div className="max-h-64 overflow-auto rounded-sm ring-1 ring-foreground/10">
              {section === "new" && (
                <List
                  empty="Nobody new."
                  rows={review.added.map((e) => [
                    e.paychexId,
                    `${e.preferredName || e.firstName} ${e.lastName}`,
                    `${e.department ?? "no department"} · ${e.payType} ${rate(e.payType, e.payRate)}`,
                  ])}
                />
              )}
              {section === "changed" && (
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {review.changed.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-muted-foreground">Nothing changed for anyone already in HR.</td>
                      </tr>
                    )}
                    {review.changed.map((c) => (
                      <tr key={c.paychexId} className="border-t border-border/50 align-top first:border-t-0">
                        <td className="px-2 py-1 font-mono text-[0.625rem] text-muted-foreground">{c.paychexId}</td>
                        <td className="px-2 py-1 font-medium whitespace-nowrap">{c.name}</td>
                        <td className="px-2 py-1">
                          {c.fields.map((f) => (
                            <span key={f.field} className="mr-3 inline-block">
                              <span className="text-muted-foreground">{f.field}: </span>
                              <span className="line-through decoration-muted-foreground/60">{f.from}</span>
                              <span className="mx-1 text-muted-foreground">→</span>
                              <span className="font-semibold">{f.to}</span>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {section === "gone" && (
                <List
                  empty="Everyone in HR is still in the file."
                  rows={review.gone.map((e) => [e.paychexId, `${e.firstName} ${e.lastName}`, e.department ?? "no department"])}
                />
              )}
              {section === "same" && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {review.same} {review.same === 1 ? "person is" : "people are"} exactly as HR has them.
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="rounded-sm bg-success-muted px-3 py-1.5 text-xs text-success">
            {result}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {nothingToDo && !result && <span className="mr-auto text-xs text-muted-foreground">Nothing would change.</span>}
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-8 items-center rounded-sm bg-card px-3 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
        >
          {result ? "Close" : "Cancel"}
        </button>
        {!result && (
          <button
            type="button"
            disabled={!preview || blocked || pending || preview.employees.length === 0 || !!nothingToDo}
            onClick={run}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {review
              ? review.first
                ? `Import ${preview!.employees.length} people`
                : `Apply: ${review.added.length} new, ${review.changed.length} changed${review.gone.length ? `, ${review.gone.length} inactive` : ""}`
              : "Import"}
          </button>
        )}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  active,
  onClick,
  tone,
  hint,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: "good" | "warn" | "bad" | "muted";
  hint?: string;
}) {
  const tones = {
    good: "text-success",
    warn: "text-warning-foreground",
    bad: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start rounded-sm bg-card px-3 py-1.5 text-left transition-colors",
        active ? "ring-2 ring-primary" : "ring-1 ring-foreground/10 hover:ring-foreground/30"
      )}
    >
      <span className={cn("text-lg font-bold tabular-nums", value === 0 ? "text-muted-foreground/40" : tones[tone])}>{value}</span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </button>
  );
}

function List({ rows, empty }: { rows: [string, string, string][]; empty: string }) {
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {rows.map(([id, name, detail]) => (
          <tr key={id} className="border-t border-border/50 first:border-t-0">
            <td className="px-2 py-1 font-mono text-[0.625rem] text-muted-foreground">{id}</td>
            <td className="px-2 py-1 font-medium whitespace-nowrap">{name}</td>
            <td className="px-2 py-1 text-muted-foreground">{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
