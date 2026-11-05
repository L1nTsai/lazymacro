"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const confirmation = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["signup", "recovery", "email_change"]),
});

export async function confirmEmail(form: FormData) {
  const parsed = confirmation.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/sign-in?notice=link-expired");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp(parsed.data);
  if (error) redirect("/sign-in?notice=link-expired");
  redirect(parsed.data.type === "recovery" ? "/reset-password" : "/");
}
