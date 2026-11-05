"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_MS = 1500;
const NO_SPEECH_MS = 8000;
const MAX_MS = 60_000;

export type SpeechError = "unsupported" | "denied" | "siri" | "no-speech" | "network" | "failed";

type RecognitionResults = ArrayLike<ArrayLike<{ transcript: string }>>;
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: RecognitionResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const ERRORS: Record<string, SpeechError> = {
  "not-allowed": "denied",
  "service-not-allowed": "siri",
  "no-speech": "no-speech",
  "audio-capture": "denied",
  network: "network",
};

/**
 * Speech to text using what's built into the browser, which needs no key. The
 * browser sends the audio to Apple or Google, depending on the device.
 */
export function useBrowserSpeech(onFinished: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => () => stopRef.current(), []);

  const start = useCallback(() => {
    setError(null);
    setLiveText("");
    const speech = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) {
      setError("unsupported");
      return;
    }

    let recognizer: Recognition;
    try {
      recognizer = new Constructor();
    } catch {
      setError("unsupported");
      return;
    }
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = navigator.language || "en-US";

    let text = "";
    let failure: SpeechError | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const stopAfter = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => recognizer.stop(), ms);
    };
    const hardStop = setTimeout(() => recognizer.stop(), MAX_MS);

    recognizer.onresult = (event) => {
      text = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript).join(" ").replace(/\s+/g, " ").trim();
      setLiveText(text);
      // Only a pause after speaking ends it.
      stopAfter(SILENCE_MS);
    };
    recognizer.onerror = (event) => {
      // Stopping on purpose reports "aborted", which isn't a problem.
      if (event.error !== "aborted") failure = ERRORS[event.error] ?? "failed";
    };
    recognizer.onend = () => {
      clearTimeout(timer);
      clearTimeout(hardStop);
      setRecording(false);
      if (text) finishedRef.current(text);
      else setError(failure ?? "no-speech");
    };

    stopRef.current = () => {
      clearTimeout(timer);
      recognizer.stop();
    };

    try {
      recognizer.start();
      setRecording(true);
      stopAfter(NO_SPEECH_MS);
    } catch {
      clearTimeout(hardStop);
      setError("failed");
    }
  }, []);

  return { recording, liveText, error, start, stop: () => stopRef.current() };
}
