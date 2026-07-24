-- Inventory check template items and daily submissions.

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
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160287$seed$, $seed$MIX RED & WHITE QUINOA, BOILED$seed$, 50, $seed$LBS$seed$, 1),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160301$seed$, $seed$JASMINE RICE, COOKED$seed$, 50, $seed$LBS$seed$, 2),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160288$seed$, $seed$JASMINE RICE, COOKED (AVOCADO OIL)$seed$, 50, $seed$LBS$seed$, 3),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160308$seed$, $seed$RICE BASMATI$seed$, 50, $seed$LBS$seed$, 4),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160292$seed$, $seed$BOILED BLACK BEANS$seed$, 50, $seed$LBS$seed$, 5),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160293$seed$, $seed$BOILED, BROWN RICE$seed$, 50, $seed$LBS$seed$, 6),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160294$seed$, $seed$ROASTED POTATOES$seed$, 50, $seed$LBS$seed$, 7),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160345$seed$, $seed$BREAKFAST ROASTED POTATOES$seed$, 50, $seed$LBS$seed$, 8),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160295$seed$, $seed$HATCHED CHILLI ROASTED$seed$, 1, $seed$LBS$seed$, 9),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160296$seed$, $seed$HATCHED CHILLI SAUCE$seed$, 1, $seed$LBS$seed$, 10),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160297$seed$, $seed$EGG WHOLE SCRAMBLED$seed$, 50, $seed$LBS$seed$, 11),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160346$seed$, $seed$ROASTED PEPPER BLEND$seed$, 50, $seed$LBS$seed$, 12),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160298$seed$, $seed$ROASTED YAMS$seed$, 70, $seed$LBS$seed$, 13),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160299$seed$, $seed$CHIPOTLE CHICKEN MARINADE$seed$, 55, $seed$LBS$seed$, 14),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160311$seed$, $seed$CHIPOTLE CHICKEN STEW NAE$seed$, 55, $seed$LBS$seed$, 15),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160312$seed$, $seed$CHIPOTLE BURRITO MARINADE$seed$, 1, $seed$LBS$seed$, 16),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160313$seed$, $seed$CHIPOTLE BURRITO STEW NAE$seed$, 50, $seed$LBS$seed$, 17),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160303$seed$, $seed$BIRRIA STEW (WHF NAE)$seed$, 50, $seed$LBS$seed$, 18),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160290$seed$, $seed$BIRRIA STEW$seed$, 50, $seed$LBS$seed$, 19),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160291$seed$, $seed$LEMON CHICKEN MARINADE$seed$, 55, $seed$LBS$seed$, 20),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160300$seed$, $seed$LEMON CHICKEN STEW NAE$seed$, 55, $seed$LBS$seed$, 21),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160304$seed$, $seed$CILANTRO CHICKEN MARINADE NAE$seed$, 1, $seed$LBS$seed$, 22),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160305$seed$, $seed$CILANTRO CHICKEN STEW NAE$seed$, 50, $seed$LBS$seed$, 23),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160306$seed$, $seed$COCONUT CURRY CHICKEN MARINADE$seed$, 50, $seed$LBS$seed$, 24),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160307$seed$, $seed$COCONUT CURRY CHICKEN STEW$seed$, 50, $seed$LBS$seed$, 25),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160314$seed$, $seed$TERIYAKI CHICKEN MARINADE NAE$seed$, 50, $seed$LBS$seed$, 26),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160315$seed$, $seed$TERIYAKI CHICKEN STEW NAE$seed$, 50, $seed$LBS$seed$, 27),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160262$seed$, $seed$BROCOLI RICE, COOKED$seed$, 50, $seed$LBS$seed$, 28),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160606$seed$, $seed$MIX RED & WHITE QUINOA, MIX$seed$, 50, $seed$LBS$seed$, 29),
  ($seed$489fe2dc-5a5c-4ea9-a334-ee977fd1ed4a$seed$, $seed$160608$seed$, $seed$ROASTED, CORN$seed$, 50, $seed$LBS$seed$, 30),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160618$seed$, $seed$BOILED PINTO BEANS$seed$, 50, $seed$LBS$seed$, 31),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160619$seed$, $seed$ROASTED PINEAPPLE$seed$, 50, $seed$LBS$seed$, 32),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160620$seed$, $seed$BARBACOA STEW$seed$, 50, $seed$LBS$seed$, 33),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160625$seed$, $seed$AL PASTOR CHICKEN MARINADE$seed$, 1, $seed$LBS$seed$, 34),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160626$seed$, $seed$AL PASTOR CHICKEN STEW$seed$, 50, $seed$LBS$seed$, 35),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160631$seed$, $seed$CHICKEN TIKKA MASALA MARINADE$seed$, 1, $seed$LBS$seed$, 36),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160630$seed$, $seed$CHICKEN TIKKA MASALA STEW$seed$, 50, $seed$LBS$seed$, 37),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160633$seed$, $seed$HOT HONEY CHICKEN MARINADE$seed$, 1, $seed$LBS$seed$, 38),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160632$seed$, $seed$HOT HONEY CHICKEN STEW$seed$, 50, $seed$LBS$seed$, 39),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160634$seed$, $seed$TIKKA MASALA SAUCE$seed$, 50, $seed$LBS$seed$, 40),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160648$seed$, $seed$COCONUT CURRY SAUCE$seed$, 50, $seed$LBS$seed$, 41),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160127$seed$, $seed$MEXICAN RICE MIX$seed$, 50, $seed$LBS$seed$, 42),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160128$seed$, $seed$BIRRIA RICE MIX$seed$, 50, $seed$LBS$seed$, 43),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160134$seed$, $seed$SOUTHWEST MIXED GRAINS$seed$, 50, $seed$LBS$seed$, 44),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160135$seed$, $seed$MEDITERRANEAN MIXED GRAINS$seed$, 50, $seed$LBS$seed$, 45),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160316$seed$, $seed$(ALDI ONLY) BIRRIA POTATO MIX$seed$, 50, $seed$LBS$seed$, 46),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160317$seed$, $seed$(ALDI ONLY) GREEN CHILLI POTATO MIX$seed$, 50, $seed$LBS$seed$, 47),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160318$seed$, $seed$BIRRIA POTATO EVERYDAY MIX$seed$, 50, $seed$LBS$seed$, 48),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160319$seed$, $seed$GREEN CHILLI POTATO EVERYDAY MIX$seed$, 50, $seed$LBS$seed$, 49),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160264$seed$, $seed$LEMON CILANTRO BURRITO RICE MIX$seed$, 50, $seed$LBS$seed$, 50),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160265$seed$, $seed$LEMON CHICKEN CHEESE MIX$seed$, 50, $seed$LBS$seed$, 51),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160266$seed$, $seed$CHIPOTLE BURRITO VEGGIE RICE MIX$seed$, 50, $seed$LBS$seed$, 52),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160267$seed$, $seed$CHIPOTLE VEGGIE CHEESE MIX$seed$, 50, $seed$LBS$seed$, 53),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160286$seed$, $seed$CHIPOTLE BURRITO RICE MIX$seed$, 50, $seed$LBS$seed$, 54),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160269$seed$, $seed$CHIPOTLE CHICKEN CHEESE MIX$seed$, 50, $seed$LBS$seed$, 55),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160270$seed$, $seed$BIRRIA RICE MIX (AVOCADO OIL)$seed$, 50, $seed$LBS$seed$, 56),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160320$seed$, $seed$SOUTHWESTERN GRAIN MIX$seed$, 50, $seed$LBS$seed$, 57),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160321$seed$, $seed$BREAKFAST HAM CHEESE MIX$seed$, 50, $seed$LBS$seed$, 58),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160322$seed$, $seed$BACON CHEESE MIX$seed$, 50, $seed$LBS$seed$, 59),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160089$seed$, $seed$AVOCADO CREMA DRESSING$seed$, 50, $seed$LBS$seed$, 60),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160614$seed$, $seed$AL PASTOR RICE$seed$, 50, $seed$LBS$seed$, 61),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160610$seed$, $seed$BARBACOA RICE$seed$, 50, $seed$LBS$seed$, 62),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160629$seed$, $seed$RICE MIX HOT HONEY$seed$, 50, $seed$LBS$seed$, 63),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160645$seed$, $seed$AL PASTOR RICE BURRITO MIX$seed$, 50, $seed$LBS$seed$, 64),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160646$seed$, $seed$BACON BURRITO CHEESE MIX$seed$, 50, $seed$LBS$seed$, 65),
  ($seed$665cc151-b601-4fbd-bb03-9441b791bd53$seed$, $seed$160647$seed$, $seed$BIRRIA BURRITO MIX$seed$, 50, $seed$LBS$seed$, 66),
  ($seed$6ca25669-963c-4630-9789-e00d7582f906$seed$, $seed$160648$seed$, $seed$HOT HONEY RICE BURRITO MIX$seed$, 50, $seed$LBS$seed$, 67),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160501$seed$, $seed$WHITE ONION, 1/8" DICED$seed$, 1, $seed$LBS$seed$, 68),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160502$seed$, $seed$WHITE ONION, 1/4" DICED$seed$, 1, $seed$LBS$seed$, 69),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160503$seed$, $seed$RED BELL PEPPER, 1/4"$seed$, 1, $seed$LBS$seed$, 70),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160504$seed$, $seed$CILANTRO, 2mm CHOPPED$seed$, 1, $seed$LBS$seed$, 71),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160505$seed$, $seed$GREEN KALE, 2mm$seed$, 1, $seed$LBS$seed$, 72),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160506$seed$, $seed$WHITE ONION (CHOPPED)$seed$, 1, $seed$LBS$seed$, 73),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160507$seed$, $seed$JALAPENO (CHOPPED)$seed$, 1, $seed$LBS$seed$, 74),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160508$seed$, $seed$YUKON GOLD POTATOES 3/4"$seed$, 1, $seed$LBS$seed$, 75),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160509$seed$, $seed$YAMS, 3/4'' CUBED$seed$, 1, $seed$LBS$seed$, 76),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160510$seed$, $seed$GREEN TOMATILLO (CLEAN)$seed$, 1, $seed$LBS$seed$, 77),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160511$seed$, $seed$CILANTRO, CLEAN$seed$, 1, $seed$LBS$seed$, 78),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160512$seed$, $seed$CALIFORNIA HATCHED CHILLI$seed$, 1, $seed$LBS$seed$, 79),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160513$seed$, $seed$JALAPENO (WHOLE)$seed$, 1, $seed$LBS$seed$, 80),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160514$seed$, $seed$WHITE ONION, 3/4" DICED$seed$, 1, $seed$LBS$seed$, 81),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160515$seed$, $seed$MINT, DSMTD (OZ)$seed$, 1, $seed$LBS$seed$, 82),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160516$seed$, $seed$SPINACH, 10mm CHOPPED$seed$, 1, $seed$LBS$seed$, 83),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160517$seed$, $seed$SUNDRIED TOMATO$seed$, 1, $seed$LBS$seed$, 84),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160518$seed$, $seed$RED BELL PEPPER, 3/4"$seed$, 1, $seed$LBS$seed$, 85),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160519$seed$, $seed$FRESH GINGER$seed$, 1, $seed$LBS$seed$, 86),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160520$seed$, $seed$BROCCOLI, 1"$seed$, 1, $seed$LBS$seed$, 87),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160521$seed$, $seed$POBLANO PEPPER, 1/4"$seed$, 1, $seed$LBS$seed$, 88),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160522$seed$, $seed$RED BELL PEPPER, 1/2"$seed$, 1, $seed$LBS$seed$, 89),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160523$seed$, $seed$OREGANO FRESH, 2mm$seed$, 1, $seed$LBS$seed$, 90),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160617$seed$, $seed$JALAPENO, 1/4" DICED$seed$, 1, $seed$LBS$seed$, 91),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160621$seed$, $seed$YELLOW JALAPENO (WHOLE)$seed$, 1, $seed$LBS$seed$, 92),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160639$seed$, $seed$HABANERO 1/4"$seed$, 1, $seed$LBS$seed$, 93),
  ($seed$f0d45e35-ebf0-4831-bc44-b6336accdeae$seed$, $seed$160640$seed$, $seed$PINEAPPLE DRAINED$seed$, 1, $seed$LBS$seed$, 94),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160090$seed$, $seed$CHIPOTLE DRESSING$seed$, 1, $seed$LBS$seed$, 95),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160097$seed$, $seed$BIRRIA CHILLI DRESSING$seed$, 1, $seed$LBS$seed$, 96),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160271$seed$, $seed$LEMON DRESSING$seed$, 1, $seed$LBS$seed$, 97),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160601$seed$, $seed$LEMON SEASONING MIX$seed$, 1, $seed$LBS$seed$, 98),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160272$seed$, $seed$CILANTRO DRESSING$seed$, 1, $seed$LBS$seed$, 99),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160602$seed$, $seed$CILANTRO SEASONING MIX$seed$, 1, $seed$LBS$seed$, 100),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160276$seed$, $seed$COCONUT CURRY DRESSING$seed$, 1, $seed$LBS$seed$, 101),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160603$seed$, $seed$COCONUT SEASONING MIX$seed$, 1, $seed$LBS$seed$, 102),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160136$seed$, $seed$TERIAKY DRESSING$seed$, 1, $seed$LBS$seed$, 103),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160309$seed$, $seed$RAW CHICKEN, DICED 1"$seed$, 80, $seed$LBS$seed$, 104),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160310$seed$, $seed$RAW CHICKEN, DICED 1/2"$seed$, 80, $seed$LBS$seed$, 105),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160323$seed$, $seed$SHREREED ASADERO CHEESE$seed$, 40, $seed$LBS$seed$, 106),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160324$seed$, $seed$SHREREED CHEDDAR CHEESE$seed$, 40, $seed$LBS$seed$, 107),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160604$seed$, $seed$SHREREED GOUDA CHEESE$seed$, 40, $seed$LBS$seed$, 108),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160605$seed$, $seed$SHREREED SMOKED HAM$seed$, 40, $seed$LBS$seed$, 109),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160607$seed$, $seed$BIRRIA STEW, DICED 1"$seed$, 80, $seed$LBS$seed$, 110),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160622$seed$, $seed$BARBACOA DRESSING$seed$, 1, $seed$LBS$seed$, 111),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160623$seed$, $seed$AL PASTOR CREAM$seed$, 1, $seed$LBS$seed$, 112),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160624$seed$, $seed$AL PASTOR DRESSING$seed$, 50, $seed$LBS$seed$, 113),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160635$seed$, $seed$HOT HONEY CREAM$seed$, 1, $seed$LBS$seed$, 114),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160636$seed$, $seed$CHICKEN TIKKA MASALA DRESSING$seed$, 1, $seed$LBS$seed$, 115),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160637$seed$, $seed$TIKKA MASALA SEASONING$seed$, 1, $seed$LBS$seed$, 116),
  ($seed$15a32044-e095-4ea3-87e6-3c801b28d76b$seed$, $seed$160638$seed$, $seed$HOT HONEY DRESSING$seed$, 1, $seed$UNIT$seed$, 117),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160325$seed$, $seed$CHIPOTLE CHICKEN POWER BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 118),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160326$seed$, $seed$BIRRIA FIESTA BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 119),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160327$seed$, $seed$SOUTHWEST QUINOA BOWL 10.5 oz$seed$, 1, $seed$UNIT$seed$, 120),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160328$seed$, $seed$MEDITERRANEAN QUINOA BOWL 10.5 oz$seed$, 1, $seed$UNIT$seed$, 121),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160329$seed$, $seed$BIRRIA BREAKFAST BOWL 9oz$seed$, 1, $seed$UNIT$seed$, 122),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160330$seed$, $seed$FOUR CHEESE GREEN CHILI BREAKFAST BOWL 9oz$seed$, 1, $seed$UNIT$seed$, 123),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160331$seed$, $seed$LEMON CILANTRO CHICKEN BURRITO BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 124),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160332$seed$, $seed$CHIPOTLE VEGGIE BURRITO BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 125),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160333$seed$, $seed$CHIPOTLE CHICKEN BURRITO BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 126),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160334$seed$, $seed$BEEF BIRRIA RICE BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 127),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160335$seed$, $seed$COCONUT CURRY CHICKEN BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 128),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160336$seed$, $seed$CHIPOTLE CHICKEN RICE BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 129),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160337$seed$, $seed$TERIYAKI CHICKEN BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 130),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160338$seed$, $seed$GREEK CHICKEN WITH MIXED GRAINS BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 131),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160339$seed$, $seed$SOUTHWESTERN CHICKEN WITH MIXED GRAINS BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 132),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160341$seed$, $seed$BREAKFAST HAM CHEESE BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 133),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160342$seed$, $seed$BREAKFAST BACON CHEESE BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 134),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160343$seed$, $seed$FOUR CHEESE GREEN CHILI BREAKFAST BOWL EVERYDAY 9 oz$seed$, 1, $seed$UNIT$seed$, 135),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160344$seed$, $seed$BIRRIA BREAKFAST BOWL EVERYDAY 9 oz$seed$, 1, $seed$UNIT$seed$, 136),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160612$seed$, $seed$BARBACOA BEEF BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 137),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160613$seed$, $seed$AL-PASTOR CHICKEN BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 138),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160627$seed$, $seed$CHICKEN TIKKA MASALA BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 139),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160628$seed$, $seed$HOT HONEY CHICKEN BOWL 9 oz$seed$, 1, $seed$UNIT$seed$, 140),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160641$seed$, $seed$AL PASTOR-INSPIRED CHICKEN BURRITO 8 oz$seed$, 1, $seed$UNIT$seed$, 141),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160642$seed$, $seed$BACON & CHEESE BREAKFAST BURRITO 8 oz$seed$, 1, $seed$UNIT$seed$, 142),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160643$seed$, $seed$BEEF BIRRIA BURRITO 8 oz$seed$, 1, $seed$UNIT$seed$, 143),
  ($seed$d641124a-65b8-46e3-b5e6-8840fbb7e1d0$seed$, $seed$160644$seed$, $seed$HOT HONEY CHICKEN BURRITO 8 oz$seed$, 1, null, 144),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600066$seed$, $seed$CHIPOTLE CHICKEN BOWL BIRRIA RICE BOWL 20/2CT (9oz)$seed$, null, null, 145),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680020$seed$, $seed$MEDITERRANEAN/SOUTHWESTERN QUINOA BOWL 22/2CT (10.5 oz)$seed$, null, null, 146),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600103$seed$, $seed$BIRRIA / FOUR CHEESE GREEN CHILI BREAKFAST BOWL 20/2 CT (9oz)$seed$, null, null, 147),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680095$seed$, $seed$LEMON CILANTRO CHICKEN/ CHIPOTLE CHICKEN BURRITO BOWL 22/2CT (9 oz)$seed$, null, null, 148),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600097$seed$, $seed$LEMON CILANTRO CHICKEN BURRITO BOWL WFM 10/9 oz$seed$, null, null, 149),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600112$seed$, $seed$CHIPOTLE VEGGIE BURRITO BOWL WFM 10/9 oz$seed$, null, null, 150),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600098$seed$, $seed$CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz$seed$, null, null, 151),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600099$seed$, $seed$BEEF BIRRIA RICE BOWL WFM 10/9 oz$seed$, null, null, 152),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680083$seed$, $seed$COCONUT CURRY CHICKEN BOWL WFM 10/9 oz$seed$, null, null, 153),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600057$seed$, $seed$CHIPOTLE CHICKEN RICE BOWL WFM 10/9 oz$seed$, null, null, 154),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680090$seed$, $seed$TERIYAKI CHICKEN BOWL 10/9 oz$seed$, null, null, 155),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680087$seed$, $seed$GREEK CHICKEN WITH MIXED GRAINS BOWL 10/9 oz$seed$, null, null, 156),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680088$seed$, $seed$SOUTHWESTERN CHICKEN WITH MIXED GRAINS BOWL 10/9 oz$seed$, null, null, 157),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680094$seed$, $seed$BREAKFAST HAM CHEESE BOWL 10/9 oz$seed$, null, null, 158),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680093$seed$, $seed$BREAKFAST BACON CHEESE BOWL 10/9 oz$seed$, null, null, 159),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600101$seed$, $seed$FOUR CHEESE GREEN CHILI BREAKFAST BOWL 10/9 oz$seed$, null, null, 160),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$600102$seed$, $seed$BIRRIA BREAKFAST BOWL 10/9 oz$seed$, null, null, 161),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680086$seed$, $seed$CHIPOTLE CHICKEN RICE BOWL (4ct /9Oz)$seed$, null, null, 162),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680050$seed$, $seed$BARBACOA BEEF BOWL 10/9 oz$seed$, null, null, 163),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680055$seed$, $seed$AL-PASTOR CHICKEN BOWL 10/9 oz$seed$, null, null, 164),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680091$seed$, $seed$CHICKEN TIKKA MASALA BOWL 10/9 oz$seed$, null, null, 165),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680097$seed$, $seed$HOT HONEY CHICKEN BOWL 10/9 oz$seed$, null, null, 166),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680059$seed$, $seed$AL PASTOR-INSPIRED CHICKEN BURRITO 12/8 oz$seed$, null, null, 167),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680071$seed$, $seed$BACON & CHEESE BREAKFAST BURRITO 12/8 oz$seed$, null, null, 168),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680056$seed$, $seed$BEEF BIRRIA BURRITO 12/8 oz$seed$, null, null, 169),
  ($seed$4f441fa4-6c66-4213-b81c-0316498497f7$seed$, $seed$680062$seed$, $seed$HOT HONEY CHICKEN BURRITO 12/8 oz$seed$, null, null, 170)
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
