export type StorageType = "dry" | "refrigerated" | "frozen" | "produce";

export type Material = {
  id: string;
  item_code: string;
  name: string;
  odoo_product_id: number | null;
  odoo_category: string | null;
  /** The Odoo company this material is purchased under (Yaya's, Avatar, …). */
  odoo_company_id: number | null;
  odoo_company_name: string | null;
  storage_type: StorageType | null;
  /** Ingredient matrix department (Finished Product, Fresh Mixing, …). */
  department: string | null;
  lbs_per_case: number | null;
  is_protein: boolean;
  thaw_buffer_days: number;
  lead_time_days: number;
  price: number | null;
  active: boolean;
  last_synced_at: string | null;
};

export type InventorySnapshot = {
  id: string;
  material_id: string;
  qty_on_hand: number;
  source: "odoo_api" | "file_upload" | "manual_override";
  fetched_at: string;
};

export type MaterialWithOnHand = Material & {
  on_hand: number | null;
  on_hand_source: InventorySnapshot["source"] | null;
  on_hand_fetched_at: string | null;
};

export type SyncResult = {
  ok: boolean;
  message: string;
  created?: number;
  updated?: number;
  snapshots?: number;
};
