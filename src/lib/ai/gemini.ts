import { GoogleGenAI } from "@google/genai";
import { AiUnavailableError } from "./claude";

const MODEL = "gemini-3.5-transcribe";

/** Words people say in this app that general speech models often mishear. */
const FOOD_VOCABULARY = [
  "whey", "casein", "quinoa", "kefir", "skyr", "edamame", "tzatziki", "gnocchi", "tahini", "hummus",
  "acai", "chia", "farro", "bulgur", "couscous", "tempeh", "seitan", "kimchi", "miso", "macros",
  "grams", "ounces", "tablespoon", "teaspoon", "scoop", "Chick-fil-A", "Chipotle", "Sweetgreen", "Cava",
];

/** iPhones record MP4 audio, which Gemini lists only under its M4A name. */
export function geminiMimeType(browserType: string): string | null {
  const base = browserType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/mp4": "audio/m4a",
    "audio/x-m4a": "audio/m4a",
    "audio/m4a": "audio/m4a",
    "audio/aac": "audio/aac",
    "audio/webm": "audio/webm",
    "video/webm": "audio/webm",
    "audio/ogg": "audio/ogg",
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mp3",
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
  };
  return map[base] ?? null;
}

/**
 * Transcribes speech. The audio is uploaded because that's the documented route,
 * then deleted straight away, since the app promises not to keep recordings.
 */
export async function transcribeAudio(audio: Blob, mimeType: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set.", "not_configured");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let uploadedName: string | undefined;
  try {
    const uploaded = await ai.files.upload({ file: audio, config: { mimeType } });
    uploadedName = uploaded.name;
    const response = await ai.interactions.create({
      model: MODEL,
      input: [{ type: "audio", uri: uploaded.uri, mime_type: uploaded.mimeType as "audio/mp3" }],
      generation_config: { transcription_config: { custom_vocabulary: FOOD_VOCABULARY } },
    });
    return (response.output_text ?? "").trim();
  } catch (error) {
    console.error("transcription_failed", { message: error instanceof Error ? error.message : "unknown" });
    throw new AiUnavailableError("Transcription didn't finish.", "service");
  } finally {
    if (uploadedName) {
      await ai.files.delete({ name: uploadedName }).catch((error: unknown) => {
        console.error("transcription_cleanup_failed", { message: error instanceof Error ? error.message : "unknown" });
      });
    }
  }
}
