import type { ScheduleEntry } from "@/lib/production/schedule/model";

/**
 * Carlos's own schedule, lifted from MASTER FRESH 08.13.2026.
 *
 * Used only while the schedule tables do not exist, so the page opens with
 * real numbers in it rather than an empty grid nobody can judge. Every one of
 * these 52 entries sits on a FINISHED PRODUCT - the department sheets in the
 * workbook are entirely formula-driven, which is the behaviour the cascade
 * reproduces.
 *
 * The moment the migration runs this stops being used and the real entries
 * take over.
 */
export const WORKBOOK_SEED: ScheduleEntry[] = [
  { recipeId: "07fbc3db-2a5f-4de7-b710-3a3f52ce3d11", productionDate: "2026-08-10", quantity: 500 }, // 680059 AL PASTOR-INSPIRED CHICKEN BURRITO 12/8 oz
  { recipeId: "07fbc3db-2a5f-4de7-b710-3a3f52ce3d11", productionDate: "2026-08-11", quantity: 500 }, // 680059 AL PASTOR-INSPIRED CHICKEN BURRITO 12/8 oz
  { recipeId: "59a7d1b0-308c-49fa-9fa5-9d7bb4e5c5b0", productionDate: "2026-08-11", quantity: 1100 }, // 600099 BEEF BIRRIA RICE BOWL WFM 10/9 oz
  { recipeId: "f3e9df4f-ecb0-4ed5-ad67-34bdf14d087a", productionDate: "2026-08-12", quantity: 2300 }, // 600097 LEMON CILANTRO CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "07fbc3db-2a5f-4de7-b710-3a3f52ce3d11", productionDate: "2026-08-13", quantity: 400 }, // 680059 AL PASTOR-INSPIRED CHICKEN BURRITO 12/8 oz
  { recipeId: "75d5256a-7113-421a-b217-c0827daa717b", productionDate: "2026-08-13", quantity: 100 }, // 680056 BEEF BIRRIA BURRITO 12/8 oz
  { recipeId: "df3e20ff-3abd-46af-9f3a-c2578dbf6dfb", productionDate: "2026-08-14", quantity: 1900 }, // 680055 AL-PASTOR CHICKEN BOWL 10/9 oz
  { recipeId: "4f161d92-2581-48d2-8e8a-6840fd5593f0", productionDate: "2026-08-14", quantity: 1100 }, // 680050 BARBACOA BEEF BOWL 10/9 oz
  { recipeId: "df3e20ff-3abd-46af-9f3a-c2578dbf6dfb", productionDate: "2026-08-17", quantity: 540 }, // 680055 AL-PASTOR CHICKEN BOWL 10/9 oz
  { recipeId: "4f161d92-2581-48d2-8e8a-6840fd5593f0", productionDate: "2026-08-17", quantity: 600 }, // 680050 BARBACOA BEEF BOWL 10/9 oz
  { recipeId: "59a7d1b0-308c-49fa-9fa5-9d7bb4e5c5b0", productionDate: "2026-08-17", quantity: 1100 }, // 600099 BEEF BIRRIA RICE BOWL WFM 10/9 oz
  { recipeId: "df3e20ff-3abd-46af-9f3a-c2578dbf6dfb", productionDate: "2026-08-18", quantity: 250 }, // 680055 AL-PASTOR CHICKEN BOWL 10/9 oz
  { recipeId: "91a179fb-15f5-4c13-8483-3424c16a340f", productionDate: "2026-08-18", quantity: 800 }, // 680071 BACON & CHEESE BREAKFAST BURRITO 12/8 oz
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-18", quantity: 1200 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "91a179fb-15f5-4c13-8483-3424c16a340f", productionDate: "2026-08-19", quantity: 45 }, // 680071 BACON & CHEESE BREAKFAST BURRITO 12/8 oz
  { recipeId: "4f161d92-2581-48d2-8e8a-6840fd5593f0", productionDate: "2026-08-19", quantity: 450 }, // 680050 BARBACOA BEEF BOWL 10/9 oz
  { recipeId: "dba7857a-904a-42d2-ad59-66e283738627", productionDate: "2026-08-19", quantity: 1000 }, // 600102 BIRRIA BREAKFAST BOWL 10/9 oz
  { recipeId: "7803d2e3-ed65-45de-984c-519afaee38ef", productionDate: "2026-08-19", quantity: 700 }, // 680093 BREAKFAST BACON CHEESE BOWL 10/9 oz
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-08-20", quantity: 240 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "dba7857a-904a-42d2-ad59-66e283738627", productionDate: "2026-08-20", quantity: 120 }, // 600102 BIRRIA BREAKFAST BOWL 10/9 oz
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-20", quantity: 710 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "7c008d0e-2db5-4ba7-a594-6887fc62d571", productionDate: "2026-08-20", quantity: 900 }, // 600101 FOUR CHEESE GREEN CHILI BREAKFAST BOWL 10/9 oz
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-21", quantity: 1390 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "797d9125-f15b-4ec5-88f2-2e370a495402", productionDate: "2026-08-21", quantity: 1480 }, // 600112 CHIPOTLE VEGGIE BURRITO BOWL WFM 10/9 oz
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-08-24", quantity: 280 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-24", quantity: 270 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "797d9125-f15b-4ec5-88f2-2e370a495402", productionDate: "2026-08-24", quantity: 920 }, // 600112 CHIPOTLE VEGGIE BURRITO BOWL WFM 10/9 oz
  { recipeId: "a2fc8209-7081-4be7-8bcc-efe31265585d", productionDate: "2026-08-24", quantity: 324 }, // 680083 COCONUT CURRY CHICKEN BOWL WFM 10/9 oz
  { recipeId: "4f161d92-2581-48d2-8e8a-6840fd5593f0", productionDate: "2026-08-25", quantity: 900 }, // 680050 BARBACOA BEEF BOWL 10/9 oz
  { recipeId: "92683258-e03b-4f9b-a9fb-e6b49b0732ea", productionDate: "2026-08-25", quantity: 54 }, // 680122 BEEF BIRRIA RICE FAMILY-PACK 10/28 oz
  { recipeId: "dba7857a-904a-42d2-ad59-66e283738627", productionDate: "2026-08-25", quantity: 140 }, // 600102 BIRRIA BREAKFAST BOWL 10/9 oz
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-25", quantity: 910 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "33274c86-7e1c-4e96-8946-95d8a723fa32", productionDate: "2026-08-25", quantity: 529 }, // 680124 CHIPOTLE CHICKEN RICE FAMILY-PACK 10/28 oz
  { recipeId: "a2fc8209-7081-4be7-8bcc-efe31265585d", productionDate: "2026-08-25", quantity: 165 }, // 680083 COCONUT CURRY CHICKEN BOWL WFM 10/9 oz
  { recipeId: "92683258-e03b-4f9b-a9fb-e6b49b0732ea", productionDate: "2026-08-26", quantity: 216 }, // 680122 BEEF BIRRIA RICE FAMILY-PACK 10/28 oz
  { recipeId: "b1b25e15-a7bf-40da-95c2-fd19ea15005d", productionDate: "2026-08-26", quantity: 300 }, // 600098 CHIPOTLE CHICKEN BURRITO BOWL WFM 10/9 oz
  { recipeId: "a2fc8209-7081-4be7-8bcc-efe31265585d", productionDate: "2026-08-26", quantity: 270 }, // 680083 COCONUT CURRY CHICKEN BOWL WFM 10/9 oz
  { recipeId: "2c2aec2b-b65f-49a8-987e-b5d959c7f94a", productionDate: "2026-08-27", quantity: 360 }, // 680123 BARBACOA BEEF FAMILY-PACK 10/28 oz
  { recipeId: "92683258-e03b-4f9b-a9fb-e6b49b0732ea", productionDate: "2026-08-27", quantity: 470 }, // 680122 BEEF BIRRIA RICE FAMILY-PACK 10/28 oz
  { recipeId: "33274c86-7e1c-4e96-8946-95d8a723fa32", productionDate: "2026-08-27", quantity: 546 }, // 680124 CHIPOTLE CHICKEN RICE FAMILY-PACK 10/28 oz
  { recipeId: "2c2aec2b-b65f-49a8-987e-b5d959c7f94a", productionDate: "2026-08-28", quantity: 440 }, // 680123 BARBACOA BEEF FAMILY-PACK 10/28 oz
  { recipeId: "92683258-e03b-4f9b-a9fb-e6b49b0732ea", productionDate: "2026-08-28", quantity: 60 }, // 680122 BEEF BIRRIA RICE FAMILY-PACK 10/28 oz
  { recipeId: "6a5abccb-7fe0-4de2-9e3c-b64efa37c55d", productionDate: "2026-08-28", quantity: 950 }, // 680125 LEMON TOMATILLO CHICKEN FAMILY-PACK 10/28 oz
  { recipeId: "2c2aec2b-b65f-49a8-987e-b5d959c7f94a", productionDate: "2026-08-29", quantity: 200 }, // 680123 BARBACOA BEEF FAMILY-PACK 10/28 oz
  { recipeId: "92683258-e03b-4f9b-a9fb-e6b49b0732ea", productionDate: "2026-08-29", quantity: 200 }, // 680122 BEEF BIRRIA RICE FAMILY-PACK 10/28 oz
  { recipeId: "33274c86-7e1c-4e96-8946-95d8a723fa32", productionDate: "2026-08-29", quantity: 32 }, // 680124 CHIPOTLE CHICKEN RICE FAMILY-PACK 10/28 oz
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-09-08", quantity: 792 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-09-09", quantity: 792 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "4f161d92-2581-48d2-8e8a-6840fd5593f0", productionDate: "2026-09-10", quantity: 600 }, // 680050 BARBACOA BEEF BOWL 10/9 oz
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-09-10", quantity: 458 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "bef846f3-7791-45dd-9cc3-0fbf2fe9a042", productionDate: "2026-09-11", quantity: 450 }, // 680120 BEEF BIRRIA RICE BOWL (4ct /9oz)
  { recipeId: "41291446-a0c3-45f4-9e0c-8f21d0cc5061", productionDate: "2026-09-11", quantity: 800 }, // 680090 TERIYAKI CHICKEN BOWL 10/9 oz
];

/** The span the workbook schedule covers, for opening the grid on it. */
export const WORKBOOK_SEED_START = "2026-08-10";
