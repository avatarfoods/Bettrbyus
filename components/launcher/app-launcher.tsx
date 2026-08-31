import Image from "next/image";
import Link from "next/link";
import { TINT_CLASSES, type AppDefinition } from "@/lib/apps";
import { wallpaperStyle, type AppSettings } from "@/lib/settings/wallpaper";
import { cn } from "@/lib/utils";

type AppLauncherProps = {
  apps: AppDefinition[];
  settings: AppSettings;
};

/**
 * The home screen: nothing but apps. Every page in the system is reached by
 * tile > menu > item, which is what stops the top bar turning back into a flat
 * strip of unrelated links.
 *
 * The tiles are cards rather than big rounded app icons - flat, tight corners,
 * and carrying their description. A grid of glossy squares reads as a phone
 * home screen; this is a plant tool, and it should look like one.
 */
export function AppLauncher({ apps, settings }: AppLauncherProps) {
  const wallpaper = wallpaperStyle(settings);

  return (
    <div
      className="relative flex min-h-[calc(100dvh-var(--app-bar-height,3.5rem))] w-full flex-col overflow-hidden"
      style={{ background: wallpaper.background, color: wallpaper.color }}
    >
      {settings.showLogoWatermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 items-center justify-center lg:flex"
        >
          <Image
            src="/logo.png"
            alt=""
            width={520}
            height={520}
            className={cn(
              "w-[min(30vw,26rem)] max-w-none select-none",
              // The wordmark is near-black, so on a dark wallpaper it has to be
              // knocked out to white rather than simply faded.
              wallpaper.dark ? "opacity-[0.06] brightness-0 invert" : "opacity-[0.05]"
            )}
          />
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1
          className={cn(
            "mb-5 text-[0.6875rem] font-semibold tracking-wider uppercase",
            wallpaper.dark ? "text-white/60" : "text-foreground/50"
          )}
        >
          Apps
        </h1>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppTile key={app.id} app={app} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AppTile({ app }: { app: AppDefinition }) {
  const Icon = app.icon;
  const tint = TINT_CLASSES[app.tint];

  return (
    <Link
      href={app.href}
      className={cn(
        "group flex items-center gap-3 rounded-lg bg-card p-3.5 ring-1 ring-black/[0.07] outline-none",
        "transition-colors hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted",
          tint.icon
        )}
      >
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-card-foreground">
          {app.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {app.description}
        </span>
      </span>
    </Link>
  );
}
