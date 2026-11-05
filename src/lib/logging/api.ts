import { NextResponse } from "next/server";
import { AiUnavailableError } from "../ai/claude";

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Turns an AI failure into a message that says what the person can do next. */
export function aiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AiUnavailableError) {
    if (error.reason === "not_configured") {
      return NextResponse.json({ error: "Voice and text logging aren't set up yet. You can still search for foods.", retryable: false }, { status: 503 });
    }
    if (error.reason === "refused" || error.reason === "invalid") {
      return NextResponse.json({ error: "That couldn't be read as a meal. Try rewording it, or search for the food.", retryable: false }, { status: 422 });
    }
    return NextResponse.json({ error: "Logging isn't responding right now. Try again.", retryable: true }, { status: 503 });
  }
  console.error("logging_request_failed", { message: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ error: "Something went wrong. Try again.", retryable: true }, { status: 500 });
}
