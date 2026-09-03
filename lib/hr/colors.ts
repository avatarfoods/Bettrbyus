import type { DepartmentColor } from "@/lib/production/department-colors";

/**
 * The HR palette, laid out like a spreadsheet's: one column per colour, from
 * strong at the top to light at the bottom.
 *
 * Departments are offered the cool columns only - greys, blues, greens -
 * because twenty departments in every colour of the wheel look like a party,
 * and Carlos said so. Day types may use the warm columns too: Sick is red,
 * Furlough amber, and that means something. Every cell is a Tailwind colour
 * with a light wash behind it for cells, a solid for bars and dots, and a
 * translucent version for anything wide. Class names are written out in full
 * so the stylesheet is built with all of them.
 *
 * Older keys - "blue", "teal", the production six - still resolve, to the
 * nearest cell, so nothing already coloured changes meaning.
 */
/** A production colour plus a translucent version for wide areas - bars that run across a table. */
export type HrColor = DepartmentColor & { soft: string };

export type ColorColumn = {
  hue: string;
  label: string;
  /** Grey, blue or green: offered to departments. */
  cool: boolean;
  /** Strong first, light last. */
  shades: HrColor[];
};

export const HR_PALETTE: ColorColumn[] = [
  {
    hue: "gray",
    label: "Gray",
    cool: true,
    shades: [
      { key: "gray-800", label: "Gray 800", spine: "bg-gray-800", tint: "bg-gray-800/12 dark:bg-gray-800/30", dot: "bg-gray-800", soft: "bg-gray-800/35 dark:bg-gray-800/45" },
      { key: "gray-600", label: "Gray 600", spine: "bg-gray-600", tint: "bg-gray-600/14 dark:bg-gray-600/32", dot: "bg-gray-600", soft: "bg-gray-600/35 dark:bg-gray-600/45" },
      { key: "gray-500", label: "Gray 500", spine: "bg-gray-500", tint: "bg-gray-500/16 dark:bg-gray-500/34", dot: "bg-gray-500", soft: "bg-gray-500/35 dark:bg-gray-500/45" },
      { key: "gray-400", label: "Gray 400", spine: "bg-gray-400", tint: "bg-gray-400/22 dark:bg-gray-400/38", dot: "bg-gray-400", soft: "bg-gray-400/35 dark:bg-gray-400/45" },
      { key: "gray-300", label: "Gray 300", spine: "bg-gray-300", tint: "bg-gray-300/32 dark:bg-gray-300/42", dot: "bg-gray-300", soft: "bg-gray-300/35 dark:bg-gray-300/45" },
      { key: "gray-200", label: "Gray 200", spine: "bg-gray-200", tint: "bg-gray-200/45 dark:bg-gray-200/48", dot: "bg-gray-200", soft: "bg-gray-200/35 dark:bg-gray-200/45" },
    ],
  },
  {
    hue: "slate",
    label: "Slate",
    cool: true,
    shades: [
      { key: "slate-800", label: "Slate 800", spine: "bg-slate-800", tint: "bg-slate-800/12 dark:bg-slate-800/30", dot: "bg-slate-800", soft: "bg-slate-800/35 dark:bg-slate-800/45" },
      { key: "slate-600", label: "Slate 600", spine: "bg-slate-600", tint: "bg-slate-600/14 dark:bg-slate-600/32", dot: "bg-slate-600", soft: "bg-slate-600/35 dark:bg-slate-600/45" },
      { key: "slate-500", label: "Slate 500", spine: "bg-slate-500", tint: "bg-slate-500/16 dark:bg-slate-500/34", dot: "bg-slate-500", soft: "bg-slate-500/35 dark:bg-slate-500/45" },
      { key: "slate-400", label: "Slate 400", spine: "bg-slate-400", tint: "bg-slate-400/22 dark:bg-slate-400/38", dot: "bg-slate-400", soft: "bg-slate-400/35 dark:bg-slate-400/45" },
      { key: "slate-300", label: "Slate 300", spine: "bg-slate-300", tint: "bg-slate-300/32 dark:bg-slate-300/42", dot: "bg-slate-300", soft: "bg-slate-300/35 dark:bg-slate-300/45" },
      { key: "slate-200", label: "Slate 200", spine: "bg-slate-200", tint: "bg-slate-200/45 dark:bg-slate-200/48", dot: "bg-slate-200", soft: "bg-slate-200/35 dark:bg-slate-200/45" },
    ],
  },
  {
    hue: "blue",
    label: "Blue",
    cool: true,
    shades: [
      { key: "blue-800", label: "Blue 800", spine: "bg-blue-800", tint: "bg-blue-800/12 dark:bg-blue-800/30", dot: "bg-blue-800", soft: "bg-blue-800/35 dark:bg-blue-800/45" },
      { key: "blue-600", label: "Blue 600", spine: "bg-blue-600", tint: "bg-blue-600/14 dark:bg-blue-600/32", dot: "bg-blue-600", soft: "bg-blue-600/35 dark:bg-blue-600/45" },
      { key: "blue-500", label: "Blue 500", spine: "bg-blue-500", tint: "bg-blue-500/16 dark:bg-blue-500/34", dot: "bg-blue-500", soft: "bg-blue-500/35 dark:bg-blue-500/45" },
      { key: "blue-400", label: "Blue 400", spine: "bg-blue-400", tint: "bg-blue-400/22 dark:bg-blue-400/38", dot: "bg-blue-400", soft: "bg-blue-400/35 dark:bg-blue-400/45" },
      { key: "blue-300", label: "Blue 300", spine: "bg-blue-300", tint: "bg-blue-300/32 dark:bg-blue-300/42", dot: "bg-blue-300", soft: "bg-blue-300/35 dark:bg-blue-300/45" },
      { key: "blue-200", label: "Blue 200", spine: "bg-blue-200", tint: "bg-blue-200/45 dark:bg-blue-200/48", dot: "bg-blue-200", soft: "bg-blue-200/35 dark:bg-blue-200/45" },
    ],
  },
  {
    hue: "sky",
    label: "Sky",
    cool: true,
    shades: [
      { key: "sky-800", label: "Sky 800", spine: "bg-sky-800", tint: "bg-sky-800/12 dark:bg-sky-800/30", dot: "bg-sky-800", soft: "bg-sky-800/35 dark:bg-sky-800/45" },
      { key: "sky-600", label: "Sky 600", spine: "bg-sky-600", tint: "bg-sky-600/14 dark:bg-sky-600/32", dot: "bg-sky-600", soft: "bg-sky-600/35 dark:bg-sky-600/45" },
      { key: "sky-500", label: "Sky 500", spine: "bg-sky-500", tint: "bg-sky-500/16 dark:bg-sky-500/34", dot: "bg-sky-500", soft: "bg-sky-500/35 dark:bg-sky-500/45" },
      { key: "sky-400", label: "Sky 400", spine: "bg-sky-400", tint: "bg-sky-400/22 dark:bg-sky-400/38", dot: "bg-sky-400", soft: "bg-sky-400/35 dark:bg-sky-400/45" },
      { key: "sky-300", label: "Sky 300", spine: "bg-sky-300", tint: "bg-sky-300/32 dark:bg-sky-300/42", dot: "bg-sky-300", soft: "bg-sky-300/35 dark:bg-sky-300/45" },
      { key: "sky-200", label: "Sky 200", spine: "bg-sky-200", tint: "bg-sky-200/45 dark:bg-sky-200/48", dot: "bg-sky-200", soft: "bg-sky-200/35 dark:bg-sky-200/45" },
    ],
  },
  {
    hue: "cyan",
    label: "Cyan",
    cool: true,
    shades: [
      { key: "cyan-800", label: "Cyan 800", spine: "bg-cyan-800", tint: "bg-cyan-800/12 dark:bg-cyan-800/30", dot: "bg-cyan-800", soft: "bg-cyan-800/35 dark:bg-cyan-800/45" },
      { key: "cyan-600", label: "Cyan 600", spine: "bg-cyan-600", tint: "bg-cyan-600/14 dark:bg-cyan-600/32", dot: "bg-cyan-600", soft: "bg-cyan-600/35 dark:bg-cyan-600/45" },
      { key: "cyan-500", label: "Cyan 500", spine: "bg-cyan-500", tint: "bg-cyan-500/16 dark:bg-cyan-500/34", dot: "bg-cyan-500", soft: "bg-cyan-500/35 dark:bg-cyan-500/45" },
      { key: "cyan-400", label: "Cyan 400", spine: "bg-cyan-400", tint: "bg-cyan-400/22 dark:bg-cyan-400/38", dot: "bg-cyan-400", soft: "bg-cyan-400/35 dark:bg-cyan-400/45" },
      { key: "cyan-300", label: "Cyan 300", spine: "bg-cyan-300", tint: "bg-cyan-300/32 dark:bg-cyan-300/42", dot: "bg-cyan-300", soft: "bg-cyan-300/35 dark:bg-cyan-300/45" },
      { key: "cyan-200", label: "Cyan 200", spine: "bg-cyan-200", tint: "bg-cyan-200/45 dark:bg-cyan-200/48", dot: "bg-cyan-200", soft: "bg-cyan-200/35 dark:bg-cyan-200/45" },
    ],
  },
  {
    hue: "teal",
    label: "Teal",
    cool: true,
    shades: [
      { key: "teal-800", label: "Teal 800", spine: "bg-teal-800", tint: "bg-teal-800/12 dark:bg-teal-800/30", dot: "bg-teal-800", soft: "bg-teal-800/35 dark:bg-teal-800/45" },
      { key: "teal-600", label: "Teal 600", spine: "bg-teal-600", tint: "bg-teal-600/14 dark:bg-teal-600/32", dot: "bg-teal-600", soft: "bg-teal-600/35 dark:bg-teal-600/45" },
      { key: "teal-500", label: "Teal 500", spine: "bg-teal-500", tint: "bg-teal-500/16 dark:bg-teal-500/34", dot: "bg-teal-500", soft: "bg-teal-500/35 dark:bg-teal-500/45" },
      { key: "teal-400", label: "Teal 400", spine: "bg-teal-400", tint: "bg-teal-400/22 dark:bg-teal-400/38", dot: "bg-teal-400", soft: "bg-teal-400/35 dark:bg-teal-400/45" },
      { key: "teal-300", label: "Teal 300", spine: "bg-teal-300", tint: "bg-teal-300/32 dark:bg-teal-300/42", dot: "bg-teal-300", soft: "bg-teal-300/35 dark:bg-teal-300/45" },
      { key: "teal-200", label: "Teal 200", spine: "bg-teal-200", tint: "bg-teal-200/45 dark:bg-teal-200/48", dot: "bg-teal-200", soft: "bg-teal-200/35 dark:bg-teal-200/45" },
    ],
  },
  {
    hue: "emerald",
    label: "Emerald",
    cool: true,
    shades: [
      { key: "emerald-800", label: "Emerald 800", spine: "bg-emerald-800", tint: "bg-emerald-800/12 dark:bg-emerald-800/30", dot: "bg-emerald-800", soft: "bg-emerald-800/35 dark:bg-emerald-800/45" },
      { key: "emerald-600", label: "Emerald 600", spine: "bg-emerald-600", tint: "bg-emerald-600/14 dark:bg-emerald-600/32", dot: "bg-emerald-600", soft: "bg-emerald-600/35 dark:bg-emerald-600/45" },
      { key: "emerald-500", label: "Emerald 500", spine: "bg-emerald-500", tint: "bg-emerald-500/16 dark:bg-emerald-500/34", dot: "bg-emerald-500", soft: "bg-emerald-500/35 dark:bg-emerald-500/45" },
      { key: "emerald-400", label: "Emerald 400", spine: "bg-emerald-400", tint: "bg-emerald-400/22 dark:bg-emerald-400/38", dot: "bg-emerald-400", soft: "bg-emerald-400/35 dark:bg-emerald-400/45" },
      { key: "emerald-300", label: "Emerald 300", spine: "bg-emerald-300", tint: "bg-emerald-300/32 dark:bg-emerald-300/42", dot: "bg-emerald-300", soft: "bg-emerald-300/35 dark:bg-emerald-300/45" },
      { key: "emerald-200", label: "Emerald 200", spine: "bg-emerald-200", tint: "bg-emerald-200/45 dark:bg-emerald-200/48", dot: "bg-emerald-200", soft: "bg-emerald-200/35 dark:bg-emerald-200/45" },
    ],
  },
  {
    hue: "green",
    label: "Green",
    cool: true,
    shades: [
      { key: "green-800", label: "Green 800", spine: "bg-green-800", tint: "bg-green-800/12 dark:bg-green-800/30", dot: "bg-green-800", soft: "bg-green-800/35 dark:bg-green-800/45" },
      { key: "green-600", label: "Green 600", spine: "bg-green-600", tint: "bg-green-600/14 dark:bg-green-600/32", dot: "bg-green-600", soft: "bg-green-600/35 dark:bg-green-600/45" },
      { key: "green-500", label: "Green 500", spine: "bg-green-500", tint: "bg-green-500/16 dark:bg-green-500/34", dot: "bg-green-500", soft: "bg-green-500/35 dark:bg-green-500/45" },
      { key: "green-400", label: "Green 400", spine: "bg-green-400", tint: "bg-green-400/22 dark:bg-green-400/38", dot: "bg-green-400", soft: "bg-green-400/35 dark:bg-green-400/45" },
      { key: "green-300", label: "Green 300", spine: "bg-green-300", tint: "bg-green-300/32 dark:bg-green-300/42", dot: "bg-green-300", soft: "bg-green-300/35 dark:bg-green-300/45" },
      { key: "green-200", label: "Green 200", spine: "bg-green-200", tint: "bg-green-200/45 dark:bg-green-200/48", dot: "bg-green-200", soft: "bg-green-200/35 dark:bg-green-200/45" },
    ],
  },
  {
    hue: "indigo",
    label: "Indigo",
    cool: true,
    shades: [
      { key: "indigo-800", label: "Indigo 800", spine: "bg-indigo-800", tint: "bg-indigo-800/12 dark:bg-indigo-800/30", dot: "bg-indigo-800", soft: "bg-indigo-800/35 dark:bg-indigo-800/45" },
      { key: "indigo-600", label: "Indigo 600", spine: "bg-indigo-600", tint: "bg-indigo-600/14 dark:bg-indigo-600/32", dot: "bg-indigo-600", soft: "bg-indigo-600/35 dark:bg-indigo-600/45" },
      { key: "indigo-500", label: "Indigo 500", spine: "bg-indigo-500", tint: "bg-indigo-500/16 dark:bg-indigo-500/34", dot: "bg-indigo-500", soft: "bg-indigo-500/35 dark:bg-indigo-500/45" },
      { key: "indigo-400", label: "Indigo 400", spine: "bg-indigo-400", tint: "bg-indigo-400/22 dark:bg-indigo-400/38", dot: "bg-indigo-400", soft: "bg-indigo-400/35 dark:bg-indigo-400/45" },
      { key: "indigo-300", label: "Indigo 300", spine: "bg-indigo-300", tint: "bg-indigo-300/32 dark:bg-indigo-300/42", dot: "bg-indigo-300", soft: "bg-indigo-300/35 dark:bg-indigo-300/45" },
      { key: "indigo-200", label: "Indigo 200", spine: "bg-indigo-200", tint: "bg-indigo-200/45 dark:bg-indigo-200/48", dot: "bg-indigo-200", soft: "bg-indigo-200/35 dark:bg-indigo-200/45" },
    ],
  },
  {
    hue: "violet",
    label: "Violet",
    cool: false,
    shades: [
      { key: "violet-800", label: "Violet 800", spine: "bg-violet-800", tint: "bg-violet-800/12 dark:bg-violet-800/30", dot: "bg-violet-800", soft: "bg-violet-800/35 dark:bg-violet-800/45" },
      { key: "violet-600", label: "Violet 600", spine: "bg-violet-600", tint: "bg-violet-600/14 dark:bg-violet-600/32", dot: "bg-violet-600", soft: "bg-violet-600/35 dark:bg-violet-600/45" },
      { key: "violet-500", label: "Violet 500", spine: "bg-violet-500", tint: "bg-violet-500/16 dark:bg-violet-500/34", dot: "bg-violet-500", soft: "bg-violet-500/35 dark:bg-violet-500/45" },
      { key: "violet-400", label: "Violet 400", spine: "bg-violet-400", tint: "bg-violet-400/22 dark:bg-violet-400/38", dot: "bg-violet-400", soft: "bg-violet-400/35 dark:bg-violet-400/45" },
      { key: "violet-300", label: "Violet 300", spine: "bg-violet-300", tint: "bg-violet-300/32 dark:bg-violet-300/42", dot: "bg-violet-300", soft: "bg-violet-300/35 dark:bg-violet-300/45" },
      { key: "violet-200", label: "Violet 200", spine: "bg-violet-200", tint: "bg-violet-200/45 dark:bg-violet-200/48", dot: "bg-violet-200", soft: "bg-violet-200/35 dark:bg-violet-200/45" },
    ],
  },
  {
    hue: "pink",
    label: "Pink",
    cool: false,
    shades: [
      { key: "pink-800", label: "Pink 800", spine: "bg-pink-800", tint: "bg-pink-800/12 dark:bg-pink-800/30", dot: "bg-pink-800", soft: "bg-pink-800/35 dark:bg-pink-800/45" },
      { key: "pink-600", label: "Pink 600", spine: "bg-pink-600", tint: "bg-pink-600/14 dark:bg-pink-600/32", dot: "bg-pink-600", soft: "bg-pink-600/35 dark:bg-pink-600/45" },
      { key: "pink-500", label: "Pink 500", spine: "bg-pink-500", tint: "bg-pink-500/16 dark:bg-pink-500/34", dot: "bg-pink-500", soft: "bg-pink-500/35 dark:bg-pink-500/45" },
      { key: "pink-400", label: "Pink 400", spine: "bg-pink-400", tint: "bg-pink-400/22 dark:bg-pink-400/38", dot: "bg-pink-400", soft: "bg-pink-400/35 dark:bg-pink-400/45" },
      { key: "pink-300", label: "Pink 300", spine: "bg-pink-300", tint: "bg-pink-300/32 dark:bg-pink-300/42", dot: "bg-pink-300", soft: "bg-pink-300/35 dark:bg-pink-300/45" },
      { key: "pink-200", label: "Pink 200", spine: "bg-pink-200", tint: "bg-pink-200/45 dark:bg-pink-200/48", dot: "bg-pink-200", soft: "bg-pink-200/35 dark:bg-pink-200/45" },
    ],
  },
  {
    hue: "red",
    label: "Red",
    cool: false,
    shades: [
      { key: "red-800", label: "Red 800", spine: "bg-red-800", tint: "bg-red-800/12 dark:bg-red-800/30", dot: "bg-red-800", soft: "bg-red-800/35 dark:bg-red-800/45" },
      { key: "red-600", label: "Red 600", spine: "bg-red-600", tint: "bg-red-600/14 dark:bg-red-600/32", dot: "bg-red-600", soft: "bg-red-600/35 dark:bg-red-600/45" },
      { key: "red-500", label: "Red 500", spine: "bg-red-500", tint: "bg-red-500/16 dark:bg-red-500/34", dot: "bg-red-500", soft: "bg-red-500/35 dark:bg-red-500/45" },
      { key: "red-400", label: "Red 400", spine: "bg-red-400", tint: "bg-red-400/22 dark:bg-red-400/38", dot: "bg-red-400", soft: "bg-red-400/35 dark:bg-red-400/45" },
      { key: "red-300", label: "Red 300", spine: "bg-red-300", tint: "bg-red-300/32 dark:bg-red-300/42", dot: "bg-red-300", soft: "bg-red-300/35 dark:bg-red-300/45" },
      { key: "red-200", label: "Red 200", spine: "bg-red-200", tint: "bg-red-200/45 dark:bg-red-200/48", dot: "bg-red-200", soft: "bg-red-200/35 dark:bg-red-200/45" },
    ],
  },
  {
    hue: "orange",
    label: "Orange",
    cool: false,
    shades: [
      { key: "orange-800", label: "Orange 800", spine: "bg-orange-800", tint: "bg-orange-800/12 dark:bg-orange-800/30", dot: "bg-orange-800", soft: "bg-orange-800/35 dark:bg-orange-800/45" },
      { key: "orange-600", label: "Orange 600", spine: "bg-orange-600", tint: "bg-orange-600/14 dark:bg-orange-600/32", dot: "bg-orange-600", soft: "bg-orange-600/35 dark:bg-orange-600/45" },
      { key: "orange-500", label: "Orange 500", spine: "bg-orange-500", tint: "bg-orange-500/16 dark:bg-orange-500/34", dot: "bg-orange-500", soft: "bg-orange-500/35 dark:bg-orange-500/45" },
      { key: "orange-400", label: "Orange 400", spine: "bg-orange-400", tint: "bg-orange-400/22 dark:bg-orange-400/38", dot: "bg-orange-400", soft: "bg-orange-400/35 dark:bg-orange-400/45" },
      { key: "orange-300", label: "Orange 300", spine: "bg-orange-300", tint: "bg-orange-300/32 dark:bg-orange-300/42", dot: "bg-orange-300", soft: "bg-orange-300/35 dark:bg-orange-300/45" },
      { key: "orange-200", label: "Orange 200", spine: "bg-orange-200", tint: "bg-orange-200/45 dark:bg-orange-200/48", dot: "bg-orange-200", soft: "bg-orange-200/35 dark:bg-orange-200/45" },
    ],
  },
  {
    hue: "amber",
    label: "Amber",
    cool: false,
    shades: [
      { key: "amber-800", label: "Amber 800", spine: "bg-amber-800", tint: "bg-amber-800/12 dark:bg-amber-800/30", dot: "bg-amber-800", soft: "bg-amber-800/35 dark:bg-amber-800/45" },
      { key: "amber-600", label: "Amber 600", spine: "bg-amber-600", tint: "bg-amber-600/14 dark:bg-amber-600/32", dot: "bg-amber-600", soft: "bg-amber-600/35 dark:bg-amber-600/45" },
      { key: "amber-500", label: "Amber 500", spine: "bg-amber-500", tint: "bg-amber-500/16 dark:bg-amber-500/34", dot: "bg-amber-500", soft: "bg-amber-500/35 dark:bg-amber-500/45" },
      { key: "amber-400", label: "Amber 400", spine: "bg-amber-400", tint: "bg-amber-400/22 dark:bg-amber-400/38", dot: "bg-amber-400", soft: "bg-amber-400/35 dark:bg-amber-400/45" },
      { key: "amber-300", label: "Amber 300", spine: "bg-amber-300", tint: "bg-amber-300/32 dark:bg-amber-300/42", dot: "bg-amber-300", soft: "bg-amber-300/35 dark:bg-amber-300/45" },
      { key: "amber-200", label: "Amber 200", spine: "bg-amber-200", tint: "bg-amber-200/45 dark:bg-amber-200/48", dot: "bg-amber-200", soft: "bg-amber-200/35 dark:bg-amber-200/45" },
    ],
  },
  {
    hue: "yellow",
    label: "Yellow",
    cool: false,
    shades: [
      { key: "yellow-800", label: "Yellow 800", spine: "bg-yellow-800", tint: "bg-yellow-800/12 dark:bg-yellow-800/30", dot: "bg-yellow-800", soft: "bg-yellow-800/35 dark:bg-yellow-800/45" },
      { key: "yellow-600", label: "Yellow 600", spine: "bg-yellow-600", tint: "bg-yellow-600/14 dark:bg-yellow-600/32", dot: "bg-yellow-600", soft: "bg-yellow-600/35 dark:bg-yellow-600/45" },
      { key: "yellow-500", label: "Yellow 500", spine: "bg-yellow-500", tint: "bg-yellow-500/16 dark:bg-yellow-500/34", dot: "bg-yellow-500", soft: "bg-yellow-500/35 dark:bg-yellow-500/45" },
      { key: "yellow-400", label: "Yellow 400", spine: "bg-yellow-400", tint: "bg-yellow-400/22 dark:bg-yellow-400/38", dot: "bg-yellow-400", soft: "bg-yellow-400/35 dark:bg-yellow-400/45" },
      { key: "yellow-300", label: "Yellow 300", spine: "bg-yellow-300", tint: "bg-yellow-300/32 dark:bg-yellow-300/42", dot: "bg-yellow-300", soft: "bg-yellow-300/35 dark:bg-yellow-300/45" },
      { key: "yellow-200", label: "Yellow 200", spine: "bg-yellow-200", tint: "bg-yellow-200/45 dark:bg-yellow-200/48", dot: "bg-yellow-200", soft: "bg-yellow-200/35 dark:bg-yellow-200/45" },
    ],
  },
  {
    hue: "lime",
    label: "Lime",
    cool: false,
    shades: [
      { key: "lime-800", label: "Lime 800", spine: "bg-lime-800", tint: "bg-lime-800/12 dark:bg-lime-800/30", dot: "bg-lime-800", soft: "bg-lime-800/35 dark:bg-lime-800/45" },
      { key: "lime-600", label: "Lime 600", spine: "bg-lime-600", tint: "bg-lime-600/14 dark:bg-lime-600/32", dot: "bg-lime-600", soft: "bg-lime-600/35 dark:bg-lime-600/45" },
      { key: "lime-500", label: "Lime 500", spine: "bg-lime-500", tint: "bg-lime-500/16 dark:bg-lime-500/34", dot: "bg-lime-500", soft: "bg-lime-500/35 dark:bg-lime-500/45" },
      { key: "lime-400", label: "Lime 400", spine: "bg-lime-400", tint: "bg-lime-400/22 dark:bg-lime-400/38", dot: "bg-lime-400", soft: "bg-lime-400/35 dark:bg-lime-400/45" },
      { key: "lime-300", label: "Lime 300", spine: "bg-lime-300", tint: "bg-lime-300/32 dark:bg-lime-300/42", dot: "bg-lime-300", soft: "bg-lime-300/35 dark:bg-lime-300/45" },
      { key: "lime-200", label: "Lime 200", spine: "bg-lime-200", tint: "bg-lime-200/45 dark:bg-lime-200/48", dot: "bg-lime-200", soft: "bg-lime-200/35 dark:bg-lime-200/45" },
    ],
  },
];

/** The columns a department may be coloured from. */
export const DEPARTMENT_PALETTE: ColorColumn[] = HR_PALETTE.filter((column) => column.cool);

/** Every colour, column by column. */
export const HR_COLORS: HrColor[] = HR_PALETTE.flatMap((column) => column.shades);

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
  emerald: "emerald-500",
  sky: "sky-400",
  yellow: "yellow-500",
  brown: "amber-800",
  fuchsia: "pink-600",
  stone: "gray-500",
};

/**
 * What a department nobody has coloured gets, in order: cool colours only,
 * the middle row first and far apart, then stronger, then lighter - so twenty
 * departments stay apart from the first render without anyone going nuts.
 */
const HANDOUT = [
  "blue-500", "emerald-500", "slate-500", "teal-500", "indigo-500", "green-500", "cyan-500", "gray-500", "sky-500",
  "blue-700", "emerald-700", "slate-700", "teal-700", "indigo-700", "green-700", "cyan-700", "gray-700", "sky-700",
  "blue-300", "emerald-300", "slate-300", "teal-300", "indigo-300", "green-300", "cyan-300", "gray-300", "sky-300",
];

/**
 * The colour for a department or day type, chosen or inherited.
 *
 * `index` hands the palette out in order to anything nobody has picked for.
 */
export function departmentColor(key: string | null | undefined, index: number): HrColor {
  const resolved = key ? (BY_KEY.get(key) ?? BY_KEY.get(LEGACY[key] ?? "")) : undefined;
  if (resolved) return resolved;
  const handout = HANDOUT[((index % HANDOUT.length) + HANDOUT.length) % HANDOUT.length];
  return BY_KEY.get(handout) ?? BY_KEY.get(nearest(handout)) ?? HR_COLORS[0];
}

/** A 700 is not in the grid; the 800 beside it is. */
function nearest(key: string): string {
  return key.replace(/-700$/, "-800");
}

export type { DepartmentColor };
