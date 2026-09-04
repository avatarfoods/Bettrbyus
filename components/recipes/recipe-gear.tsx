"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Layers } from "lucide-react";
import {
  GearButton,
  GearDialog,
  GearLink,
} from "@/components/ui/gear-dialog";

export type RecipePageId = "recipes" | "history" | "settings";

const PAGES: { id: RecipePageId; label: string; href: string; hint: string }[] = [
  {
    id: "history",
    label: "Changes",
    href: "/recipes/history",
    hint: "Every recipe edit in the plant, newest first - who changed what, and when.",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/recipes/settings",
    hint: "Product groups: which materials can stand in for each other, and their pack sizes.",
  },
];

/**
 * The gear beside the Recipes title.
 *
 * Home for the paperwork behind the recipes: the change log and the settings.
 * They are for administrators and opened once in a while, so they sit behind
 * the same gear every page has, and open the same window in the middle. On
 * one of those pages the gear names where you are and offers the way back.
 */
export function RecipeGear({
  current,
  isAdmin,
}: {
  current: RecipePageId;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;

  const here = PAGES.find((page) => page.id === current);

  return (
    <span className="inline-flex items-center gap-1.5">
      {here && (
        <Link
          href="/recipes"
          className="inline-flex h-7 items-center rounded-sm px-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Back to the recipes"
        >
          {here.label}
        </Link>
      )}
      <GearButton
        onClick={() => setOpen(true)}
        label="Recipe settings"
        title="Changes, settings"
      />
      <GearDialog
        open={open}
        onOpenChange={setOpen}
        title="Recipes"
        description="The paperwork behind the recipes."
      >
        {PAGES.map((page) => (
          <GearLink
            key={page.id}
            href={page.href}
            icon={page.id === "history" ? <History /> : <Layers />}
            title={page.id === current ? `${page.label} (this page)` : page.label}
            hint={page.hint}
            onClick={() => setOpen(false)}
          />
        ))}
        {current !== "recipes" && (
          <GearLink
            href="/recipes"
            title="Back to the recipes"
            onClick={() => setOpen(false)}
          />
        )}
      </GearDialog>
    </span>
  );
}
