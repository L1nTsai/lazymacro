import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const query = z.string().trim().min(1).max(100);

export async function GET(request: NextRequest) {
  const parsed = query.safeParse(request.nextUrl.searchParams.get("q"));
  if (!parsed.success) return NextResponse.json({ error: "Enter a food name of up to 100 characters." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_foods", { q: parsed.data, max_results: 20 });
  if (error) {
    // Signed-out callers are stopped by the proxy; this is a real failure.
    console.error("food_search_failed", { code: error.code });
    return NextResponse.json({ error: "Search isn't available right now." }, { status: 500 });
  }
  return NextResponse.json({ foods: data });
}
