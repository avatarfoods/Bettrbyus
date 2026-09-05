/**
 * The colours a department can be given.
 *
 * The plan is read by scanning, not reading: someone looking for Main Kitchen
 * finds the band of colour before they find the word. Which colour means which
 * department therefore has to be theirs to choose - the six here are what the
 * grid already used, so nothing shifts for anyone who never opens the setting.
 *
 * Every entry is a pair of theme tokens rather than a literal, so a colour
 * chosen in daylight still works when the app is in dark mode.
 */
export type DepartmentColor = {
  key: string;
  label: string;
  /** The bar down the left of the group. */
  spine: string;
  /** The wash behind its rows. */
  tint: string;
  /** A filled circle for the picker and the legend. */
  dot: string;
};

export const DEPARTMENT_COLORS: DepartmentColor[] = [
  { key: "blue", label: "Blue", spine: "bg-primary", tint: "bg-brand-muted", dot: "bg-primary" },
  { key: "green", label: "Green", spine: "bg-success", tint: "bg-success/10", dot: "bg-success" },
  { key: "amber", label: "Amber", spine: "bg-warning-foreground", tint: "bg-warning-muted/60", dot: "bg-warning-foreground" },
  { key: "red", label: "Red", spine: "bg-destructive/70", tint: "bg-destructive/8", dot: "bg-destructive/70" },
  { key: "violet", label: "Violet", spine: "bg-accent-foreground/60", tint: "bg-accent/40", dot: "bg-accent-foreground/60" },
  { key: "slate", label: "Slate", spine: "bg-muted-foreground/60", tint: "bg-muted", dot: "bg-muted-foreground/60" },
];

const BY_KEY = new Map(DEPARTMENT_COLORS.map((color) => [color.key, color]));

/**
 * The colour for a department, chosen or inherited.
 *
 * `index` keeps the old behaviour for a department nobody has picked for: the
 * palette in order, so departments stay distinguishable from the first render
 * without anyone configuring anything.
 *
 * The index is wrapped rather than trusted. A recipe with no department yet -
 * every recipe, for the moment between creating it and filling it in - hands
 * this a -1 from a `findIndex` that matched nothing, and `[-1]` is undefined,
 * which took the whole page down rather than showing it without a colour.
 */
export function departmentColor(
  key: string | null | undefined,
  index: number
): DepartmentColor {
  const size = DEPARTMENT_COLORS.length;
  const slot = Number.isFinite(index) ? (((index % size) + size) % size) : 0;
  return (key ? BY_KEY.get(key) : undefined) ?? DEPARTMENT_COLORS[slot];
}
