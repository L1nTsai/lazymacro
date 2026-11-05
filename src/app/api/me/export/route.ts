import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";

const PERSONAL_TABLES = [
  "profiles",
  "targets",
  "user_exclusions",
  "user_staples",
  "user_aliases",
  "user_corrections",
  "meals",
  "log_entries",
  "favorites",
  "favorite_items",
  "inventory_items",
  "inventory_events",
  "suggestions",
] as const;

const PAGE_SIZE = 1000;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const supabase = await createClient();
  const data: Record<string, unknown[]> = {};

  for (const table of PERSONAL_TABLES) {
    const rows: unknown[] = [];
    // The API caps each response, so long histories need paging.
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order("user_id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error("export_failed", { table, code: error.code });
        return NextResponse.json({ error: "Your export didn't finish. Try again." }, { status: 500 });
      }
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    data[table] = rows;
  }

  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="lazymacro-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
