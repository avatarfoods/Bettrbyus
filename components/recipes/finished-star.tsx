import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mark on a finished product.
 *
 * A finished product is the only kind of recipe the plan cascades FROM, so
 * telling one apart from the two hundred that hang beneath it is the single
 * most useful thing a list can do. Colour alone was not enough - it competes
 * with the department colours everywhere else - so it gets a shape, and the
 * same shape in every place a recipe is named.
 */
export function FinishedStar({ className }: { className?: string }) {
  return (
    <Star
      aria-label="Finished product"
      className={cn(
        "inline-block size-3.5 shrink-0 fill-primary/90 text-primary",
        className
      )}
    />
  );
}
