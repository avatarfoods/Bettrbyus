import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEPTS = {
  "MAIN KITCHEN AM": "6ca25669-963c-4630-9789-e00d7582f906",
  "MAIN KITCHEN PM": "489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a",
  "FRESH MIXING": "665cc151-b601-4fbd-bb03-9441b791bd53",
  PRODUCE: "f0d45e35-ebf0-4831-bc44-b6336accdeae",
  "GARDE MANGER": "15a32044-e095-4ea3-87e6-3c801b28d76b",
  ASSEMBLY: "d641124a-65b8-46e3-b5e6-8840fbb7e1d0",
  "FINISHED PRODUCT": "4f441fa4-6c66-4213-b81c-0316498497f7",
};

const raw = `MAIN KITCHEN AM	160287	MIX RED & WHITE QUINOA, BOILED	50	LBS
MAIN KITCHEN PM	160301	JASMINE RICE, COOKED	50	LBS
MAIN KITCHEN PM	160288	JASMINE RICE, COOKED (AVOCADO OIL)	50	LBS
MAIN KITCHEN PM	160308	RICE BASMATI	50	LBS
MAIN KITCHEN AM	160292	BOILED BLACK BEANS 	50	LBS
MAIN KITCHEN PM	160293	BOILED, BROWN RICE	50	LBS
MAIN KITCHEN AM	160294	ROASTED POTATOES	50	LBS
MAIN KITCHEN AM	160345	BREAKFAST ROASTED POTATOES 	50	LBS
MAIN KITCHEN AM	160295	HATCHED CHILLI ROASTED	1	LBS
MAIN KITCHEN AM	160296	HATCHED CHILLI SAUCE 	1	LBS
MAIN KITCHEN AM	160297	EGG WHOLE SCRAMBLED	50	LBS
MAIN KITCHEN AM	160346	ROASTED PEPPER BLEND	50	LBS
MAIN KITCHEN AM	160298	ROASTED YAMS	70	LBS
MAIN KITCHEN AM	160299	CHIPOTLE CHICKEN MARINADE	55	LBS
MAIN KITCHEN AM	160311	CHIPOTLE CHICKEN STEW NAE	55	LBS
MAIN KITCHEN AM	160312	CHIPOTLE BURRITO MARINADE	1	LBS
MAIN KITCHEN AM	160313	CHIPOTLE BURRITO STEW NAE	50	LBS
MAIN KITCHEN AM	160303	BIRRIA STEW (WHF NAE)	50	LBS
MAIN KITCHEN AM	160290	BIRRIA STEW	50	LBS
MAIN KITCHEN AM	160291	LEMON CHICKEN MARINADE	55	LBS
MAIN KITCHEN AM	160300	LEMON CHICKEN STEW NAE	55	LBS
MAIN KITCHEN AM	160304	CILANTRO CHICKEN MARINADE NAE	1	LBS
MAIN KITCHEN AM	160305	CILANTRO CHICKEN STEW NAE	50	LBS
MAIN KITCHEN AM	160306	COCONUT CURRY CHICKEN MARINADE	50	LBS
MAIN KITCHEN AM	160307	COCONUT CURRY CHICKEN STEW	50	LBS
MAIN KITCHEN AM	160314	TERIYAKI CHICKEN MARINADE NAE	50	LBS
MAIN KITCHEN AM	160315	TERIYAKI CHICKEN STEW NAE	50	LBS
MAIN KITCHEN PM	160262	BROCOLI RICE, COOKED	50	LBS
MAIN KITCHEN AM	160606	MIX RED & WHITE QUINOA, MIX	50	LBS
MAIN KITCHEN PM	160608	ROASTED, CORN	50	LBS
MAIN KITCHEN AM	160618	BOILED PINTO BEANS	50	LBS
MAIN KITCHEN AM	160619	ROASTED PINEAPPLE	50	LBS
MAIN KITCHEN AM	160620	BARBACOA STEW	50	LBS
MAIN KITCHEN AM	160625	AL PASTOR CHICKEN MARINADE	1	LBS
MAIN KITCHEN AM	160626	AL PASTOR CHICKEN STEW	50	LBS
MAIN KITCHEN AM	160631	CHICKEN TIKKA MASALA MARINADE	1	LBS
MAIN KITCHEN AM	160630	CHICKEN TIKKA MASALA STEW	50	LBS
MAIN KITCHEN AM	160633	HOT HONEY CHICKEN MARINADE	1	LBS
MAIN KITCHEN AM	160632	HOT HONEY CHICKEN STEW	50	LBS
MAIN KITCHEN AM	160634	TIKKA MASALA SAUCE	50	LBS
MAIN KITCHEN AM	160648	COCONUT CURRY SAUCE	50	LBS
FRESH MIXING	160127	MEXICAN RICE MIX 	50	LBS
FRESH MIXING	160128	BIRRIA RICE MIX 	50	LBS
FRESH MIXING	160134	SOUTHWEST MIXED GRAINS	50	LBS
FRESH MIXING	160135	MEDITERRANEAN MIXED GRAINS	50	LBS
FRESH MIXING	160316	(ALDI ONLY) BIRRIA POTATO MIX 	50	LBS
FRESH MIXING	160317	(ALDI ONLY) GREEN CHILLI POTATO MIX	50	LBS
FRESH MIXING	160318	BIRRIA POTATO EVERYDAY MIX	50	LBS
FRESH MIXING	160319	GREEN CHILLI POTATO EVERYDAY MIX	50	LBS
FRESH MIXING	160264	LEMON CILANTRO BURRITO RICE MIX	50	LBS
FRESH MIXING	160265	LEMON CHICKEN CHEESE MIX	50	LBS
FRESH MIXING	160266	CHIPOTLE BURRITO VEGGIE RICE MIX	50	LBS
FRESH MIXING	160267	CHIPOTLE VEGGIE CHEESE MIX	50	LBS
FRESH MIXING	160286	CHIPOTLE BURRITO RICE MIX	50	LBS
FRESH MIXING	160269	CHIPOTLE CHICKEN CHEESE MIX	50	LBS
FRESH MIXING	160270	BIRRIA RICE MIX (AVOCADO OIL)	50	LBS
FRESH MIXING	160320	SOUTHWESTERN GRAIN MIX	50	LBS
FRESH MIXING	160321	BREAKFAST HAM CHEESE MIX	50	LBS
FRESH MIXING	160322	BACON CHEESE MIX	50	LBS
FRESH MIXING	160089	AVOCADO CREMA DRESSING	50	LBS
FRESH MIXING	160614	AL PASTOR RICE 	50	LBS
FRESH MIXING	160610	BARBACOA RICE 	50	LBS
FRESH MIXING	160629	RICE MIX HOT HONEY	50	LBS
FRESH MIXING	160645	AL PASTOR RICE BURRITO MIX	50	LBS
FRESH MIXING	160646	BACON BURRITO CHEESE MIX 	50	LBS
FRESH MIXING	160647	BIRRIA BURRITO MIX	50	LBS
MAIN KITCHEN AM	160648	HOT HONEY RICE BURRITO MIX	50	LBS
PRODUCE	160501	WHITE ONION, 1/8" DICED 	1	LBS
PRODUCE	160502	WHITE ONION, 1/4" DICED	1	LBS
PRODUCE	160503	RED BELL PEPPER, 1/4"	1	LBS
PRODUCE	160504	CILANTRO, 2mm CHOPPED 	1	LBS
PRODUCE	160505	GREEN KALE, 2mm 	1	LBS
PRODUCE	160506	WHITE ONION (CHOPPED) 	1	LBS
PRODUCE	160507	JALAPENO (CHOPPED) 	1	LBS
PRODUCE	160508	YUKON GOLD POTATOES 3/4" 	1	LBS
PRODUCE	160509	YAMS, 3/4'' CUBED 	1	LBS
PRODUCE	160510	GREEN TOMATILLO (CLEAN) 	1	LBS
PRODUCE	160511	CILANTRO, CLEAN 	1	LBS
PRODUCE	160512	CALIFORNIA HATCHED CHILLI 	1	LBS
PRODUCE	160513	JALAPENO (WHOLE) 	1	LBS
PRODUCE	160514	WHITE ONION, 3/4" DICED 	1	LBS
PRODUCE	160515	MINT, DSMTD (OZ) 	1	LBS
PRODUCE	160516	SPINACH, 10mm CHOPPED 	1	LBS
PRODUCE	160517	SUNDRIED TOMATO	1	LBS
PRODUCE	160518	RED BELL PEPPER, 3/4"	1	LBS
PRODUCE	160519	FRESH GINGER	1	LBS
PRODUCE	160520	BROCCOLI, 1"	1	LBS
PRODUCE	160521	POBLANO PEPPER, 1/4"	1	LBS
PRODUCE	160522	RED BELL PEPPER, 1/2"	1	LBS
PRODUCE	160523	OREGANO FRESH, 2mm 	1	LBS
PRODUCE	160617	JALAPENO, 1/4" DICED	1	LBS
PRODUCE	160621	YELLOW JALAPENO (WHOLE)	1	LBS
PRODUCE	160639	HABANERO 1/4"	1	LBS
PRODUCE	160640	PINEAPPLE DRAINED	1	LBS
GARDE MANGER	160090	CHIPOTLE DRESSING	1	LBS
GARDE MANGER	160097	BIRRIA CHILLI DRESSING	1	LBS
GARDE MANGER	160271	LEMON DRESSING	1	LBS
GARDE MANGER	160601	LEMON SEASONING MIX	1	LBS
GARDE MANGER	160272	CILANTRO DRESSING	1	LBS
GARDE MANGER	160602	CILANTRO SEASONING MIX	1	LBS
GARDE MANGER	160276	COCONUT CURRY DRESSING	1	LBS
GARDE MANGER	160603	COCONUT SEASONING MIX	1	LBS
GARDE MANGER	160136	TERIAKY DRESSING	1	LBS
GARDE MANGER	160309	RAW CHICKEN, DICED 1"	80	LBS
GARDE MANGER	160310	RAW CHICKEN, DICED 1/2"	80	LBS
GARDE MANGER	160323	SHREREED ASADERO CHEESE	40	LBS
GARDE MANGER	160324	SHREREED CHEDDAR CHEESE	40	LBS
GARDE MANGER	160604	SHREREED GOUDA CHEESE	40	LBS
GARDE MANGER	160605	SHREREED SMOKED HAM	40	LBS
GARDE MANGER	160607	BIRRIA STEW, DICED 1"	80	LBS
GARDE MANGER	160622	BARBACOA DRESSING	1	LBS
GARDE MANGER	160623	AL PASTOR CREAM	1	LBS
GARDE MANGER	160624	AL PASTOR DRESSING	50	LBS
GARDE MANGER	160635	HOT HONEY CREAM	1	LBS
GARDE MANGER	160636	CHICKEN TIKKA MASALA DRESSING	1	LBS
GARDE MANGER	160637	TIKKA MASALA SEASONING	1	LBS
GARDE MANGER	160638	HOT HONEY DRESSING	1	UNIT
ASSEMBLY	160325	CHIPOTLE CHICKEN POWER BOWL 9 oz	1	UNIT
ASSEMBLY	160326	BIRRIA FIESTA BOWL 9 oz	1	UNIT
ASSEMBLY	160327	SOUTHWEST QUINOA BOWL 10.5 oz	1	UNIT
ASSEMBLY	160328	MEDITERRANEAN QUINOA BOWL 10.5 oz	1	UNIT
ASSEMBLY	160329	BIRRIA BREAKFAST BOWL 9oz	1	UNIT
ASSEMBLY	160330	FOUR CHEESE GREEN CHILI BREAKFAST BOWL 9oz	1	UNIT
ASSEMBLY	160331	LEMON CILANTRO CHICKEN BURRITO BOWL 9 oz	1	UNIT
ASSEMBLY	160332	CHIPOTLE VEGGIE BURRITO BOWL 9 oz	1	UNIT
ASSEMBLY	160333	CHIPOTLE CHICKEN BURRITO BOWL 9 oz	1	UNIT
ASSEMBLY	160334	BEEF BIRRIA RICE BOWL 9 oz	1	UNIT
ASSEMBLY	160335	COCONUT CURRY CHICKEN BOWL 9 oz	1	UNIT
ASSEMBLY	160336	CHIPOTLE CHICKEN RICE BOWL 9 oz	1	UNIT
ASSEMBLY	160337	TERIYAKI CHICKEN BOWL 9 oz	1	UNIT
ASSEMBLY	160338	GREEK CHICKEN WITH MIXED GRAINS BOWL 9 oz	1	UNIT
ASSEMBLY	160339	SOUTHWESTERN CHICKEN WITH MIXED GRAINS BOWL 9 oz	1	UNIT
ASSEMBLY	160341	BREAKFAST HAM CHEESE BOWL 9 oz	1	UNIT
ASSEMBLY	160342	BREAKFAST BACON CHEESE BOWL 9 oz	1	UNIT
ASSEMBLY	160343	FOUR CHEESE GREEN CHILI BREAKFAST BOWL EVERYDAY 9 oz	1	UNIT
ASSEMBLY	160344	BIRRIA BREAKFAST BOWL EVERYDAY 9 oz	1	UNIT
ASSEMBLY	160612	BARBACOA BEEF BOWL 9 oz	1	UNIT
ASSEMBLY	160613	AL-PASTOR CHICKEN BOWL 9 oz	1	UNIT
ASSEMBLY	160627	CHICKEN TIKKA MASALA BOWL 9 oz	1	UNIT
ASSEMBLY	160628	HOT HONEY CHICKEN BOWL 9 oz	1	UNIT
ASSEMBLY	160641	AL PASTOR-INSPIRED CHICKEN BURRITO 8 oz	1	UNIT
ASSEMBLY	160642	BACON & CHEESE BREAKFAST BURRITO 8 oz	1	UNIT
ASSEMBLY	160643	BEEF BIRRIA BURRITO 8 oz	1	UNIT
ASSEMBLY	160644	HOT HONEY CHICKEN BURRITO 8 oz	1	-
FINISHED PRODUCT	600066	CHIPOTLE CHICKEN BOWL BIRRIA RICE BOWL 20/2CT (9oz)	N/A	-
FINISHED PRODUCT	680020	MEDITERRANEAN/SOUTHWESTERN QUINOA BOWL 22/2CT (10.5 oz)	N/A	-
FINISHED PRODUCT	600103	BIRRIA / FOUR CHEESE GREEN CHILI BREAKFAST BOWL 20/2 CT (9oz)	N/A	-
FINISHED PRODUCT	680095	LEMON CILANTRO CHICKEN/ CHIPOTLE CHICKEN BURRITO BOWL 22/2CT (9 oz)	N/A	-
FINISHED PRODUCT	600097	LEMON CILANTRO CHICKEN BURRITO BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	600112	CHIPOTLE VEGGIE BURRITO BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	600098	CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	600099	BEEF BIRRIA RICE BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	680083	COCONUT CURRY CHICKEN BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	600057	CHIPOTLE CHICKEN RICE BOWL WFM 10/9 oz	N/A	-
FINISHED PRODUCT	680090	TERIYAKI CHICKEN BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680087	GREEK CHICKEN WITH MIXED GRAINS BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680088	SOUTHWESTERN CHICKEN WITH MIXED GRAINS BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680094	BREAKFAST HAM CHEESE BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680093	BREAKFAST BACON CHEESE BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	600101	FOUR CHEESE GREEN CHILI BREAKFAST BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	600102	BIRRIA BREAKFAST BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680086	CHIPOTLE CHICKEN RICE BOWL (4ct /9Oz)	N/A	-
FINISHED PRODUCT	680050	BARBACOA BEEF BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680055	AL-PASTOR CHICKEN BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680091	CHICKEN TIKKA MASALA BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680097	HOT HONEY CHICKEN BOWL 10/9 oz	N/A	-
FINISHED PRODUCT	680059	AL PASTOR-INSPIRED CHICKEN BURRITO 12/8 oz	N/A	-
FINISHED PRODUCT	680071	BACON & CHEESE BREAKFAST BURRITO 12/8 oz	N/A	-
FINISHED PRODUCT	680056	BEEF BIRRIA BURRITO 12/8 oz	N/A	-
FINISHED PRODUCT	680062	HOT HONEY CHICKEN BURRITO 12/8 oz	N/A	-`;

function cleanName(value) {
  const trimmed = value.trim();
  if (
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    trimmed.length > 1
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseLine(line) {
  const parts = line.split("\t");
  if (parts.length < 5) {
    throw new Error(`Expected at least 5 tab columns: ${line}`);
  }

  const unit = parts[parts.length - 1];
  const par = parts[parts.length - 2];
  const dept = parts[0];
  const code = parts[1];
  const name = cleanName(parts.slice(2, parts.length - 2).join("\t"));

  return { dept, code, name, par, unit };
}

function sqlLiteral(value) {
  let tag = "seed";
  while (value.includes(`$${tag}$`)) {
    tag += "x";
  }
  return `$${tag}$${value}$${tag}$`;
}

const lines = raw.trim().split("\n");
const values = lines.map((line, i) => {
  const { dept, code, name, par, unit } = parseLine(line);
  const parSql = par === "N/A" ? "null" : par;
  const unitSql = unit === "-" ? "null" : sqlLiteral(unit);
  if (!DEPTS[dept]) throw new Error(`Unknown dept: ${dept}`);
  return `  (${sqlLiteral(DEPTS[dept])}, ${sqlLiteral(code)}, ${sqlLiteral(name)}, ${parSql}, ${unitSql}, ${i + 1})`;
});

const schema = `-- Inventory check template items and daily submissions.

create table if not exists public.inventory_check_items (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id),
  item_code text not null,
  item_name text not null,
  par_quantity numeric,
  unit text,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_check_items_department_sort_idx
  on public.inventory_check_items (department_id, sort_order);

create unique index if not exists inventory_check_items_sort_order_idx
  on public.inventory_check_items (sort_order);

create table if not exists public.inventory_checks (
  id uuid primary key default gen_random_uuid(),
  check_date date not null,
  department_id uuid not null references public.departments (id),
  checked_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_date, department_id)
);

create table if not exists public.inventory_check_entries (
  id uuid primary key default gen_random_uuid(),
  inventory_check_id uuid not null references public.inventory_checks (id) on delete cascade,
  inventory_check_item_id uuid not null references public.inventory_check_items (id),
  actual_quantity numeric,
  notes text,
  unique (inventory_check_id, inventory_check_item_id)
);

create index if not exists inventory_check_entries_check_id_idx
  on public.inventory_check_entries (inventory_check_id);

insert into public.inventory_check_items (
  department_id, item_code, item_name, par_quantity, unit, sort_order
) values
${values.join(",\n")}
on conflict (sort_order) do nothing;

alter table public.inventory_check_items enable row level security;
alter table public.inventory_checks enable row level security;
alter table public.inventory_check_entries enable row level security;

drop policy if exists "Authenticated users can read inventory_check_items" on public.inventory_check_items;
drop policy if exists "Authenticated users can insert inventory_check_items" on public.inventory_check_items;
drop policy if exists "Authenticated users can update inventory_check_items" on public.inventory_check_items;

create policy "Authenticated users can read inventory_check_items"
  on public.inventory_check_items for select to authenticated using (true);

create policy "Authenticated users can insert inventory_check_items"
  on public.inventory_check_items for insert to authenticated with check (true);

create policy "Authenticated users can update inventory_check_items"
  on public.inventory_check_items for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read inventory_checks" on public.inventory_checks;
drop policy if exists "Authenticated users can insert inventory_checks" on public.inventory_checks;
drop policy if exists "Authenticated users can update inventory_checks" on public.inventory_checks;

create policy "Authenticated users can read inventory_checks"
  on public.inventory_checks for select to authenticated using (true);

create policy "Authenticated users can insert inventory_checks"
  on public.inventory_checks for insert to authenticated with check (true);

create policy "Authenticated users can update inventory_checks"
  on public.inventory_checks for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read inventory_check_entries" on public.inventory_check_entries;
drop policy if exists "Authenticated users can insert inventory_check_entries" on public.inventory_check_entries;
drop policy if exists "Authenticated users can update inventory_check_entries" on public.inventory_check_entries;

create policy "Authenticated users can read inventory_check_entries"
  on public.inventory_check_entries for select to authenticated using (true);

create policy "Authenticated users can insert inventory_check_entries"
  on public.inventory_check_entries for insert to authenticated with check (true);

create policy "Authenticated users can update inventory_check_entries"
  on public.inventory_check_entries for update to authenticated using (true) with check (true);
`;

const outPath = join(__dirname, "..", "supabase", "migrations", "20260701_inventory_checks.sql");
writeFileSync(outPath, schema, "utf8");
console.log(`Wrote ${lines.length} seed rows to ${outPath}`);
