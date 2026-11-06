"use server";

import { createClient } from "@/lib/supabase/server";

export type ApproveResult = { error?: string };

/** The database checks that the caller is a developer. */
export async function approveSignup(userId: string): Promise<ApproveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_signup", { p_user_id: userId });
  if (error) {
    console.error("approve_signup_failed", { code: error.code });
    return { error: "That person wasn't approved. Try again." };
  }
  return {};
}
