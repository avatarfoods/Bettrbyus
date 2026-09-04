"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Mail, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  sliceFinalOrderToGroup,
  type FinalOrderSnapshot,
} from "@/lib/purchasing/finalize-order";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ProfileOption = {
  id: string;
  email: string;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: FinalOrderSnapshot | null;
  groupKey: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function buildEmailBody(snapshot: FinalOrderSnapshot): string {
  const group = snapshot.groups[0];
  const lines = [
    `Final Order PO: ${snapshot.orderNumber}`,
    `Category: ${group?.label ?? "—"}`,
    `Arrival date: ${formatDate(snapshot.requiredDate)}`,
    `Production week: ${snapshot.productionWeek || "—"}`,
    `Status: ${group?.status ?? "to_order"}`,
    group?.earliestOrderBy
      ? `Order by: ${formatDate(group.earliestOrderBy)}`
      : null,
    "",
    "Item #\tDescription\tReq. to order\tCases req.\tOn hand\tOrder by",
  ].filter((line): line is string => line !== null);

  for (const line of group?.lines ?? []) {
    const name = line.isEmergency ? `${line.name} (emergency)` : line.name;
    lines.push(
      [
        line.itemCode,
        name,
        String(line.requiredToOrder),
        String(line.casesRequired),
        line.onHandCases != null ? String(line.onHandCases) : "—",
        formatDate(line.orderByDate),
      ].join("\t")
    );
  }

  lines.push(
    "",
    `Total lines: ${snapshot.totals.lineCount}`,
    `Total cases to order: ${snapshot.totals.casesToOrder}`
  );

  return lines.join("\n");
}

function profileDisplayName(row: {
  full_name: string | null;
  email: string | null;
}): string {
  const name = row.full_name?.trim();
  if (name) return name;
  return row.email?.trim() || "Unknown";
}

export function PurchasingEmailCategoryDialog({
  open,
  onOpenChange,
  snapshot,
  groupKey,
}: Props) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const part = useMemo(() => {
    if (!snapshot || !groupKey) return null;
    return sliceFinalOrderToGroup(snapshot, groupKey);
  }, [snapshot, groupKey]);

  const filteredProfiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter(
      (profile) =>
        profile.name.toLowerCase().includes(needle) ||
        profile.email.toLowerCase().includes(needle)
    );
  }, [profiles, query]);

  /*
    Clearing the last search happens while rendering; fetching stays in the
    effect where it belongs. Doing both in the effect meant the dialog opened
    showing the previous recipient list for a frame before it emptied.
  */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSelectedIds(new Set());
      setQuery("");
      setError(null);
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setProfiles([]);
        setError(fetchError.message || "Could not load users.");
        setLoading(false);
        return;
      }

      const options: ProfileOption[] = (data ?? [])
        .map((row) => {
          const email = row.email?.trim() ?? "";
          if (!email) return null;
          return {
            id: row.id as string,
            email,
            name: profileDisplayName(row),
          };
        })
        .filter((row): row is ProfileOption => row != null)
        .sort((a, b) => a.name.localeCompare(b.name));

      setProfiles(options);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSend() {
    if (!part) return;
    const recipients = profiles.filter((profile) => selectedIds.has(profile.id));
    if (recipients.length === 0) {
      setError("Select at least one user.");
      return;
    }

    const subject = `Order ${part.orderNumber}`;
    const body = buildEmailBody(part);
    const to = recipients.map((profile) => profile.email).join(",");
    const href = `mailto:${to}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" />
            Email category
          </DialogTitle>
          <DialogDescription>
            {part
              ? `Send ${part.groups[0]?.label ?? "category"} from ${
                  snapshot?.orderNumber ?? "order"
                } to selected users.`
              : "Choose users to email this category order."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name…"
            className="pl-8"
            autoFocus
            disabled={loading || profiles.length === 0}
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading users…
            </div>
          ) : profiles.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No users with an email address found.
            </p>
          ) : filteredProfiles.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No users match “{query.trim()}”.
            </p>
          ) : (
            <ul className="divide-y">
              {filteredProfiles.map((profile) => {
                const checked = selectedIds.has(profile.id);
                return (
                  <li key={profile.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50",
                        checked && "bg-muted/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleUser(profile.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {profile.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {profile.email}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!part || loading || selectedIds.size === 0}
            onClick={handleSend}
          >
            <Mail />
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
