import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadDay, totals } from "@/lib/day";
import { getUserId } from "@/lib/supabase/server";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(_: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const parsed = date.safeParse((await params).date);
  if (!parsed.success) return NextResponse.json({ error: "Use a date like 2026-11-05." }, { status: 400 });

  try {
    const { goal, meals } = await loadDay(userId, parsed.data);
    const { kcal, protein, carbs, fat } = totals(meals);
    return NextResponse.json({
      targets: goal,
      totals: { kcal, protein, carbs, fat },
      remaining: goal
        ? { kcal: goal.kcal - kcal, protein: Number(goal.protein_g) - protein, carbs: Number(goal.carbs_g) - carbs, fat: Number(goal.fat_g) - fat }
        : null,
      meals,
    });
  } catch (error) {
    console.error("day_load_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "That day didn't load. Try again." }, { status: 500 });
  }
}
