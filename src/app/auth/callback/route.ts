import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_NEXT = new Set(["/", "/reset-password"]);

/**
 * Where Supabase's default email links land. The email is already confirmed by
 * this point. Finishing sign-in needs the browser that started it, so opening
 * the link elsewhere (say, Mail on a phone) ends at sign-in rather than an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next = ALLOWED_NEXT.has(requestedNext) ? requestedNext : "/";
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return url;
  };

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo(next));
    if (next === "/") {
      const signIn = redirectTo("/sign-in");
      signIn.searchParams.set("notice", "confirmed");
      return NextResponse.redirect(signIn);
    }
  }

  const signIn = redirectTo("/sign-in");
  signIn.searchParams.set("notice", "link-expired");
  return NextResponse.redirect(signIn);
}
