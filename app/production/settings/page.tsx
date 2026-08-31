import { redirect } from "next/navigation";

export default function ProductionSettingsIndex() {
  redirect("/production/settings/orders");
}
