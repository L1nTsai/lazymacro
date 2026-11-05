import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/logging/api";
import { ensureFood } from "@/lib/logging/save";
import { draftFoodSchema } from "@/lib/logging/types";
import { createClient, getUserId } from "@/lib/supabase/server";

const id = z.string().uuid();
const edit = z.object({
  food: draftFoodSchema,
  quantity: z.number().positive().max(100000),
  unit: z.string().min(1).max(40),
  grams: z.number().positive().max(100000),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const entryId = id.safeParse((await params).id);
  const parsed = edit.safeParse(await request.json().catch(() => null));
  if (!entryId.success || !parsed.success) return badRequest("Check the amount and try again.");

  try {
    const supabase = await createClient();
    const foodId = await ensureFood(supabase, parsed.data.food);
    const { error } = await supabase.rpc("update_log_entry", {
      p_id: entryId.data,
      p_food_id: foodId,
      p_quantity: parsed.data.quantity,
      p_unit: parsed.data.unit,
      p_grams: parsed.data.grams,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("entry_update_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Your change wasn't saved. Try again." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const entryId = id.safeParse((await params).id);
  if (!entryId.success) return badRequest("That item wasn't found.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_log_entry", { p_id: entryId.data });
  if (error) {
    console.error("entry_delete_failed", { code: error.code });
    return NextResponse.json({ error: "That item wasn't removed. Try again." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
