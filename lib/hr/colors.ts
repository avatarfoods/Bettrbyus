import {
  DEPARTMENT_COLORS as PRODUCTION_COLORS,
  type DepartmentColor,
} from "@/lib/production/department-colors";

/**
 * The HR palette: the production six, then twelve more.
 *
 * Twenty departments cannot share six colours without four of them looking
 * the same on the wall, so HR extends the list. The first six are the
 * production ones, keys included, so a department coloured in production
 * still means the same thing here. The rest are Tailwind's named colours,
 * with a dark-mode wash so they survive the theme switch.
 */
const MORE: DepartmentColor[] = [
  { key: "teal", label: "Teal", spine: "bg-teal-600", tint: "bg-teal-100 dark:bg-teal-900/40", dot: "bg-teal-600" },
  { key: "orange", label: "Orange", spine: "bg-orange-500", tint: "bg-orange-100 dark:bg-orange-900/40", dot: "bg-orange-500" },
  { key: "pink", label: "Pink", spine: "bg-pink-500", tint: "bg-pink-100 dark:bg-pink-900/40", dot: "bg-pink-500" },
  { key: "indigo", label: "Indigo", spine: "bg-indigo-600", tint: "bg-indigo-100 dark:bg-indigo-900/40", dot: "bg-indigo-600" },
  { key: "lime", label: "Lime", spine: "bg-lime-600", tint: "bg-lime-100 dark:bg-lime-900/40", dot: "bg-lime-600" },
  { key: "cyan", label: "Cyan", spine: "bg-cyan-600", tint: "bg-cyan-100 dark:bg-cyan-900/40", dot: "bg-cyan-600" },
  { key: "purple", label: "Purple", spine: "bg-purple-600", tint: "bg-purple-100 dark:bg-purple-900/40", dot: "bg-purple-600" },
  { key: "rose", label: "Rose", spine: "bg-rose-600", tint: "bg-rose-100 dark:bg-rose-900/40", dot: "bg-rose-600" },
  { key: "emerald", label: "Emerald", spine: "bg-emerald-600", tint: "bg-emerald-100 dark:bg-emerald-900/40", dot: "bg-emerald-600" },
  { key: "sky", label: "Sky", spine: "bg-sky-500", tint: "bg-sky-100 dark:bg-sky-900/40", dot: "bg-sky-500" },
  { key: "yellow", label: "Yellow", spine: "bg-yellow-500", tint: "bg-yellow-100 dark:bg-yellow-900/40", dot: "bg-yellow-500" },
  { key: "brown", label: "Brown", spine: "bg-amber-800", tint: "bg-amber-200/60 dark:bg-amber-950/50", dot: "bg-amber-800" },
  { key: "fuchsia", label: "Fuchsia", spine: "bg-fuchsia-600", tint: "bg-fuchsia-100 dark:bg-fuchsia-900/40", dot: "bg-fuchsia-600" },
  { key: "stone", label: "Stone", spine: "bg-stone-500", tint: "bg-stone-200 dark:bg-stone-800/60", dot: "bg-stone-500" },
];

export const HR_COLORS: DepartmentColor[] = [...PRODUCTION_COLORS, ...MORE];

const BY_KEY = new Map(HR_COLORS.map((color) => [color.key, color]));

/**
 * The colour for a department or day type, chosen or inherited.
 *
 * `index` hands the palette out in order to anything nobody has picked for,
 * so twenty departments stay apart from the first render.
 */
export function departmentColor(key: string | null | undefined, index: number): DepartmentColor {
  return (key ? BY_KEY.get(key) : undefined) ?? HR_COLORS[((index % HR_COLORS.length) + HR_COLORS.length) % HR_COLORS.length];
}

export type { DepartmentColor };
