import { PrintFrame } from "@/components/production/print/print-frame";
import {
  ProductReleaseSheet,
  ProductionReportSheet,
} from "@/components/production/print/sheets";
import { RecipePrintSheet } from "@/components/recipes/recipe-print-sheet";
import { buildProductionDay } from "@/lib/production/print/build";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import { fetchInstructions } from "@/lib/recipes/instructions";
import { buildReleaseProducts } from "@/lib/production/print/release";
import { defaultSheetsFor } from "@/lib/settings/wallpaper";
import { fetchAppSettings } from "@/lib/settings/wallpaper";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Print the day" };
export const dynamic = "force-dynamic";

/**
 * Everything for the day in one print: the report on top, the release sheet,
 * then a batch sheet per run, department by department. One press.
 */
export default async function PrintAllPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string; line?: string; po?: string }>;
}) {
  const { date, id, line, po } = await searchParams;
  const poNumber = po?.trim().slice(0, 40) || null;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [built, settings, catalog, config] = await Promise.all([
    buildProductionDay(supabase, day, id),
    fetchAppSettings(supabase),
    fetchRecipeCatalog(supabase),
    fetchProductionConfig(supabase),
  ]);
  const products = await buildReleaseProducts(supabase, built);
  const finishedIds = new Set(built.finished.map((row) => row.recipeId));
  const sheets = built.departments.flatMap((group) => group.sheets);
  const records = new Map(
    await Promise.all(
      sheets.map(async (sheet) => [
        sheet.recipeId,
        {
          sheet,
          recipe: catalog.byId.get(sheet.recipeId) ?? null,
          steps: (await fetchInstructions(supabase, sheet.recipeId)).steps,
        },
      ] as const)
    )
  );

  /*
    Department by department, in Settings order, each printing the sheets
    Configuration > Planning > Print sheets gives it: Finished Product gets
    its batch records, the release and its report page; a kitchen gets its
    batch records and its report page. The pile comes out room by room.
  */
  const order = config.departments
    .filter((entry) => entry.active)
    .map((entry) => entry.name)
    .filter((name) =>
      built.departments.some((dept) => dept.department.trim().toUpperCase() === name.trim().toUpperCase())
    );
  for (const dept of built.departments) {
    if (!order.some((name) => name.trim().toUpperCase() === dept.department.trim().toUpperCase())) {
      order.push(dept.department);
    }
  }
  const blocks: { key: string; node: React.ReactNode }[] = [];
  for (const department of order) {
    const group = built.departments.find(
      (dept) => dept.department.trim().toUpperCase() === department.trim().toUpperCase()
    );
    if (!group) continue;
    const isFinishedDept = /finished/i.test(department);
    for (const sheetId of defaultSheetsFor(department, settings.printPlan)) {
      if (sheetId === "batch") {
        for (const sheet of group.sheets) {
          const record = records.get(sheet.recipeId);
          if (!record?.recipe) continue;
          blocks.push({
            key: `${department}-batch-${sheet.recipeId}`,
            node: (
              <RecipePrintSheet
                recipe={record.recipe}
                steps={record.steps}
                scheduled={sheet.quantity}
                productionDate={built.date}
              />
            ),
          });
        }
      } else if (sheetId === "release") {
        const own = isFinishedDept
          ? products
          : products.filter((product) =>
              group.sheets.some((sheet) => sheet.recipeId === product.recipeId && finishedIds.has(sheet.recipeId))
            );
        if (own.length === 0) continue;
        blocks.push({
          key: `${department}-release`,
          node: (
            <ProductReleaseSheet
              date={built.date}
              lineName={line ?? built.scheduleName}
              products={own}
              po={poNumber}
            />
          ),
        });
      } else if (sheetId === "report") {
        blocks.push({
          key: `${department}-report`,
          node: <ProductionReportSheet day={built} department={department} />,
        });
      }
    }
  }

  const back = new URLSearchParams({ date: day });
  if (id) back.set("id", id);
  if (line) back.set("line", line);

  return (
    <PrintFrame
      backHref={`/production/print?${back}`}
      title="The whole day"
      subtitle={`${day} · ${line ?? built.scheduleName} · ${order.length} department${order.length === 1 ? "" : "s"} · ${blocks.length} page${blocks.length === 1 ? "" : "s"}`}
    >
      {blocks.map((block, index) => (
        <div
          key={block.key}
          className={cn("print-break-after", index === 0 ? "" : "print-break-before mt-8 print:mt-0")}
        >
          {block.node}
        </div>
      ))}
      {blocks.length === 0 && <p className="text-sm">Nothing to print: no department has a sheet switched on for this day.</p>}
    </PrintFrame>
  );
}
