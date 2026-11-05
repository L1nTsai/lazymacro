import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseMealText } from "@/lib/ai/claude";
import { localDate } from "@/lib/date";
import { aiErrorResponse, badRequest } from "@/lib/logging/api";
import { hourIn } from "@/lib/logging/clock";
import { limitReached } from "@/lib/logging/limit";
import { parseContext, resolveDeps } from "@/lib/logging/deps";
import { resolveMeals } from "@/lib/logging/resolve";
import { createClient, getUserId } from "@/lib/supabase/server";

const body = z.object({ text: z.string().trim().min(1).max(2000), source: z.enum(["voice", "text"]) });

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const parsedBody = body.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return badRequest("Describe what you ate in up to 2,000 characters.");
  const { text, source } = parsedBody.data;

  try {
    const supabase = await createClient();
    const limited = await limitReached(supabase, "parse");
    if (limited) return limited;

    const { data: profile, error } = await supabase.from("profiles").select("timezone").eq("user_id", userId).single();
    if (error) throw error;

    const now = new Date();
    const context = await parseContext(supabase, userId);
    const parsed = await parseMealText(text, {
      ...context,
      localTime: new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, dateStyle: "full", timeStyle: "short" }).format(now),
    });
    const result = await resolveMeals(
      parsed,
      { today: localDate(profile.timezone, now), hour: hourIn(profile.timezone, now), source, transcript: text },
      resolveDeps(supabase, userId),
    );
    return NextResponse.json(result);
  } catch (error) {
    return aiErrorResponse(error);
  }
}
