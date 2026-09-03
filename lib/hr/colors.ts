import type { DepartmentColor } from "@/lib/production/department-colors";

/**
 * The HR palette, laid out like a spreadsheet's: one column per colour, from
 * strong at the top to light at the bottom.
 *
 * Twenty departments and a handful of day types cannot share six colours
 * without half of them looking alike on the wall, and Carlos wants to reach
 * for "the light blue" the way he does in Excel. So: thirteen columns, six
 * rows, every one a Tailwind colour with a wash behind it for cells and a
 * solid for bars and dots. Class names are written out in full so the
 * stylesheet is built with all of them.
 *
 * Older keys - "blue", "teal", the production six - still resolve, to the
 * nearest cell, so nothing already coloured changes meaning.
 */
export type ColorColumn = {
  hue: string;
  label: string;
  /** Strong first, light last. */
  shades: DepartmentColor[];
};

export const HR_PALETTE: ColorColumn[] = [
  {
    hue: "red",
    label: "Red",
    shades: [
      { key: "red-800", label: "Red 800", spine: "bg-red-800", tint: "bg-red-800/18 dark:bg-red-800/40", dot: "bg-red-800" },
      { key: "red-600", label: "Red 600", spine: "bg-red-600", tint: "bg-red-600/22 dark:bg-red-600/40", dot: "bg-red-600" },
      { key: "red-500", label: "Red 500", spine: "bg-red-500", tint: "bg-red-500/25 dark:bg-red-500/40", dot: "bg-red-500" },
      { key: "red-400", label: "Red 400", spine: "bg-red-400", tint: "bg-red-400/35 dark:bg-red-400/45", dot: "bg-red-400" },
      { key: "red-300", label: "Red 300", spine: "bg-red-300", tint: "bg-red-300/50 dark:bg-red-300/50", dot: "bg-red-300" },
      { key: "red-200", label: "Red 200", spine: "bg-red-200", tint: "bg-red-200/70 dark:bg-red-200/55", dot: "bg-red-200" },
    ],
  },
  {
    hue: "orange",
    label: "Orange",
    shades: [
      { key: "orange-800", label: "Orange 800", spine: "bg-orange-800", tint: "bg-orange-800/18 dark:bg-orange-800/40", dot: "bg-orange-800" },
      { key: "orange-600", label: "Orange 600", spine: "bg-orange-600", tint: "bg-orange-600/22 dark:bg-orange-600/40", dot: "bg-orange-600" },
      { key: "orange-500", label: "Orange 500", spine: "bg-orange-500", tint: "bg-orange-500/25 dark:bg-orange-500/40", dot: "bg-orange-500" },
      { key: "orange-400", label: "Orange 400", spine: "bg-orange-400", tint: "bg-orange-400/35 dark:bg-orange-400/45", dot: "bg-orange-400" },
      { key: "orange-300", label: "Orange 300", spine: "bg-orange-300", tint: "bg-orange-300/50 dark:bg-orange-300/50", dot: "bg-orange-300" },
      { key: "orange-200", label: "Orange 200", spine: "bg-orange-200", tint: "bg-orange-200/70 dark:bg-orange-200/55", dot: "bg-orange-200" },
    ],
  },
  {
    hue: "amber",
    label: "Amber",
    shades: [
      { key: "amber-800", label: "Amber 800", spine: "bg-amber-800", tint: "bg-amber-800/18 dark:bg-amber-800/40", dot: "bg-amber-800" },
      { key: "amber-600", label: "Amber 600", spine: "bg-amber-600", tint: "bg-amber-600/22 dark:bg-amber-600/40", dot: "bg-amber-600" },
      { key: "amber-500", label: "Amber 500", spine: "bg-amber-500", tint: "bg-amber-500/25 dark:bg-amber-500/40", dot: "bg-amber-500" },
      { key: "amber-400", label: "Amber 400", spine: "bg-amber-400", tint: "bg-amber-400/35 dark:bg-amber-400/45", dot: "bg-amber-400" },
      { key: "amber-300", label: "Amber 300", spine: "bg-amber-300", tint: "bg-amber-300/50 dark:bg-amber-300/50", dot: "bg-amber-300" },
      { key: "amber-200", label: "Amber 200", spine: "bg-amber-200", tint: "bg-amber-200/70 dark:bg-amber-200/55", dot: "bg-amber-200" },
    ],
  },
  {
    hue: "yellow",
    label: "Yellow",
    shades: [
      { key: "yellow-800", label: "Yellow 800", spine: "bg-yellow-800", tint: "bg-yellow-800/18 dark:bg-yellow-800/40", dot: "bg-yellow-800" },
      { key: "yellow-600", label: "Yellow 600", spine: "bg-yellow-600", tint: "bg-yellow-600/22 dark:bg-yellow-600/40", dot: "bg-yellow-600" },
      { key: "yellow-500", label: "Yellow 500", spine: "bg-yellow-500", tint: "bg-yellow-500/25 dark:bg-yellow-500/40", dot: "bg-yellow-500" },
      { key: "yellow-400", label: "Yellow 400", spine: "bg-yellow-400", tint: "bg-yellow-400/35 dark:bg-yellow-400/45", dot: "bg-yellow-400" },
      { key: "yellow-300", label: "Yellow 300", spine: "bg-yellow-300", tint: "bg-yellow-300/50 dark:bg-yellow-300/50", dot: "bg-yellow-300" },
      { key: "yellow-200", label: "Yellow 200", spine: "bg-yellow-200", tint: "bg-yellow-200/70 dark:bg-yellow-200/55", dot: "bg-yellow-200" },
    ],
  },
  {
    hue: "lime",
    label: "Lime",
    shades: [
      { key: "lime-800", label: "Lime 800", spine: "bg-lime-800", tint: "bg-lime-800/18 dark:bg-lime-800/40", dot: "bg-lime-800" },
      { key: "lime-600", label: "Lime 600", spine: "bg-lime-600", tint: "bg-lime-600/22 dark:bg-lime-600/40", dot: "bg-lime-600" },
      { key: "lime-500", label: "Lime 500", spine: "bg-lime-500", tint: "bg-lime-500/25 dark:bg-lime-500/40", dot: "bg-lime-500" },
      { key: "lime-400", label: "Lime 400", spine: "bg-lime-400", tint: "bg-lime-400/35 dark:bg-lime-400/45", dot: "bg-lime-400" },
      { key: "lime-300", label: "Lime 300", spine: "bg-lime-300", tint: "bg-lime-300/50 dark:bg-lime-300/50", dot: "bg-lime-300" },
      { key: "lime-200", label: "Lime 200", spine: "bg-lime-200", tint: "bg-lime-200/70 dark:bg-lime-200/55", dot: "bg-lime-200" },
    ],
  },
  {
    hue: "green",
    label: "Green",
    shades: [
      { key: "green-800", label: "Green 800", spine: "bg-green-800", tint: "bg-green-800/18 dark:bg-green-800/40", dot: "bg-green-800" },
      { key: "green-600", label: "Green 600", spine: "bg-green-600", tint: "bg-green-600/22 dark:bg-green-600/40", dot: "bg-green-600" },
      { key: "green-500", label: "Green 500", spine: "bg-green-500", tint: "bg-green-500/25 dark:bg-green-500/40", dot: "bg-green-500" },
      { key: "green-400", label: "Green 400", spine: "bg-green-400", tint: "bg-green-400/35 dark:bg-green-400/45", dot: "bg-green-400" },
      { key: "green-300", label: "Green 300", spine: "bg-green-300", tint: "bg-green-300/50 dark:bg-green-300/50", dot: "bg-green-300" },
      { key: "green-200", label: "Green 200", spine: "bg-green-200", tint: "bg-green-200/70 dark:bg-green-200/55", dot: "bg-green-200" },
    ],
  },
  {
    hue: "teal",
    label: "Teal",
    shades: [
      { key: "teal-800", label: "Teal 800", spine: "bg-teal-800", tint: "bg-teal-800/18 dark:bg-teal-800/40", dot: "bg-teal-800" },
      { key: "teal-600", label: "Teal 600", spine: "bg-teal-600", tint: "bg-teal-600/22 dark:bg-teal-600/40", dot: "bg-teal-600" },
      { key: "teal-500", label: "Teal 500", spine: "bg-teal-500", tint: "bg-teal-500/25 dark:bg-teal-500/40", dot: "bg-teal-500" },
      { key: "teal-400", label: "Teal 400", spine: "bg-teal-400", tint: "bg-teal-400/35 dark:bg-teal-400/45", dot: "bg-teal-400" },
      { key: "teal-300", label: "Teal 300", spine: "bg-teal-300", tint: "bg-teal-300/50 dark:bg-teal-300/50", dot: "bg-teal-300" },
      { key: "teal-200", label: "Teal 200", spine: "bg-teal-200", tint: "bg-teal-200/70 dark:bg-teal-200/55", dot: "bg-teal-200" },
    ],
  },
  {
    hue: "cyan",
    label: "Cyan",
    shades: [
      { key: "cyan-800", label: "Cyan 800", spine: "bg-cyan-800", tint: "bg-cyan-800/18 dark:bg-cyan-800/40", dot: "bg-cyan-800" },
      { key: "cyan-600", label: "Cyan 600", spine: "bg-cyan-600", tint: "bg-cyan-600/22 dark:bg-cyan-600/40", dot: "bg-cyan-600" },
      { key: "cyan-500", label: "Cyan 500", spine: "bg-cyan-500", tint: "bg-cyan-500/25 dark:bg-cyan-500/40", dot: "bg-cyan-500" },
      { key: "cyan-400", label: "Cyan 400", spine: "bg-cyan-400", tint: "bg-cyan-400/35 dark:bg-cyan-400/45", dot: "bg-cyan-400" },
      { key: "cyan-300", label: "Cyan 300", spine: "bg-cyan-300", tint: "bg-cyan-300/50 dark:bg-cyan-300/50", dot: "bg-cyan-300" },
      { key: "cyan-200", label: "Cyan 200", spine: "bg-cyan-200", tint: "bg-cyan-200/70 dark:bg-cyan-200/55", dot: "bg-cyan-200" },
    ],
  },
  {
    hue: "blue",
    label: "Blue",
    shades: [
      { key: "blue-800", label: "Blue 800", spine: "bg-blue-800", tint: "bg-blue-800/18 dark:bg-blue-800/40", dot: "bg-blue-800" },
      { key: "blue-600", label: "Blue 600", spine: "bg-blue-600", tint: "bg-blue-600/22 dark:bg-blue-600/40", dot: "bg-blue-600" },
      { key: "blue-500", label: "Blue 500", spine: "bg-blue-500", tint: "bg-blue-500/25 dark:bg-blue-500/40", dot: "bg-blue-500" },
      { key: "blue-400", label: "Blue 400", spine: "bg-blue-400", tint: "bg-blue-400/35 dark:bg-blue-400/45", dot: "bg-blue-400" },
      { key: "blue-300", label: "Blue 300", spine: "bg-blue-300", tint: "bg-blue-300/50 dark:bg-blue-300/50", dot: "bg-blue-300" },
      { key: "blue-200", label: "Blue 200", spine: "bg-blue-200", tint: "bg-blue-200/70 dark:bg-blue-200/55", dot: "bg-blue-200" },
    ],
  },
  {
    hue: "indigo",
    label: "Indigo",
    shades: [
      { key: "indigo-800", label: "Indigo 800", spine: "bg-indigo-800", tint: "bg-indigo-800/18 dark:bg-indigo-800/40", dot: "bg-indigo-800" },
      { key: "indigo-600", label: "Indigo 600", spine: "bg-indigo-600", tint: "bg-indigo-600/22 dark:bg-indigo-600/40", dot: "bg-indigo-600" },
      { key: "indigo-500", label: "Indigo 500", spine: "bg-indigo-500", tint: "bg-indigo-500/25 dark:bg-indigo-500/40", dot: "bg-indigo-500" },
      { key: "indigo-400", label: "Indigo 400", spine: "bg-indigo-400", tint: "bg-indigo-400/35 dark:bg-indigo-400/45", dot: "bg-indigo-400" },
      { key: "indigo-300", label: "Indigo 300", spine: "bg-indigo-300", tint: "bg-indigo-300/50 dark:bg-indigo-300/50", dot: "bg-indigo-300" },
      { key: "indigo-200", label: "Indigo 200", spine: "bg-indigo-200", tint: "bg-indigo-200/70 dark:bg-indigo-200/55", dot: "bg-indigo-200" },
    ],
  },
  {
    hue: "violet",
    label: "Violet",
    shades: [
      { key: "violet-800", label: "Violet 800", spine: "bg-violet-800", tint: "bg-violet-800/18 dark:bg-violet-800/40", dot: "bg-violet-800" },
      { key: "violet-600", label: "Violet 600", spine: "bg-violet-600", tint: "bg-violet-600/22 dark:bg-violet-600/40", dot: "bg-violet-600" },
      { key: "violet-500", label: "Violet 500", spine: "bg-violet-500", tint: "bg-violet-500/25 dark:bg-violet-500/40", dot: "bg-violet-500" },
      { key: "violet-400", label: "Violet 400", spine: "bg-violet-400", tint: "bg-violet-400/35 dark:bg-violet-400/45", dot: "bg-violet-400" },
      { key: "violet-300", label: "Violet 300", spine: "bg-violet-300", tint: "bg-violet-300/50 dark:bg-violet-300/50", dot: "bg-violet-300" },
      { key: "violet-200", label: "Violet 200", spine: "bg-violet-200", tint: "bg-violet-200/70 dark:bg-violet-200/55", dot: "bg-violet-200" },
    ],
  },
  {
    hue: "pink",
    label: "Pink",
    shades: [
      { key: "pink-800", label: "Pink 800", spine: "bg-pink-800", tint: "bg-pink-800/18 dark:bg-pink-800/40", dot: "bg-pink-800" },
      { key: "pink-600", label: "Pink 600", spine: "bg-pink-600", tint: "bg-pink-600/22 dark:bg-pink-600/40", dot: "bg-pink-600" },
      { key: "pink-500", label: "Pink 500", spine: "bg-pink-500", tint: "bg-pink-500/25 dark:bg-pink-500/40", dot: "bg-pink-500" },
      { key: "pink-400", label: "Pink 400", spine: "bg-pink-400", tint: "bg-pink-400/35 dark:bg-pink-400/45", dot: "bg-pink-400" },
      { key: "pink-300", label: "Pink 300", spine: "bg-pink-300", tint: "bg-pink-300/50 dark:bg-pink-300/50", dot: "bg-pink-300" },
      { key: "pink-200", label: "Pink 200", spine: "bg-pink-200", tint: "bg-pink-200/70 dark:bg-pink-200/55", dot: "bg-pink-200" },
    ],
  },
  {
    hue: "slate",
    label: "Slate",
    shades: [
      { key: "slate-800", label: "Slate 800", spine: "bg-slate-800", tint: "bg-slate-800/18 dark:bg-slate-800/40", dot: "bg-slate-800" },
      { key: "slate-600", label: "Slate 600", spine: "bg-slate-600", tint: "bg-slate-600/22 dark:bg-slate-600/40", dot: "bg-slate-600" },
      { key: "slate-500", label: "Slate 500", spine: "bg-slate-500", tint: "bg-slate-500/25 dark:bg-slate-500/40", dot: "bg-slate-500" },
      { key: "slate-400", label: "Slate 400", spine: "bg-slate-400", tint: "bg-slate-400/35 dark:bg-slate-400/45", dot: "bg-slate-400" },
      { key: "slate-300", label: "Slate 300", spine: "bg-slate-300", tint: "bg-slate-300/50 dark:bg-slate-300/50", dot: "bg-slate-300" },
      { key: "slate-200", label: "Slate 200", spine: "bg-slate-200", tint: "bg-slate-200/70 dark:bg-slate-200/55", dot: "bg-slate-200" },
    ],
  },
];

/** Every colour, column by column. */
export const HR_COLORS: DepartmentColor[] = HR_PALETTE.flatMap((column) => column.shades);

const BY_KEY = new Map(HR_COLORS.map((color) => [color.key, color]));

/** Keys from before the grid, and the production six, pointed at a cell. */
const LEGACY: Record<string, string> = {
  blue: "blue-600",
  green: "green-600",
  amber: "amber-500",
  red: "red-600",
  violet: "violet-600",
  slate: "slate-500",
  teal: "teal-600",
  orange: "orange-500",
  pink: "pink-500",
  indigo: "indigo-600",
  lime: "lime-600",
  cyan: "cyan-600",
  purple: "violet-600",
  rose: "red-500",
  emerald: "green-500",
  sky: "blue-400",
  yellow: "yellow-500",
  brown: "amber-800",
  fuchsia: "pink-600",
  stone: "slate-500",
};

/**
 * What a department nobody has coloured gets, in order: strong shades first,
 * far apart on the wheel, then the next row, so twenty departments stay apart
 * from the first render.
 */
const HANDOUT = [
  "blue-600", "green-600", "amber-500", "red-600", "violet-600", "teal-600", "orange-500", "pink-500", "indigo-600", "lime-600", "cyan-600", "slate-500",
  "blue-400", "green-400", "amber-400", "red-400", "violet-400", "teal-400", "orange-400", "pink-400", "indigo-400", "lime-400", "cyan-400", "slate-400",
  "blue-800", "green-800", "amber-800", "red-800", "violet-800", "teal-800", "orange-800", "pink-800", "indigo-800", "lime-800", "cyan-800", "slate-800",
];

/**
 * The colour for a department or day type, chosen or inherited.
 *
 * `index` hands the palette out in order to anything nobody has picked for.
 */
export function departmentColor(key: string | null | undefined, index: number): DepartmentColor {
  const resolved = key ? (BY_KEY.get(key) ?? BY_KEY.get(LEGACY[key] ?? "")) : undefined;
  if (resolved) return resolved;
  const handout = HANDOUT[((index % HANDOUT.length) + HANDOUT.length) % HANDOUT.length];
  return BY_KEY.get(handout) ?? HR_COLORS[0];
}

export type { DepartmentColor };
