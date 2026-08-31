import { redirect } from "next/navigation";

/**
 * Finished products stopped being their own section.
 *
 * A finished product is a recipe; its specification is a tab on that recipe.
 * This redirect keeps old links and bookmarks working rather than 404ing on
 * people who had the page open.
 */
export default function FinishedProductsRedirect() {
  redirect("/recipes");
}
