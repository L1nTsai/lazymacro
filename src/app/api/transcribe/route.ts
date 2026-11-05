import { NextResponse, type NextRequest } from "next/server";
import { geminiMimeType, transcribeAudio } from "@/lib/ai/gemini";
import { aiErrorResponse, badRequest } from "@/lib/logging/api";
import { limitReached } from "@/lib/logging/limit";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
  } catch {
    return badRequest("Send the recording as form data.");
  }
  if (!(audio instanceof Blob) || audio.size === 0) return badRequest("The recording was empty. Try again.");
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });

  const mimeType = geminiMimeType(audio.type);
  if (!mimeType) return badRequest("This browser's audio format isn't supported. Type your meal instead.");

  const limited = await limitReached(await createClient(), "transcribe");
  if (limited) return limited;

  try {
    return NextResponse.json({ transcript: await transcribeAudio(audio, mimeType) });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
