"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Search, UserPlus, X } from "lucide-react";
import type { UserRow } from "@/lib/users/fetch-users";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

type Filter = "all" | "admins" | "users" | "never" | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admins", label: "Administrators" },
  { id: "users", label: "Users" },
  { id: "never", label: "Never connected" },
  { id: "archived", label: "Archived" },
];

/** Odoo's Users list. Click a row to open the record. */
export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return users.filter((user) => {
      if (filter === "admins" && !user.isAdmin) return false;
      if (filter === "users" && user.isAdmin) return false;
      if (filter === "never" && !user.neverConnected) return false;
      if (filter === "archived" && !user.archived) return false;
      // Archived users are out of the way unless asked for.
      if (filter !== "archived" && user.archived) return false;
      if (!needle) return true;
      return (
        user.email.toLowerCase().includes(needle) ||
        (user.fullName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [users, query, filter]);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/settings/users/new"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          <UserPlus className="size-3.5" />
          New
        </Link>

        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email…"
            aria-label="Search users"
            className="h-8 w-full rounded-sm bg-card ring-1 ring-foreground/10 pr-7 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          aria-label="Filter users"
          className="h-8 rounded-sm bg-card ring-1 ring-foreground/10 px-2 text-sm"
        >
          {FILTERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {rows.length} / {users.length}
        </span>
      </div>

      {/* Desktop / iPad */}
      <div className="hidden md:block">
        <DataTable>
          <THead
            columns={[
              { label: "Name" },
              { label: "Login" },
              { label: "Type" },
              { label: "Latest authentication" },
              { label: "Status" },
              { label: "", className: "w-10" },
            ]}
          />
          <TBody>
            {rows.map((user) => (
              <TR
                key={user.id}
                onClick={() => router.push(`/settings/users/${user.id}`)}
              >
                <TD strong>
                  {user.fullName ?? (
                    <span className="text-muted-foreground italic">No name</span>
                  )}
                </TD>
                <TD muted>{user.email}</TD>
                <TD>
                  {user.isAdmin ? (
                    <span className="text-primary">Administrator</span>
                  ) : (
                    <span className="text-muted-foreground">User</span>
                  )}
                </TD>
                <TD muted>
                  <LastSeen value={user.lastSignInAt} />
                </TD>
                <TD>
                  <StatusPill user={user} />
                </TD>
                <TD>
                  <span
                    aria-hidden
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground"
                    title="Edit user"
                  >
                    <Pencil className="size-3.5" />
                  </span>
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TableEmpty colSpan={6}>No users match that search.</TableEmpty>
            )}
          </TBody>
        </DataTable>
      </div>

      {/* Phone */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((user) => (
          <li key={user.id}>
            <Link
              href={`/settings/users/${user.id}`}
              className="flex flex-col gap-2 rounded-sm bg-card ring-1 ring-foreground/10 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user.fullName ?? "No name"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <StatusPill user={user} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-right">
                  {user.isAdmin ? "Administrator" : "User"}
                </dd>
                <dt className="text-muted-foreground">Last seen</dt>
                <dd className="text-right tabular-nums">
                  <LastSeen value={user.lastSignInAt} />
                </dd>
              </dl>
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">
            No users match that search.
          </li>
        )}
      </ul>
    </div>
  );
}

function StatusPill({ user }: { user: UserRow }) {
  const [label, tone] = user.archived
    ? (["Archived", "bg-warning-muted text-warning-foreground"] as const)
    : user.neverConnected
      ? (["Never connected", "bg-muted text-muted-foreground"] as const)
      : (["Confirmed", "bg-success-muted text-success"] as const);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[1px] px-2 py-0.5 text-[0.6875rem] font-medium",
        tone
      )}
    >
      {label}
    </span>
  );
}

/**
 * Rendered on the server first, then corrected in the browser so the timestamp
 * is in the viewer's timezone rather than the server's.
 */
function LastSeen({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/70">—</span>;

  const date = new Date(value);
  return (
    <time dateTime={value} suppressHydrationWarning>
      {date.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}
