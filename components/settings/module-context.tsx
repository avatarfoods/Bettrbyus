"use client";

import { createContext, useContext } from "react";
import type { AppDefinition } from "@/lib/apps";

/**
 * Which module is open, and whether this user can edit its Configuration.
 *
 * Every signed-in page sits inside this. A new module does not invent its
 * own chrome, table, or settings layout — it reads the current app from here
 * and uses the same SettingsPage / DataTable pieces as Production and HR.
 */

export type ModuleSettings = {
  app: AppDefinition | null;
  isAdmin: boolean;
};

const ModuleSettingsContext = createContext<ModuleSettings | null>(null);

export function ModuleSettingsProvider({
  app,
  isAdmin,
  children,
}: ModuleSettings & { children: React.ReactNode }) {
  return (
    <ModuleSettingsContext.Provider value={{ app, isAdmin }}>
      {children}
    </ModuleSettingsContext.Provider>
  );
}

export function useModuleSettings(): ModuleSettings {
  const value = useContext(ModuleSettingsContext);
  if (!value) {
    throw new Error("useModuleSettings must be used inside ModuleSettingsProvider");
  }
  return value;
}
