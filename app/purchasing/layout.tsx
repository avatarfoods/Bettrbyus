import { PurchasingConfigProvider } from "@/components/purchasing/config-context";
import { fetchPurchasingPlaces } from "@/lib/purchasing/places";
import { createClient } from "@/lib/supabase/server";

/**
 * Loads the saved places once for the whole Purchasing module, so Materials,
 * Configuration, and sync all see the same selection.
 */
export default async function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const places = await fetchPurchasingPlaces(supabase);

  return (
    <PurchasingConfigProvider places={places}>{children}</PurchasingConfigProvider>
  );
}
