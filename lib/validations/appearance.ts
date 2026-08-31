import { z } from "zod";

/**
 * Launcher wallpaper settings. The colour and URL rules are deliberately
 * strict: both values end up inside a CSS background declaration, so anything
 * looser would let a stored value inject styles.
 */
export const wallpaperSettingsSchema = z
  .object({
    preset: z.enum([
      "kitchen-green",
      "avatar-blue",
      "midnight",
      "light",
      "custom",
    ]),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter a hex colour like #1A8CC6")
      .nullish(),
    imageUrl: z
      .string()
      .max(2000, "That URL is too long")
      .refine(
        (value) =>
          value === "" ||
          value.startsWith("/") ||
          /^https?:\/\//i.test(value),
        "Enter an https:// URL or a path starting with /"
      )
      .nullish(),
    showLogoWatermark: z.boolean(),
  })
  .refine(
    (data) => data.preset !== "custom" || Boolean(data.color) || Boolean(data.imageUrl),
    {
      message: "Pick a colour or an image for a custom wallpaper",
      path: ["color"],
    }
  );

export type WallpaperSettingsValues = z.infer<typeof wallpaperSettingsSchema>;
