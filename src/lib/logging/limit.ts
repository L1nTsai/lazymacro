import { NextResponse } from "next/server";
import type { createClient } from "../supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const MESSAGES = {
  parse: "You've reached today's limit of 10 logged meals. Searching foods and entering label values still work. It resets at midnight.",
  transcribe: "You've reached today's limit of 10 voice logs. Searching foods and entering label values still work. It resets at midnight.",
};

/** Takes one use of the daily limit. Returns a response to send if there are none left. */
export async function limitReached(supabase: Client, kind: "parse" | "transcribe"): Promise<NextResponse | null> {
  const { data, error } = await supabase.rpc("use_ai_call", { p_kind: kind });
  if (error) {
    // Spending is only allowed once the limit has been checked.
    console.error("ai_limit_check_failed", { code: error.code });
    return NextResponse.json({ error: "Logging isn't responding right now. Try again.", retryable: true }, { status: 503 });
  }
  if ((data as number) < 0) return NextResponse.json({ error: MESSAGES[kind], retryable: false }, { status: 429 });
  return null;
}
