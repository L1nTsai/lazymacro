import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { localDate } from "@/lib/date";
import { badRequest } from "@/lib/logging/api";
import { addDays, hourIn, mealFromHour } from "@/lib/logging/clock";
import { relog } from "@/lib/logging/relog";
import { createClient, getUserId } from "@/lib/supabase/server";

const body = z.object({ clientId: z.string().uuid() });

/** Copies yesterday's meal of the same type as the current one. */
export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Try that again.");

  try {
    const supabase = await createClient();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("timezone").eq("user_id", userId).single();
    if (profileError) throw profileError;

    const mealType = mealFromHour(hourIn(profile.timezone));
    const yesterday = addDays(localDate(profile.timezone), -1);
    const { data: meals, error } = await supabase
      .from("meals")
      .select("log_entries(food_id, quantity, unit, grams)")
      .eq("user_id", userId)
      .eq("eaten_on", yesterday)
      .eq("meal_type", mealType);
    if (error) throw error;

    const items = (meals ?? []).flatMap((meal) => meal.log_entries);
    if (items.length === 0) return NextResponse.json({ error: `You didn't log ${mealType} yesterday.` }, { status: 404 });

    await relog(supabase, { clientId: parsed.data.clientId, timezone: profile.timezone, items, mealType });
    return NextResponse.json({ logged: items.length });
  } catch (error) {
    console.error("copy_meal_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "That meal wasn't copied. Try again." }, { status: 500 });
  }
}
