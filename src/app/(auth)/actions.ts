"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; notice?: string };

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(10).max(72);
const credentials = z.object({ email, password });

const TOO_MANY = "Too many attempts. Try again in a few minutes.";
const isRateLimited = (code?: string) => Boolean(code && code.includes("rate_limit"));

async function appUrl(path: string) {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) throw new Error("Request has no origin header.");
  return `${origin}${path}`;
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirm your email first, using the link we sent you." };
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
  if (!allowed) return { error: "Use your company email address to sign up." };

  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: await appUrl("/auth/callback") },
  });
  if (error) {
    if (isRateLimited(error.code)) return { error: "Too many sign-ups right now. Try again in a few minutes." };
    if (error.code === "email_address_invalid") return { error: "Enter a valid email address." };
    if (error.code === "weak_password") return { error: "Choose a less common password." };
    console.error("sign_up_failed", { code: error.code, status: error.status });
    return { error: "We couldn't send your confirmation email. Try again shortly." };
  }
  redirect("/check-email");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: await appUrl("/auth/callback?next=/reset-password"),
  });
  if (isRateLimited(error?.code)) return { error: TOO_MANY };
  if (error) console.error("password_reset_failed", { code: error.code, status: error.status });
  // The same message either way, so this form can't reveal who has an account.
  return { notice: "If that address has an account, a reset link is on its way." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = password.safeParse(form.get("password"));
  if (!parsed.success) return { error: "Use a password of 10 to 72 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password you haven't used here." };
    console.error("password_update_failed", { code: error.code, status: error.status });
    return { error: "Your reset link may have expired. Request a new one." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
