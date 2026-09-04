"use client";

import { createContext, useContext, useMemo } from "react";
import {
  selectedCompanyIds,
  type PurchasingPlaces,
} from "@/lib/purchasing/places";

/**
 * Saved Purchasing configuration, available on every Purchasing page.
 *
 * Places are chosen once under Configuration and then used by Materials,
 * sync, and anything else in this module — not re-picked on each screen.
 */

export type PurchasingConfig = {
  places: PurchasingPlaces;
  companyIds: number[] | null;
};

const PurchasingConfigContext = createContext<PurchasingConfig | null>(null);

export function PurchasingConfigProvider({
  places,
  children,
}: {
  places: PurchasingPlaces;
  children: React.ReactNode;
}) {
  const value = useMemo<PurchasingConfig>(
    () => ({ places, companyIds: selectedCompanyIds(places) }),
    [places]
  );

  return (
    <PurchasingConfigContext.Provider value={value}>
      {children}
    </PurchasingConfigContext.Provider>
  );
}

export function usePurchasingConfig(): PurchasingConfig {
  const value = useContext(PurchasingConfigContext);
  if (!value) {
    throw new Error(
      "usePurchasingConfig must be used inside PurchasingConfigProvider"
    );
  }
  return value;
}
