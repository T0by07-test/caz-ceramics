import { useState, useRef, useCallback } from "react";

export type SpeechState = "idle" | "listening" | "processing";

export interface UseSpeechRecognition {
  state: SpeechState;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

// SpeechRecognition is not in all TypeScript DOM lib versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function getSpeechRecognitionConstructor(): (new () => AnySpeechRecognition) | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(
  onResult: (transcript: string) => void,
): UseSpeechRecognition {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<AnySpeechRecognition | null>(null);
  const transcriptRef = useRef("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const start = useCallback(() => {
    const SR = getSpeechRecognitionConstructor();
    if (!SR) {
      setError("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari.");
      return;
    }
    setError(null);
    transcriptRef.current = "";

    const recognition = new SR();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (e: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        parts.push(e.results[i][0].transcript);
      }
      transcriptRef.current = parts.join(" ").trim();
    };

    recognition.onerror = (e: { error: string }) => {
      setError(
        e.error === "not-allowed"
          ? "Permiso de micrófono denegado"
          : `Error de reconocimiento: ${e.error}`,
      );
      setState("idle");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setState("processing");
      onResultRef.current(transcriptRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setState("listening");
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    transcriptRef.current = "";
    setState("idle");
    setError(null);
  }, []);

  return { state, start, stop, reset, error };
}
