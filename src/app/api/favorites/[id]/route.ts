import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/logging/api";
import { relog } from "@/lib/logging/relog";
import { createClient, getUserId } from "@/lib/supabase/server";

const id = z.string().uuid();
const body = z.object({ clientId: z.string().uuid() });
type Context = { params: Promise<{ id: string }> };

/** Logs a favorite in one tap. */
export async function POST(request: NextRequest, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const favoriteId = id.safeParse((await params).id);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!favoriteId.success || !parsed.success) return badRequest("Try that again.");

  try {
    const supabase = await createClient();
    const [{ data: profile, error: profileError }, { data: items, error }] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
      supabase.from("favorite_items").select("food_id, quantity, unit, grams").eq("user_id", userId).eq("favorite_id", favoriteId.data),
    ]);
    if (profileError) throw profileError;
    if (error) throw error;
    if (items.length === 0) return NextResponse.json({ error: "That favorite no longer exists." }, { status: 404 });

    await relog(supabase, { clientId: parsed.data.clientId, timezone: profile.timezone, items });
    return NextResponse.json({ logged: items.length });
  } catch (error) {
    console.error("favorite_log_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "That favorite wasn't logged. Try again." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const favoriteId = id.safeParse((await params).id);
  if (!favoriteId.success) return badRequest("Try that again.");
  const supabase = await createClient();
  const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("id", favoriteId.data);
  if (error) {
    console.error("favorite_delete_failed", { code: error.code });
    return NextResponse.json({ error: "That favorite wasn't removed. Try again." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
