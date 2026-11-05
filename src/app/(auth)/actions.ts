"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; notice?: string };


const email = z.string().trim().toLowerCase().email();
const password = z.string().min(10).max(72);
const credentials = z.object({ email, password });

const TOO_MANY = "Too many attempts. Try again in a few minutes.";
const isRateLimited = (code?: string) => Boolean(code && code.includes("rate_limit"));

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isRateLimited(error.code)) return { error: TOO_MANY };
    if (error.code === "invalid_credentials") return { error: "That email or password is incorrect." };
    console.error("sign_in_failed", { code: error.code, status: error.status });
    return { error: "Sign-in isn't available right now. Try again shortly." };
  }
  redirect("/");
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const onPassword = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return { error: onPassword ? "Use a password of 10 to 72 characters." : "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { data: allowed, error: checkError } = await supabase.rpc("is_allowed_signup_email", {
    address: parsed.data.email,
  });
  if (checkError) {
    console.error("signup_domain_check_failed", { code: checkError.code });
    return { error: "Sign-up isn't available right now. Try again shortly." };
  }
  if (!allowed) return { error: "Use a Gmail address to sign up." };

  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    if (isRateLimited(error.code)) return { error: "Too many sign-ups right now. Try again in a few minutes." };
    if (error.code === "email_address_invalid") return { error: "Enter a valid email address." };
    if (error.code === "weak_password") return { error: "Choose a less common password." };
    console.error("sign_up_failed", { code: error.code, status: error.status });
    return { error: "Sign-up isn't available right now. Try again shortly." };
  }
  redirect("/waiting");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
