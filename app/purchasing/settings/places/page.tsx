import { PageShell } from "@/components/app-shell/page-shell";
import { PlacesSettings } from "@/components/purchasing/places-settings";
import { fetchOdooCompanies, type OdooCompany } from "@/lib/purchasing/odoo";

export const metadata = { title: "Places" };
export const dynamic = "force-dynamic";

export default async function PurchasingPlacesPage() {
  let companies: OdooCompany[] = [];
  let companiesError: string | null = null;
  try {
    companies = await fetchOdooCompanies();
  } catch (error) {
    companiesError =
      error instanceof Error ? error.message : "Could not reach Odoo";
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "Purchasing" },
        { label: "Configuration" },
        { label: "Places" },
      ]}
      meta={
        <span>
          {companies.length} {companies.length === 1 ? "place" : "places"}
        </span>
      }
    >
      <PlacesSettings
        odooCompanies={companies}
        odooError={companiesError}
      />
    </PageShell>
  );
}
