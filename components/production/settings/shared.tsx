"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Plus, X } from "lucide-react";
import type { ConfigResult } from "@/lib/production/config-actions";
import { cn } from "@/lib/utils";

/**
 * Pieces shared by every Production settings screen.
 *
 * Each setting gets its own page rather than a tab inside one giant screen -
 * there will be many of these, and a growing tab strip stops working long
 * before a growing menu does.
 */

export const inputClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring";

export const ghostButton =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted";

export const primaryButton =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60";

export type Runner = (
  action: () => Promise<ConfigResult>,
  okText: string
) => void;

/** Runs an action and reports the outcome in one banner. */
export function useConfigRunner() {
  const [notice, setNotice] = useState<
    { tone: "ok" | "bad"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const run: Runner = (action, okText) => {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      setNotice(
        result.ok
          ? { tone: "ok", text: okText }
          : { tone: "bad", text: result.message }
      );
    });
  };

  return { run, pending, notice };
}

export function Notice({
  notice,
}: {
  notice: { tone: "ok" | "bad"; text: string } | null;
}) {
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "bad" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md px-3 py-2 text-sm",
        notice.tone === "ok"
          ? "bg-success-muted text-success"
          : "bg-destructive/10 text-destructive"
      )}
    >
      {notice.tone === "ok" ? (
        <Check className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      )}
      {notice.text}
    </div>
  );
}

/** Shown when the tables are missing, so edits silently going nowhere cannot surprise anyone. */
export function FallbackBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>
        These tables do not exist yet, so the app is running on built-in
        defaults and nothing saved here will stick. Run the{" "}
        <code>20260828_production_lines</code> migration first.
      </span>
    </div>
  );
}

export function SettingsPage({
  intro,
  children,
}: {
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Settings pages are worked in, not read. The explanation earns one
    // narrow column of small text at the top and no more; the controls get
    // the rest of the screen.
    <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {intro}
      </p>
      {children}
    </div>
  );
}

export function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground/40"
        )}
      />
      {active ? "Active" : "Off"}
    </span>
  );
}

export function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[0.6875rem] transition-colors disabled:opacity-40",
        danger
          ? "border-border text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Plus className="size-3.5" />
      {children}
    </button>
  );
}

export function EditorActions({
  pending,
  disabled,
  saveLabel,
  onCancel,
  onSave,
}: {
  pending: boolean;
  disabled?: boolean;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className={ghostButton}>
        <X className="size-3.5" />
        Cancel
      </button>
      <button
        type="button"
        disabled={pending || disabled}
        onClick={onSave}
        className={primaryButton}
      >
        {saveLabel}
      </button>
    </div>
  );
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
