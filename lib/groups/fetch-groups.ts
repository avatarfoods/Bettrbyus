import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Interchangeable item groups.
 *
 * A group answers "what else can I use instead of this?" — and, because the
 * members come in wildly different pack sizes, "how much of it".
 */

export type GroupMember = {
  id: string;
  materialId: string;
  itemCode: string;
  name: string;
  /** How much of the group's uom one purchase unit holds. */
  packSize: number | null;
  rank: number;
  notes: string | null;
  onHand: number | null;
  /** Set when the member cannot take part in substitution, and why. */
  warning: string | null;
};

export type ItemGroup = {
  id: string;
  name: string;
  uom: string;
  notes: string | null;
  active: boolean;
  members: GroupMember[];
  /** Members missing a pack size — they cannot be substituted safely. */
  incompleteCount: number;
};

export type GroupsData = {
  groups: ItemGroup[];
  /** True when the tables are missing, so the page can say so plainly. */
  missingTables: boolean;
};

export type MaterialOption = {
  id: string;
  itemCode: string;
  name: string;
  lbsPerCase: number | null;
  /** Group this item already belongs to, if any. */
  groupName: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  uom: string | null;
  notes: string | null;
  active: boolean | null;
};

type MemberRow = {
  id: string;
  group_id: string;
  material_id: string;
  pack_size: number | null;
  rank: number | null;
  notes: string | null;
};

type MaterialRow = {
  id: string;
  item_code: string;
  name: string;
  lbs_per_case: number | null;
};

export async function fetchGroups(
  supabase: SupabaseClient
): Promise<GroupsData> {
  const [groupsResult, membersResult] = await Promise.all([
    supabase
      .from("item_groups")
      .select("id, name, uom, notes, active")
      .order("name"),
    supabase
      .from("item_group_members")
      .select("id, group_id, material_id, pack_size, rank, notes")
      .order("rank"),
  ]);

  if (groupsResult.error) {
    return { groups: [], missingTables: true };
  }

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const materialIds = [...new Set(memberRows.map((row) => row.material_id))];

  const materialsById = new Map<string, MaterialRow>();
  const onHandById = new Map<string, number>();

  if (materialIds.length > 0) {
    const { data: materials } = await supabase
      .from("purchasing_materials")
      .select("id, item_code, name, lbs_per_case")
      .in("id", materialIds);

    for (const row of (materials ?? []) as MaterialRow[]) {
      materialsById.set(row.id, row);
    }

    // Latest on-hand snapshot per material, so the group shows what is
    // actually available to substitute from rather than just what exists.
    const { data: snapshots } = await supabase
      .from("purchasing_inventory_snapshots")
      .select("material_id, qty_on_hand, fetched_at")
      .in("material_id", materialIds)
      .order("fetched_at", { ascending: false });

    for (const row of snapshots ?? []) {
      const entry = row as { material_id: string; qty_on_hand: number };
      if (!onHandById.has(entry.material_id)) {
        onHandById.set(entry.material_id, Number(entry.qty_on_hand));
      }
    }
  }

  const byGroup = new Map<string, GroupMember[]>();

  for (const row of memberRows) {
    const material = materialsById.get(row.material_id);
    if (!material) continue;

    const packSize =
      row.pack_size !== null ? Number(row.pack_size) : null;

    const member: GroupMember = {
      id: row.id,
      materialId: row.material_id,
      itemCode: material.item_code,
      name: material.name,
      packSize,
      rank: row.rank ?? 1,
      notes: row.notes,
      onHand: onHandById.get(row.material_id) ?? null,
      warning:
        packSize === null || packSize <= 0
          ? "No pack size — this item is skipped when substituting, because there is no way to know how much one purchase unit holds."
          : null,
    };

    const bucket = byGroup.get(row.group_id);
    if (bucket) bucket.push(member);
    else byGroup.set(row.group_id, [member]);
  }

  const groups: ItemGroup[] = ((groupsResult.data ?? []) as GroupRow[]).map(
    (row) => {
      const members = (byGroup.get(row.id) ?? []).sort(
        (a, b) => a.rank - b.rank || a.itemCode.localeCompare(b.itemCode)
      );
      return {
        id: row.id,
        name: row.name,
        uom: row.uom ?? "LB",
        notes: row.notes,
        active: row.active ?? true,
        members,
        incompleteCount: members.filter((m) => m.warning !== null).length,
      };
    }
  );

  return { groups, missingTables: false };
}

/**
 * The catalogue to pick members from, annotated with the group each item is
 * already in — so nobody adds the same item to two groups by accident.
 */
export async function fetchMaterialOptions(
  supabase: SupabaseClient
): Promise<MaterialOption[]> {
  const [materialsResult, membersResult, groupsResult] = await Promise.all([
    supabase
      .from("purchasing_materials")
      .select("id, item_code, name, lbs_per_case")
      .eq("active", true)
      .order("item_code"),
    supabase.from("item_group_members").select("material_id, group_id"),
    supabase.from("item_groups").select("id, name"),
  ]);

  const groupNameById = new Map(
    ((groupsResult.data ?? []) as { id: string; name: string }[]).map((row) => [
      row.id,
      row.name,
    ])
  );

  const groupByMaterial = new Map<string, string>();
  for (const row of (membersResult.data ?? []) as {
    material_id: string;
    group_id: string;
  }[]) {
    const name = groupNameById.get(row.group_id);
    if (name) groupByMaterial.set(row.material_id, name);
  }

  return ((materialsResult.data ?? []) as MaterialRow[]).map((row) => ({
    id: row.id,
    itemCode: row.item_code,
    name: row.name,
    lbsPerCase: row.lbs_per_case !== null ? Number(row.lbs_per_case) : null,
    groupName: groupByMaterial.get(row.id) ?? null,
  }));
}
