"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_MS = 1500;
const SILENCE_LEVEL = 0.02;
const SPEECH_LEVEL = 0.04;
const MAX_MS = 60_000;
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export type RecorderError = "unsupported" | "denied" | "failed";

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type LiveRecognizer = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

/**
 * iOS gives the microphone to one consumer at a time, so a live preview there
 * could end the recording. The server transcript is what counts anyway.
 */
function createLivePreview(onText: (text: string) => void): LiveRecognizer | null {
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
  const Recognition = (window as unknown as { SpeechRecognition?: new () => LiveRecognizer; webkitSpeechRecognition?: new () => LiveRecognizer });
  const Constructor = Recognition.SpeechRecognition ?? Recognition.webkitSpeechRecognition;
  if (isIos || !Constructor) return null;
  try {
    const recognizer = new Constructor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      onText(Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript).join(" "));
    };
    recognizer.onerror = () => {};
    recognizer.start();
    return recognizer;
  } catch {
    return null;
  }
}

export function useRecorder(onFinished: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<RecorderError | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => () => stopRef.current(), []);

  const start = useCallback(async () => {
    setError(null);
    setLiveText("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      setError((cause as Error).name === "NotAllowedError" ? "denied" : "failed");
      return;
    }

    const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const context = new AudioContext();
    void context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const preview = createLivePreview(setLiveText);
    let frame = 0;
    let stopped = false;
    let heardSpeech = false;
    let quietSince = performance.now();
    const startedAt = performance.now();

    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      preview?.stop();
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      setRecording(false);
      setLevel(0);
    };
    stopRef.current = stop;

    recorder.onstop = () => {
      if (chunks.length) finishedRef.current(new Blob(chunks, { type: recorder.mimeType }));
    };

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
      setLevel(Math.min(1, rms * 6));
      const now = performance.now();
      if (rms > SPEECH_LEVEL) heardSpeech = true;
      if (rms > SILENCE_LEVEL) quietSince = now;
      // Only a pause after speaking ends it, so thinking before talking is fine.
      if ((heardSpeech && now - quietSince > SILENCE_MS) || now - startedAt > MAX_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    recorder.start();
    setRecording(true);
    frame = requestAnimationFrame(tick);
  }, []);

  return { recording, level, liveText, error, start, stop: () => stopRef.current() };
}
