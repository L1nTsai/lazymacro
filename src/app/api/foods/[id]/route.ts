import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadFood } from "@/lib/logging/foods-db";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "That food wasn't found." }, { status: 404 });
  try {
    const food = await loadFood(await createClient(), id.data);
    if (!food) return NextResponse.json({ error: "That food wasn't found." }, { status: 404 });
    return NextResponse.json({ food });
  } catch (error) {
    console.error("food_load_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "That food didn't load. Try again." }, { status: 500 });
  }
}
