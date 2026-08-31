/**
 * The vocabulary a step is written in.
 *
 * Taken from Carlos's own instruction prototype. Every list here is a closed
 * set on purpose: a step that says "Hobart 60 qt" and one that says "hobart
 * 60qt" are the same machine to a person and two different machines to a
 * report, and the floor card only stays readable if the words on it are the
 * same words every time.
 *
 * The equipment KIND is what makes this work without four different forms:
 * a continuous line has units per hour, a mixer has forward/back/cycles, a
 * cutter has a blade set-up. Choosing the machine chooses the kind, and the
 * kind decides which fields the step even offers.
 */

export type EquipmentKind = "cooking" | "mixing" | "line" | "cutting" | "other";

/** The phase of the recipe a step belongs to. */
export const STAGES = [
  "PREP",
  "SET-UP",
  "LOAD",
  "COOK",
  "MIX",
  "REST",
  "COOL",
  "HOLD",
  "CUT",
  "SORT",
  "WEIGH",
  "FILL",
  "SEAL",
  "CHECK",
  "PACK",
  "TRANSFER",
  "STORE",
  "CHANGEOVER",
  "CLEAN",
  "WASH",
] as const;

export type Stage = (typeof STAGES)[number];

export type Equipment = {
  name: string;
  kind: EquipmentKind;
};

/** Every machine and bench, and what kind of step it runs. */
export const EQUIPMENT: Equipment[] = [
  { name: "Pressure cooker", kind: "cooking" },
  { name: "Nilma pasta cooker", kind: "cooking" },
  { name: "Rational combi oven", kind: "cooking" },
  { name: "Baking cart / oven", kind: "cooking" },
  { name: "IQF tunnel", kind: "cooking" },

  { name: "Pressure cooker paddle", kind: "mixing" },
  { name: "Steel bin mixer 1", kind: "mixing" },
  { name: "Steel bin mixer 2", kind: "mixing" },
  { name: "Hobart 60 qt", kind: "mixing" },
  { name: "Inverter blender", kind: "mixing" },

  { name: "Bettr Assembly line 1", kind: "line" },
  { name: "Bettr Assembly line 2", kind: "line" },
  { name: "Bettr Packaging", kind: "line" },
  { name: "Variovak sealer", kind: "line" },
  { name: "Case packing", kind: "line" },

  { name: "Dicer machine", kind: "cutting" },
  { name: "Urschel wing cutter", kind: "cutting" },
  { name: "Vegetable washer", kind: "cutting" },

  { name: "Sheet pan station", kind: "other" },
  { name: "Bench / by hand", kind: "other" },
];

export const EQUIPMENT_BY_NAME = new Map(
  EQUIPMENT.map((item) => [item.name, item])
);

/** What the machine field is called, which depends on what it is. */
export const EQUIPMENT_LABEL: Record<EquipmentKind, string> = {
  cooking: "Equipment",
  mixing: "Mixer",
  line: "Station",
  cutting: "Machine",
  other: "Equipment",
};

/** Who runs the step. */
export const CREW_ROLES = [
  "Team member",
  "Machine operator",
  "Supervisor",
  "QA tech",
  "Sanitation",
] as const;

/** Things the operator must do before the batch moves on. */
export const CHECKS = [
  { key: "checkWeigh", label: "Weigh", floor: "WEIGH IT" },
  { key: "checkTemperature", label: "Temperature check", floor: "TAKE TEMPERATURE" },
  { key: "checkPhoto", label: "Photo", floor: "TAKE A PHOTO" },
  { key: "checkMetalDetector", label: "Metal detector", floor: "METAL DETECTOR" },
  { key: "checkLabel", label: "Label", floor: "LABEL IT" },
] as const;

export type CheckKey = (typeof CHECKS)[number]["key"];

/** One-line explanations, shown beside the field they belong to. */
export const FIELD_HELP: Record<string, string> = {
  stage: "Which stage of the recipe this step belongs to.",
  body: "Exactly what the operator does, in the order they do it. One action per step.",
  equipment: "Which machine or bench runs this step.",
  setting: "Speed, program or lid position. Write it as it reads on the panel.",
  temperature: "The temperature this step must reach or hold.",
  time: "How long this step runs.",
  batchSize: "How much goes through in one pass.",
  unitsPerHour: "How many units the line puts out in an hour at full speed.",
  weightPerUnit: "Target weight in each bowl or pack.",
  cutSpec: 'Cut and blade set-up — DICE 1/4", WING 2mm.',
  poundsPerHour: "How much this machine gets through in an hour.",
  turnForward: "Seconds the paddle or bin turns forward per cycle.",
  turnBack: "Seconds it turns back per cycle.",
  cycles: "How many times the pattern repeats.",
  speed: "The speed setting on the panel.",
  criticalLimit: "A limit that must be met. Prints boxed on the floor card.",
  correctiveAction: "What to do when the limit is not met.",
  safetyNote: "Gloves, hot surfaces, blades, lockout. Shows in amber on the floor card.",
  crewRole: "Who runs this step.",
};

/** Seconds per unit, worked out from units per hour. */
export function secondsPerUnit(unitsPerHour: number | null): number | null {
  if (!unitsPerHour || unitsPerHour <= 0) return null;
  return 3600 / unitsPerHour;
}

/**
 * Total mixing time from the forward/back/cycles pattern.
 *
 * A bin mixer runs forward, then back, and repeats. The operator is told the
 * pattern; the sheet also has to say how long the whole thing takes, because
 * that is what the schedule is built from.
 */
export function mixingSeconds(
  forward: number | null,
  back: number | null,
  cycles: number | null
): number | null {
  if (!cycles || cycles <= 0) return null;
  const perCycle = (forward ?? 0) + (back ?? 0);
  if (perCycle <= 0) return null;
  return perCycle * cycles;
}

/** Run time for a quantity at a given rate. */
export function runSeconds(
  quantity: number | null,
  perHour: number | null
): number | null {
  if (!quantity || !perHour || perHour <= 0) return null;
  return (quantity / perHour) * 3600;
}

/** Seconds as something a person reads, not a number of seconds. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) {
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours} hr` : `${hours} hr ${restMinutes} min`;
}
