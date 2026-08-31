"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, KeyRound, Loader2, Mail, RefreshCw } from "lucide-react";
import { createUser } from "@/lib/users/actions";
import { suggestPassword } from "@/lib/users/password";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Mode = "password" | "invite";

/**
 * Adding a user, both ways.
 *
 * Floor staff often have no company mailbox, so an emailed invite is useless
 * to them - an admin sets a password and hands it over. Office staff get the
 * invite. One screen, one choice at the top.
 */
export function NewUserForm({ initialPassword }: { initialPassword: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  // Generated on the server and passed in, so the first client render matches
  // it exactly. Generating here would produce a different string in the
  // browser than in the HTML - a hydration mismatch.
  const [password, setPassword] = useState(initialPassword);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser({
        fullName,
        email,
        isAdmin,
        mode,
        password: mode === "password" ? password : undefined,
      });
      if (result.ok) {
        router.push(`/settings/users/${result.userId}`);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-3 py-5 sm:px-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
          How do they get in?
        </legend>
        <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
          <ModeCard
            active={mode === "password"}
            onSelect={() => setMode("password")}
            icon={<KeyRound className="size-4" />}
            title="Set a password now"
            hint="For anyone without a work mailbox. You hand them the password."
          />
          <ModeCard
            active={mode === "invite"}
            onSelect={() => setMode("invite")}
            icon={<Mail className="size-4" />}
            title="Send an invite email"
            hint="They click a link and choose their own password."
          />
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
      <Field label="Full name" htmlFor="fullName">
        <input
          id="fullName"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jose Silva"
          autoComplete="name"
          className={inputClass}
        />
      </Field>

      <Field
        label="Login email"
        htmlFor="email"
        hint={
          mode === "password"
            ? "Used only to sign in. It never has to receive mail, so an internal address like jsilva@bettrbyus.local is fine."
            : "The invite is sent here, so it must be a real mailbox."
        }
      >
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jose@avatarnaturalfoods.com"
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      </div>

      {mode === "password" && (
        <Field label="Password" htmlFor="password">
          <div className="flex items-center gap-2">
            <input
              id="password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className={cn(inputClass, "font-mono")}
            />
            <button
              type="button"
              onClick={() => setPassword(suggestPassword())}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              New
            </button>
          </div>
        </Field>
      )}

      <label className="flex max-w-3xl items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Administrator</span>
          <span className="text-xs text-muted-foreground">
            Can open Settings, manage users and change the wallpaper.
          </span>
        </span>
        <Switch checked={isAdmin} onCheckedChange={setIsAdmin}>
          <SwitchThumb />
        </Switch>
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/settings/users")}
          className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode === "password" ? "Create user" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ModeCard({
  active,
  onSelect,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-accent/60 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          active ? "text-primary" : "text-foreground"
        )}
      >
        {icon}
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
