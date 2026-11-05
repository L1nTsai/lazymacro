import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/logging/api";
import { createClient, getUserId } from "@/lib/supabase/server";

const phrase = z.string().trim().toLowerCase().min(1).max(200);
const saved = z.object({ phrase, foodId: z.string().uuid(), defaultGrams: z.number().positive().max(100000).nullable() });

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const parsed = saved.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Try that again.");

  const supabase = await createClient();
  const { error } = await supabase.from("user_aliases").upsert({
    user_id: userId,
    phrase: parsed.data.phrase,
    food_id: parsed.data.foodId,
    default_grams: parsed.data.defaultGrams,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("alias_save_failed", { code: error.code });
    return NextResponse.json({ error: "That wasn't saved. Try again." }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const parsed = phrase.safeParse(request.nextUrl.searchParams.get("phrase"));
  if (!parsed.success) return badRequest("Try that again.");

  const supabase = await createClient();
  const { error } = await supabase.from("user_aliases").delete().eq("user_id", userId).eq("phrase", parsed.data);
  if (error) {
    console.error("alias_delete_failed", { code: error.code });
    return NextResponse.json({ error: "That wasn't removed. Try again." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
