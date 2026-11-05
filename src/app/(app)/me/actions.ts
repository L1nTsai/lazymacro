"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DeleteState = { error?: string };

export async function deleteAccount(_: DeleteState, form: FormData): Promise<DeleteState> {
  if (String(form.get("confirmation")).trim().toLowerCase() !== "delete") {
    return { error: "Type delete to confirm." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("delete_account_failed", { code: error.code });
    return { error: "Your account wasn't deleted. Try again." };
  }
  // The server-side session is already gone; this only clears local cookies.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?notice=deleted");
}
