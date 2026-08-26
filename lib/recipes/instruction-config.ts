/** Shared configs for the Instructions tab, cost math, and printable batch sheet. */

export const LABOR_RATE_PER_HOUR = 20;

export const CREW_ROLES = [
  "Team member",
  "Machine operator",
  "Supervisor",
  "QA tech",
  "Sanitation",
] as const;

export type CrewRole = (typeof CREW_ROLES)[number];

export const STEP_MODES = [
  ["batch", "Cooking"],
  ["mix", "Mixing"],
  ["line", "Line — continuous"],
  ["prep", "Cutting / prep"],
] as const;

export type StepMode = (typeof STEP_MODES)[number][0];

export const STAGE_TYPES = {
  batch: ["PREP", "COOK", "COOL", "HOLD", "CLEAN"],
  mix: ["LOAD", "MIX", "REST", "TRANSFER"],
  line: ["SET-UP", "FILL", "SEAL", "CHECK", "PACK", "CHANGEOVER"],
  prep: ["WASH", "CUT", "SORT", "WEIGH", "STORE"],
} as const satisfies Record<StepMode, readonly string[]>;

export type StageType = (typeof STAGE_TYPES)[StepMode][number];

export const BATCH_EQUIPMENT = [
  "Pressure cooker",
  "Nilma pasta cooker",
  "Rational combi oven",
  "IQF tunnel",
  "Sheet pan station",
  "Baking cart / oven",
  "Bench / by hand",
] as const;

export const MIXERS = [
  "Pressure cooker paddle",
  "Steel bin mixer 1",
  "Steel bin mixer 2",
  "Hobart 60 qt",
  "Inverter blender",
] as const;

export const LINE_STATIONS = [
  "Bettr Assembly line 1",
  "Bettr Assembly line 2",
  "Bettr Packaging",
  "Variovak sealer",
  "Case packing",
] as const;

export const PREP_MACHINES = [
  "Dicer machine",
  "Urschel wing cutter",
  "Vegetable washer",
  "Bench / by hand",
] as const;

export const EQUIPMENT_BY_MODE = {
  batch: BATCH_EQUIPMENT,
  mix: MIXERS,
  line: LINE_STATIONS,
  prep: PREP_MACHINES,
} as const satisfies Record<StepMode, readonly string[]>;

export const QTY_UNITS = ["LB", "KG", "OZ", "G", "GAL", "QT", "L"] as const;
export const WEIGHT_UNITS = ["OZ", "G", "LB"] as const;
export const DURATION_UNITS = ["sec", "min", "hr"] as const;
export const TEMP_UNITS = ["°F", "°C"] as const;

export type QtyUnit = (typeof QTY_UNITS)[number];
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type TempUnit = (typeof TEMP_UNITS)[number];

export const MODE_COLORS: Record<StepMode, string> = {
  batch: "#0f77ad",
  mix: "#6d4fa8",
  line: "#1a7f4b",
  prep: "#b45309",
};

export const ROLE_ES: Record<string, string> = {
  "Team member": "Operario",
  "Machine operator": "Operador de máquina",
  Supervisor: "Supervisor",
  "QA tech": "Técnico de calidad",
  Sanitation: "Limpieza",
};

export type FloorLang = "en" | "es";

export const FLOOR_LABELS = {
  en: {
    step: "Step",
    of: "of",
    stage: {
      PREP: "PREP",
      COOK: "COOK",
      COOL: "COOL",
      HOLD: "HOLD",
      CLEAN: "CLEAN",
      LOAD: "LOAD",
      MIX: "MIX",
      REST: "REST",
      TRANSFER: "TRANSFER",
      "SET-UP": "SET-UP",
      FILL: "FILL",
      SEAL: "SEAL",
      CHECK: "CHECK",
      PACK: "PACK",
      CHANGEOVER: "CHANGEOVER",
      WASH: "WASH",
      CUT: "CUT",
      SORT: "SORT",
      WEIGH: "WEIGH",
      STORE: "STORE",
    } as Record<string, string>,
    equip: "Equipment",
    mixer: "Mixer",
    station: "Station",
    machine: "Machine",
    setting: "Setting",
    size: "Batch size",
    temp: "Temperature",
    time: "Time",
    speed: "Speed",
    each: "Each unit",
    perunit: "Weight per unit",
    cut: "Cut",
    rate: "Pounds per hour",
    cycles: "Cycles",
    fwd: "Forward",
    back: "Back",
    must: "You must",
    weigh: "WEIGH",
    rtemp: "TAKE TEMPERATURE",
    photo: "TAKE A PHOTO",
    sign: "SUPERVISOR SIGNS",
    metal: "METAL DETECTOR",
    label: "LABEL IT",
    crit: "CRITICAL LIMIT — MUST BE MET",
    ifnot: "If it is not met:",
    safety: "SAFETY",
    crew: "On this step",
    whole: "Rules for the whole batch",
    back2: "Back",
    next: "Next",
    done: "Finish",
    all: "Show all steps",
    one: "One step at a time",
    noes: "This step has no Spanish yet. Showing English.",
    start: "Starts at",
    sheet: {
      rn: "RECIPE NAME",
      al: "ALLERGEN",
      dp: "DEPARTMENT",
      wip: "WIP #",
      pd: "PRODUCTION DATE",
      ex: "EXPIRATION DATE",
      lot: "LOT NUMBER",
      tp: "TOTAL PRODUCED",
      ot: "ORDER TOTAL",
      pg: "PAGE NUMBER",
      us: "USDA (YES – NO)",
      pb: "PRODUCED BY",
      lotn: "LOT NUMBER",
      ingr: "INGREDIENT – MATERIAL",
      fb: "FULL BATCH",
      finb: "FINAL BATCH",
      ins: "INSTRUCTIONS",
      rec: "RECORD",
      ini: "INITIALS",
      prep: "Prepared by",
      st: "Time start / end",
      qa: "QC",
      sup: "Supervisor",
      run: "Run time",
      title: "BATCH SHEET",
    },
  },
  es: {
    step: "Paso",
    of: "de",
    stage: {
      PREP: "PREPARAR",
      COOK: "COCINAR",
      COOL: "ENFRIAR",
      HOLD: "MANTENER",
      CLEAN: "LIMPIAR",
      LOAD: "CARGAR",
      MIX: "MEZCLAR",
      REST: "REPOSAR",
      TRANSFER: "TRASLADAR",
      "SET-UP": "PREPARAR LÍNEA",
      FILL: "LLENAR",
      SEAL: "SELLAR",
      CHECK: "REVISAR",
      PACK: "EMPACAR",
      CHANGEOVER: "CAMBIO",
      WASH: "LAVAR",
      CUT: "CORTAR",
      SORT: "SELECCIONAR",
      WEIGH: "PESAR",
      STORE: "ALMACENAR",
    } as Record<string, string>,
    equip: "Equipo",
    mixer: "Mezcladora",
    station: "Línea",
    machine: "Máquina",
    setting: "Ajuste",
    size: "Tamaño del lote",
    temp: "Temperatura",
    time: "Tiempo",
    speed: "Velocidad",
    each: "Cada unidad",
    perunit: "Peso por unidad",
    cut: "Corte",
    rate: "Libras por hora",
    cycles: "Ciclos",
    fwd: "Adelante",
    back: "Atrás",
    must: "Usted debe",
    weigh: "PESAR",
    rtemp: "TOMAR TEMPERATURA",
    photo: "TOMAR UNA FOTO",
    sign: "FIRMA DEL SUPERVISOR",
    metal: "DETECTOR DE METAL",
    label: "ETIQUETAR",
    crit: "LÍMITE CRÍTICO — OBLIGATORIO",
    ifnot: "Si no se cumple:",
    safety: "SEGURIDAD",
    crew: "En este paso",
    whole: "Reglas para todo el lote",
    back2: "Atrás",
    next: "Siguiente",
    done: "Terminar",
    all: "Ver todos los pasos",
    one: "Un paso a la vez",
    noes: "Este paso todavía no tiene español. Se muestra en inglés.",
    start: "Empieza a los",
    sheet: {
      rn: "NOMBRE DE RECETA",
      al: "ALÉRGENO",
      dp: "DEPARTAMENTO",
      wip: "WIP #",
      pd: "FECHA DE PRODUCCIÓN",
      ex: "FECHA DE VENCIMIENTO",
      lot: "NÚMERO DE LOTE",
      tp: "TOTAL PRODUCIDO",
      ot: "TOTAL DE LA ORDEN",
      pg: "PÁGINA",
      us: "USDA",
      pb: "PRODUCIDO POR",
      lotn: "NÚMERO DE LOTE",
      ingr: "INGREDIENTE – MATERIAL",
      fb: "LOTE COMPLETO",
      finb: "LOTE FINAL",
      ins: "INSTRUCCIONES",
      rec: "ANOTAR / REGISTRAR",
      ini: "INICIALES",
      prep: "Preparado por",
      st: "Hora inicio / fin",
      qa: "Calidad",
      sup: "Supervisor",
      run: "Tiempo de corrida",
      title: "HOJA DE LOTE",
    },
  },
} as const;

/** Approved EN→ES translation memory for floor / batch sheet. */
export const TRANSLATION_MEMORY: Record<string, string> = {
  'Add 150 LB of diced chuck roll 1" to the pressure cooker. Add the barbacoa dressing to recipe weight and mix it well.':
    'Agregue 150 LB de chuck roll en cubos de 1" a la olla de presión. Agregue el aderezo de barbacoa al peso de la receta y mezcle bien.',
  "Let it cook without pressure until it comes to a boil — about 4 minutes — then close the pressure cooker.":
    "Deje cocinar sin presión hasta que hierva — unos 4 minutos — y luego cierre la olla de presión.",
  "Cook at 250 °F for 90 minutes under pressure.":
    "Cocine a 250 °F durante 90 minutos con presión.",
  "Check the meat is cooked through, then shred it with the paddle for about 2 minutes.":
    "Revise que la carne esté bien cocida y desméchela con la paleta durante unos 2 minutos.",
  "Portion 1 gallon of barbacoa stew into each pan.":
    "Porcione 1 galón de barbacoa en cada bandeja.",
  "IQF tunnel: −80 °F for 14 minutes.":
    "Túnel IQF: −80 °F durante 14 minutos.",
  "Holds 250 °F for the full 90 minutes under pressure.":
    "Mantiene 250 °F durante los 90 minutos completos con presión.",
  "Stew leaves the tunnel at 40 °F or below.":
    "La barbacoa sale del túnel a 40 °F o menos.",
  "Do not open the cooker. Restart the timer and bring it back to 250 °F. If it fails twice, hold the batch and call QA.":
    "No abra la olla. Reinicie el temporizador y vuelva a 250 °F. Si falla dos veces, retenga el lote y llame a Calidad.",
  "Send the pans through a second pass and re-probe before packing.":
    "Pase las bandejas una segunda vez y vuelva a tomar la temperatura antes de empacar.",
  "Two people lift the meat bins. The lid stays open and latched back while loading.":
    "Dos personas levantan los contenedores de carne. La tapa queda abierta y asegurada mientras se carga.",
  "Never crack the lid under pressure. Wait for the gauge to read zero.":
    "Nunca abra la tapa con presión. Espere a que el manómetro marque cero.",
  "Product is above 200 °F. Heat gloves and face shield while the paddle runs.":
    "El producto está por encima de 200 °F. Use guantes térmicos y careta mientras la paleta gira.",
  "Beef — USDA product, keep the lot number with the batch from load to pack. Sanitize the cooker and paddle before and after the run. Supervisor signs off before the pans go to the tunnel.":
    "Res — producto USDA, mantenga el número de lote con el lote desde la carga hasta el empaque. Desinfecte la olla y la paleta antes y después de la corrida. El supervisor firma antes de que las bandejas vayan al túnel.",
};

const GLOSSARY: [RegExp, string][] = [
  [/pressure cooker/gi, "olla de presión"],
  [/combi oven/gi, "horno combi"],
  [/sheet pan/gi, "bandeja"],
  [/steel bin/gi, "contenedor de acero"],
  [/paddle/gi, "paleta"],
  [/tunnel/gi, "túnel"],
  [/scoop/gi, "cucharón"],
  [/minutes/gi, "minutos"],
  [/minute/gi, "minuto"],
  [/seconds/gi, "segundos"],
  [/hours/gi, "horas"],
  [/gallons/gi, "galones"],
  [/gallon/gi, "galón"],
  [/pounds/gi, "libras"],
  [/each pan/gi, "cada bandeja"],
  [/\badd\b/gi, "agregue"],
  [/\bmix\b/gi, "mezcle"],
  [/\bcook\b/gi, "cocine"],
  [/\bcheck\b/gi, "revise"],
  [/\bclose\b/gi, "cierre"],
  [/\bopen\b/gi, "abra"],
  [/\bshred\b/gi, "desmeche"],
  [/\bweigh\b/gi, "pese"],
  [/\bportion\b/gi, "porcione"],
  [/\bspread\b/gi, "extienda"],
  [/\bdrain\b/gi, "escurra"],
  [/\bboil\b/gi, "hierva"],
  [/\bstir\b/gi, "revuelva"],
  [/\blabel\b/gi, "etiquete"],
  [/\bstore\b/gi, "guarde"],
  [/\bpack\b/gi, "empaque"],
  [/\bmeat\b/gi, "carne"],
  [/\bwater\b/gi, "agua"],
  [/\brice\b/gi, "arroz"],
  [/\bsalt\b/gi, "sal"],
  [/\bbeans\b/gi, "frijoles"],
  [/\bonion\b/gi, "cebolla"],
  [/\bdressing\b/gi, "aderezo"],
  [/\bbatch\b/gi, "lote"],
  [/\bwithout\b/gi, "sin"],
  [/\bunder pressure\b/gi, "con presión"],
  [/\buntil\b/gi, "hasta que"],
  [/\bthen\b/gi, "luego"],
  [/\babout\b/gi, "aproximadamente"],
  [/\band\b/gi, "y"],
  [/\bthe\b/gi, "la"],
  [/\bfor\b/gi, "por"],
  [/\binto\b/gi, "en"],
  [/\bwith\b/gi, "con"],
  [/\bto\b/gi, "a"],
  [/\bof\b/gi, "de"],
  [/\bit\b/gi, "lo"],
  [/\bis\b/gi, "está"],
  [/\bwell\b/gi, "bien"],
  [/\beach\b/gi, "cada"],
];

const translationCache: Record<string, string> = {};

export function translateInstruction(txt: string, lang: FloorLang): string {
  if (!txt || lang !== "es") return txt;
  if (TRANSLATION_MEMORY[txt]) return TRANSLATION_MEMORY[txt];
  if (translationCache[txt]) return translationCache[txt];
  let out = txt;
  for (const [re, es] of GLOSSARY) out = out.replace(re, es);
  translationCache[txt] = out;
  return out;
}

export const FIELD_TIPS: Record<string, string> = {
  type: "Stage|Which stage of the recipe this step belongs to.",
  txt: "Instruction|Exactly what the operator does, in the order they do it. One action per step.",
  mode: "Kind of step|Cooking, mixing, a continuous line or a cutting bench. It changes which numbers this step asks for.",
  eqB: "Equipment|Which machine or bench runs this step.",
  eqM: "Mixer|Which mixer or paddle this step runs on.",
  eqL: "Station|Which line the units run through.",
  eqP: "Machine|Which cutter or bench does the work.",
  set: "Setting|Speed, program or lid position. Write it as it reads on the panel.",
  cap: "Batch size|Smallest and largest amount this equipment runs at once. Anything outside gets flagged.",
  temp: "Temperature|The temperature this step must reach or hold.",
  time: "How long it takes|Min is a clean run, max is what the schedule is built on. Labour costs on the max.",
  uph: "Units per hour|How many units the line puts out in an hour at full speed.",
  takt: "Seconds per unit|Worked out from units per hour.",
  unitw: "Weight per unit|Target weight in each bowl or pack, lightest to heaviest.",
  cut: "Cut|Cut and blade set-up — DICE 1/4\", WING 2mm.",
  lbhr: "Pounds per hour|How much this machine gets through in an hour.",
  cw: "Turn forward|Seconds the paddle or bin turns forward per cycle.",
  ccw: "Turn back|Seconds it turns back per cycle.",
  cyc: "Cycles|How many times the pattern repeats.",
  mspd: "Speed|The speed setting on the panel.",
  mixt: "Mixing time|Worked out from forward, back and cycles.",
  run: "Run time|Worked out from the speed and the target.",
  crew: "Who works this step|People by role. Labour cost comes from this. Leave it to use the recipe crew.",
  weigh: "Weigh|Operator weighs and records the number.",
  rtemp: "Temperature check|Operator probes and records before moving on.",
  photo: "Photo|Operator photographs the step as proof.",
  sign: "Supervisor sign-off|A supervisor initials before the batch moves on.",
  metal: "Metal detector|Units pass the detector at this step.",
  label: "Label|Units get the lot and date here.",
  ccp: "Critical control point|A food-safety step. Needs a limit and a corrective action, turns red on the floor, prints on the HACCP record.",
  limit:
    'Critical limit|The number that must be met, with nothing to argue about — "165 °F for 15 seconds", not "hot enough".',
  fix: "Corrective action|What the operator does when the limit is missed. Who they call, what happens to the batch.",
  ppe: "Safety and PPE|Gloves, hot surfaces, blades, lockout. Shows in amber on the floor card.",
  media: "Photo or video|Show the cut, the fill line, the finished colour. Faster than a paragraph.",
  rcrew: "Crew on this recipe|Default crew for every step. Any step can override it.",
};

export function tipParts(key: string): { title: string; body: string } {
  const raw = FIELD_TIPS[key] ?? "";
  const [title, body = ""] = raw.split("|");
  return { title, body };
}
