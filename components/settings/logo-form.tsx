"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { saveLogoUrl } from "@/lib/settings/logo-actions";
import { isSafeImageUrl } from "@/lib/settings/wallpaper";
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

/**
 * The logo in the top bar.
 *
 * A URL and a preview on the same dark ground the bar uses, so what you see
 * here is what everyone gets. Clearing the field puts the shipped logo back.
 */
export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(logoUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const preview = value.trim() !== "" && isSafeImageUrl(value.trim()) ? value.trim() : null;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveLogoUrl(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
        <CardDescription>
          Shown in the top bar of every app, for everyone. Paste a link to the
          image; leave it empty to use the Avatar Foods logo that ships with
          Bettrbyus.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-sm bg-sidebar px-3 py-2 text-white">
          {preview ? (
            // A plain img: the URL is whatever the admin pasted, and Next's
            // Image would refuse a host it was not configured for.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo preview"
              className="size-9 shrink-0 object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo.png"
              alt="Logo preview"
              className="size-9 shrink-0 object-contain brightness-0 invert"
            />
          )}
          <span className="font-heading text-sm font-bold tracking-tight">
            Production
          </span>
          <span className="ml-auto text-[0.625rem] text-white/60">Preview</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo-url">Image URL</Label>
          <Input
            id="logo-url"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            placeholder="https://… or /logo.png"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            A square PNG or SVG with a transparent background looks best. The
            shipped logo is drawn white on the dark bar; a pasted one is shown
            as it is.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5" />
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save logo"
            )}
          </Button>
          {saved && !pending && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3.5" />
              Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
