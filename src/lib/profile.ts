import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, getUserId } from "./supabase/server";

export const isApproved = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("signup_approvals").select("approved").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.approved === true;
});

/** The signed-in, approved person's id, sending anyone else to the right page. */
export const requireApproved = cache(async (): Promise<string> => {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");
  if (!(await isApproved(userId))) redirect("/waiting");
  return userId;
});

/** The signed-in person's profile, sending them to sign-in, approval or setup if needed. */
export const requireProfile = cache(async () => {
  const userId = await requireApproved();

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
