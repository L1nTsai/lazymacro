"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DeleteState = { error?: string };
export type PasswordState = { error?: string; saved?: boolean };

export async function changePassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password"));
  if (password.length < 10 || password.length > 72) return { error: "Use a password of 10 to 72 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a different password." };
    if (error.code === "weak_password") return { error: "Choose a less common password." };
    console.error("password_change_failed", { code: error.code, status: error.status });
    return { error: "Your password wasn't changed. Try again." };
  }
  return { saved: true };
}

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
