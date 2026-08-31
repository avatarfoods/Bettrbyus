import { redirect } from "next/navigation";

// The invite form moved into the Users app, where it sits alongside the
// create-with-password path and shares the same design.
export default function LegacyInvitePage() {
  redirect("/settings/users/new");
}
