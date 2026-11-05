import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, getUserId } from "./supabase/server";

/** The signed-in person's profile, sending them to sign-in or setup if needed. */
export const requireProfile = cache(async () => {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, sex, timezone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.display_name || !data.sex) redirect("/onboarding");
  return { userId, name: data.display_name, timezone: data.timezone };
});
