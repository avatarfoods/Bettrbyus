import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ThawWarningBadgeProps = {
  message: string | null;
  className?: string;
};

export function ThawWarningBadge({ message, className }: ThawWarningBadgeProps) {
  if (!message) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300",
        className
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </span>
  );
}

export function hasThawWarning(message: string | null): boolean {
  return message !== null;
}
