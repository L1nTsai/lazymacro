import { describe, expect, it, vi } from "vitest";
import { AiUnavailableError } from "../ai/claude";
import { geminiMimeType } from "../ai/gemini";
import { aiErrorResponse } from "./api";

describe("aiErrorResponse", () => {
  it("offers search when the AI isn't configured", async () => {
    const response = aiErrorResponse(new AiUnavailableError("x", "not_configured"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatch(/search for foods/);
    expect(body.retryable).toBe(false);
  });
  it("lets people retry an outage", async () => {
    const body = await aiErrorResponse(new AiUnavailableError("x", "service")).json();
    expect(body.retryable).toBe(true);
  });
  it("doesn't offer a pointless retry when the text can't be read", async () => {
    const response = aiErrorResponse(new AiUnavailableError("x", "refused"));
    expect(response.status).toBe(422);
    expect((await response.json()).retryable).toBe(false);
  });
  it("hides internal errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await aiErrorResponse(new Error("connection string secret")).json();
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("geminiMimeType", () => {
  it("relabels iPhone recordings to the name Gemini lists", () => {
    expect(geminiMimeType("audio/mp4")).toBe("audio/m4a");
    expect(geminiMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("audio/m4a");
  });
  it("keeps Chrome and Android recordings", () => {
    expect(geminiMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
  });
  it("rejects anything that isn't audio", () => {
    expect(geminiMimeType("application/pdf")).toBeNull();
  });
});
