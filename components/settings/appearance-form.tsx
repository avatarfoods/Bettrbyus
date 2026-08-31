"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import { saveWallpaperSettings } from "@/lib/settings/actions";
import {
  WALLPAPER_PRESETS,
  wallpaperStyle,
  type AppSettings,
  type WallpaperPresetId,
} from "@/lib/settings/wallpaper";
import {
  wallpaperSettingsSchema,
  type WallpaperSettingsValues,
} from "@/lib/validations/appearance";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type AppearanceFormProps = {
  settings: AppSettings;
};

export function AppearanceForm({ settings }: AppearanceFormProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    control,
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<WallpaperSettingsValues>({
    resolver: zodResolver(wallpaperSettingsSchema),
    defaultValues: {
      preset: settings.wallpaperPreset,
      color: settings.wallpaperColor ?? "#1B3A2B",
      imageUrl: settings.wallpaperImageUrl ?? "",
      showLogoWatermark: settings.showLogoWatermark,
    },
  });

  // useWatch subscribes per-field rather than re-rendering the whole form on
  // every keystroke, which keeps the live preview cheap.
  const preset = useWatch({ control, name: "preset" });
  const color = useWatch({ control, name: "color" });
  const imageUrl = useWatch({ control, name: "imageUrl" });
  const showLogoWatermark = useWatch({ control, name: "showLogoWatermark" });

  const preview = wallpaperStyle({
    wallpaperPreset: preset,
    wallpaperColor: color ?? null,
    wallpaperImageUrl: imageUrl || null,
    showLogoWatermark,
  });

  async function onSubmit(values: WallpaperSettingsValues) {
    setSaveError(null);
    setSaved(false);

    const result = await saveWallpaperSettings(values);

    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Personal, not company-wide - kept in its own card so the distinction
          is visible rather than something you have to be told. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Light &amp; dark mode</CardTitle>
          <CardDescription>
            Your own setting. It applies to this account on this device only, and
            does not change what anyone else sees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle showLabel className="h-10 border border-border px-3" />
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Launcher wallpaper</CardTitle>
            <CardDescription>
              Shared by everyone at Avatar Foods. This is the background behind
              the app tiles on the home screen.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <div
              className="flex h-32 items-center justify-center rounded-xl ring-1 ring-foreground/10"
              style={{ background: preview.background, color: preview.color }}
            >
              <span className="text-sm font-medium opacity-80">Preview</span>
            </div>

            <Controller
              control={control}
              name="preset"
              render={({ field }) => (
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-sm font-medium">Background</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {WALLPAPER_PRESETS.map((option) => (
                      <PresetSwatch
                        key={option.id}
                        id={option.id}
                        label={option.label}
                        background={option.background}
                        selected={field.value === option.id}
                        onSelect={field.onChange}
                      />
                    ))}
                    <PresetSwatch
                      id="custom"
                      label="Custom"
                      background={
                        "repeating-linear-gradient(45deg, var(--muted) 0 8px, var(--background) 8px 16px)"
                      }
                      selected={field.value === "custom"}
                      onSelect={field.onChange}
                    />
                  </div>
                </fieldset>
              )}
            />

            {preset === "custom" && (
              <div className="flex flex-col gap-5 rounded-lg bg-muted/50 p-4">
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="color">Colour</Label>
                      <div className="flex items-center gap-3">
                        {/* Swatch and text box drive the same field, so typing a
                            hex and picking one stay in sync. */}
                        <input
                          type="color"
                          aria-label="Pick a wallpaper colour"
                          className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
                          value={normalizeHex(field.value)}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
                        <Input
                          id="color"
                          placeholder="#1A8CC6"
                          className="h-10 font-mono"
                          aria-invalid={!!errors.color}
                          name={field.name}
                          ref={field.ref}
                          value={field.value ?? ""}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
                      </div>
                      {errors.color && (
                        <p className="text-sm text-destructive">
                          {errors.color.message}
                        </p>
                      )}
                    </div>
                  )}
                />

                <div className="flex flex-col gap-2">
                  <Label htmlFor="imageUrl">Image URL (optional)</Label>
                  <Input
                    id="imageUrl"
                    placeholder="https://… or /wallpaper.jpg"
                    className="h-10"
                    aria-invalid={!!errors.imageUrl}
                    {...register("imageUrl")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Layered over the colour, with a dark scrim so the tile labels
                    stay readable. Drop a file in <code>/public</code> and use a
                    path like <code>/wallpaper.jpg</code>.
                  </p>
                  {errors.imageUrl && (
                    <p className="text-sm text-destructive">
                      {errors.imageUrl.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            <Controller
              control={control}
              name="showLogoWatermark"
              render={({ field }) => (
                <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Logo watermark</span>
                    <span className="text-xs text-muted-foreground">
                      Show the Avatar Foods mark behind the tiles on wide screens.
                    </span>
                  </span>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    name={field.name}
                  >
                    <SwitchThumb />
                  </Switch>
                </label>
              )}
            />

            {saved && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-success/25 bg-success-muted px-4 py-3 text-sm text-success"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>Wallpaper saved. Everyone sees it on the home screen.</span>
              </div>
            )}

            {saveError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                className="h-10 font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save wallpaper"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

/**
 * <input type="color"> only accepts #rrggbb. A half-typed hex in the text box
 * would otherwise make React warn and reset the swatch to black.
 */
function normalizeHex(value: string | null | undefined): string {
  if (typeof value !== "string") return "#1B3A2B";
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#1B3A2B";
}

function PresetSwatch({
  id,
  label,
  background,
  selected,
  onSelect,
}: {
  id: WallpaperPresetId;
  label: string;
  background: string;
  selected: boolean;
  onSelect: (id: WallpaperPresetId) => void;
}) {
  return (
    <button
      type="button"
      data-slot="button"
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg p-1.5 text-left transition-colors outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected ? "bg-accent" : "hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "relative flex h-16 items-center justify-center rounded-md ring-1 ring-foreground/10",
          selected && "ring-2 ring-primary"
        )}
        style={{ background }}
      >
        {selected && (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" />
          </span>
        )}
      </span>
      <span className="px-0.5 text-xs font-medium">{label}</span>
    </button>
  );
}
