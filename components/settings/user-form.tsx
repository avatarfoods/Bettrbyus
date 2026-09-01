"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArchiveRestore,
  ArchiveX,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
} from "lucide-react";
import {
  sendPasswordReset,
  setUserArchived,
  setUserPassword,
  updateUser,
  type ActionResult,
} from "@/lib/users/actions";
import type { UserRow } from "@/lib/users/fetch-users";
import { ButtonTabBar, TabBody, type TabItem } from "@/components/ui/tab-bar";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TABS: TabItem[] = [
  { id: "details", label: "Details" },
  { id: "security", label: "Security" },
];

/**
 * One user, Odoo-shaped: identity at the top, then Access Rights and Account
 * Security as tabs. Access rights are just admin/user today, but the tab is
 * where per-app permissions go when they arrive.
 */
export function UserForm({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState("details");

  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [email, setEmail] = useState(user.email);
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [password, setPassword] = useState("");

  const [notice, setNotice] = useState<
    { tone: "ok" | "bad"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, successText: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setNotice({ tone: "ok", text: successText });
        router.refresh();
      } else {
        setNotice({ tone: "bad", text: result.message });
      }
    });
  }

  return (
    <div className="flex flex-col">
      {/* Identity header */}
      <div className="border-b border-border bg-card px-3 pt-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[1px] bg-primary text-lg font-semibold text-primary-foreground">
              {(user.fullName ?? user.email).trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">
                {user.fullName ?? user.email}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{user.email}</span>
                <Pill tone={user.isAdmin ? "brand" : "muted"}>
                  {user.isAdmin ? "Administrator" : "User"}
                </Pill>
                {user.archived ? (
                  <Pill tone="warning">Archived</Pill>
                ) : user.neverConnected ? (
                  <Pill tone="muted">Never connected</Pill>
                ) : (
                  <Pill tone="success">Confirmed</Pill>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={pending || isSelf}
            title={isSelf ? "You cannot archive your own account" : undefined}
            onClick={() =>
              run(
                () => setUserArchived(user.id, !user.archived),
                user.archived ? "User restored" : "User archived"
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            {user.archived ? (
              <>
                <ArchiveRestore className="size-3.5" /> Restore
              </>
            ) : (
              <>
                <ArchiveX className="size-3.5" /> Archive
              </>
            )}
          </button>
        </div>

        <ButtonTabBar
          items={TABS}
          activeId={tab}
          onSelect={setTab}
          className="mt-4 -mx-3 border-b-0 sm:-mx-4"
        />
      </div>

      <TabBody>
        {notice && (
          <div
            role={notice.tone === "bad" ? "alert" : "status"}
            className={cn(
              "mb-4 flex items-start gap-2.5 rounded-md px-3 py-2 text-sm",
              notice.tone === "ok"
                ? "bg-success-muted text-success"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {notice.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            {notice.text}
          </div>
        )}

        {tab === "details" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () => updateUser({ userId: user.id, fullName, email, isAdmin }),
                "Saved"
              );
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Full name" htmlFor="fullName">
              <input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </Field>

            <Field
              label="Login email"
              htmlFor="email"
              hint="This is what they sign in with. Changing it changes their login."
            >
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                autoComplete="email"
              />
            </Field>

            </div>

            <label className="flex max-w-3xl items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Administrator</span>
                <span className="text-xs text-muted-foreground">
                  Can open Settings, manage users and change the wallpaper.
                </span>
              </span>
              <Switch
                checked={isAdmin}
                onCheckedChange={setIsAdmin}
                disabled={isSelf}
              >
                <SwitchThumb />
              </Switch>
            </label>
            {isSelf && (
              <p className="-mt-2 text-xs text-muted-foreground">
                You cannot change your own admin access.
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save
              </button>
            </div>
          </form>
        )}

        {tab === "security" && (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <SectionHead
                title="Set a password"
                hint="Use this for someone who cannot receive email. Tell them the password yourself."
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className={cn(inputClass, "max-w-xs flex-1")}
                />
                <button
                  type="button"
                  disabled={pending || password.length < 6}
                  onClick={() =>
                    run(async () => {
                      const result = await setUserPassword({
                        userId: user.id,
                        password,
                      });
                      if (result.ok) setPassword("");
                      return result;
                    }, "Password changed")
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <KeyRound className="size-3.5" />
                  Change password
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHead
                title="Send a reset link"
                hint="Emails them a link so they choose their own password."
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => sendPasswordReset(user.email),
                    `Reset link sent to ${user.email}`
                  )
                }
                className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Mail className="size-3.5" />
                Send reset email
              </button>
            </section>

            <section className="flex flex-col gap-1 border-t border-border pt-4 text-sm text-muted-foreground">
              <SectionHead title="Account" />
              <Row label="Last sign-in">
                {user.lastSignInAt
                  ? new Date(user.lastSignInAt).toLocaleString()
                  : "Never"}
              </Row>
              <Row label="Created">
                {new Date(user.createdAt).toLocaleDateString()}
              </Row>
              <Row label="User ID">
                <span className="font-mono text-xs">{user.id}</span>
              </Row>
              <p className="mt-3 text-xs">
                There is no delete. Records like inventory checks point at the
                person who made them, so accounts are archived instead — the
                history stays intact.
              </p>
            </section>
          </div>
        )}
      </TabBody>
    </div>
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

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-[0.6875rem] font-semibold tracking-wider uppercase">
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <span>{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "brand" | "muted" | "success" | "warning";
  children: React.ReactNode;
}) {
  const styles = {
    brand: "bg-brand-muted text-primary",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success-muted text-success",
    warning: "bg-warning-muted text-warning-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-[1px] px-2 py-0.5 text-[0.6875rem] font-medium",
        styles[tone]
      )}
    >
      {children}
    </span>
  );
}
