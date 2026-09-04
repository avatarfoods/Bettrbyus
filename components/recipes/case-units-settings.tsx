"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { saveCaseUnits } from "@/lib/settings/case-units-actions";
import { Hint } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

/**
 * What a case can be counted in.
 *
 * One short list, company-wide, so every specification's "Units per case"
 * dropdown offers the same words: bowl, burrito, cup. It sits here with the
 * other recipe settings rather than in its own page - one more page for six
 * words would be one too many.
 */
export function CaseUnitsSettings({ units: initial }: { units: string[] }) {
  const router = useRouter();
  const [units, setUnits] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = units.join("|") !== initial.join("|");

  function add() {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (units.includes(value)) {
      setDraft("");
      return;
    }
    setUnits([...units, value]);
    setDraft("");
    setSaved(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCaseUnits(units);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-sm bg-card ring-1 ring-foreground/10">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <h2 className="text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
          Case units
        </h2>
        <Hint text="The words offered under Units per case on a specification: a 10/9 oz case is 10 bowls, a family pack is 48 burritos. Add one here and every spec can use it." />
        <span className="ml-auto text-[0.625rem] tabular-nums text-muted-foreground">
          {units.length}
        </span>
      </header>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        {units.map((unit) => (
          <span
            key={unit}
            className="inline-flex items-center gap-1 rounded-sm bg-brand-muted px-2 py-0.5 text-xs font-medium text-primary"
          >
            {unit}
            <button
              type="button"
              onClick={() => {
                setUnits(units.filter((entry) => entry !== unit));
                setSaved(false);
              }}
              aria-label={`Remove ${unit}`}
              className="rounded-sm text-primary/60 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Add a unit…"
            aria-label="New unit"
            className="h-7 w-32 rounded-sm bg-card px-2 text-xs ring-1 ring-foreground/10 focus:ring-1 focus:ring-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            aria-label="Add unit"
            className="inline-flex size-7 items-center justify-center rounded-sm text-primary hover:bg-brand-muted disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </span>
      </div>
      <footer className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
            dirty
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-muted text-muted-foreground"
          )}
        >
          {pending && <Loader2 className="size-3 animate-spin" />}
          Save units
        </button>
        {saved && !dirty && <span className="text-xs text-success">Saved</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </footer>
    </section>
  );
}
