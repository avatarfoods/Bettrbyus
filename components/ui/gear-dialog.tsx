"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hint } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The gear, and the window it opens.
 *
 * Every page's gear looks the same and opens the same thing: a small window
 * in the middle with a title, a line saying what is in it, and a short list
 * of rows - links or actions - each with a "?" for what it does. A recipe's
 * gear, the plan's gear and the recipes list's gear are the same object.
 */

export function GearButton({
  onClick,
  title,
  label = "Settings",
  className,
}: {
  onClick: () => void;
  title: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Settings2 className="size-4" />
    </button>
  );
}

export function GearDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>
              {description} Tap <span className="font-semibold">?</span> on any of
              them to see what it does.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-1.5">{children}</div>
        {error && (
          <p className="rounded-sm bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ROW =
  "flex items-center gap-2 rounded-sm bg-card px-2.5 py-2 text-left text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-brand-muted";

export function GearLink({
  href,
  icon,
  title,
  hint,
  onClick,
}: {
  href: string;
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Link href={href} onClick={onClick} className={cn(ROW, "min-w-0 flex-1")}>
        {icon && <span className="shrink-0 text-primary [&>svg]:size-4">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </Link>
      {hint && <Hint text={hint} />}
    </span>
  );
}

export function GearAction({
  icon,
  title,
  hint,
  danger,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          ROW,
          "min-w-0 flex-1 disabled:opacity-40",
          danger && "text-destructive ring-destructive/30 hover:bg-destructive/10"
        )}
      >
        {icon && (
          <span
            className={cn(
              "shrink-0 [&>svg]:size-4",
              danger ? "text-destructive" : "text-primary"
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {hint && <Hint text={hint} />}
    </span>
  );
}
