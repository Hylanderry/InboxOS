import { useState, useRef, useEffect, useCallback } from "react";

interface AudioRecorderResult {
  blob: Blob;
  durationSec: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  /**
   * P2-05: Encerra todas as faixas do microfone e libera o hardware
   */
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // silencia se já estiver parado
        }
      });
      streamRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Garante limpeza na desmontagem
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setRecorderError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      startTimeRef.current = Date.now();
      setRecordingTimer(0);

      recorder.start(250);
      setIsRecording(true);

      // P2-04: Timer calculado por startedAt para evitar desatualização
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTimer(elapsed);
      }, 500);

      return true;
    } catch (err: unknown) {
      stopTracks();
      setRecorderError(err instanceof Error ? err.message : "Permissão de microfone negada");
      setIsRecording(false);
      return false;
    }
  }, [stopTracks]);

  const stopRecording = useCallback((): Promise<AudioRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      clearTimer();

      if (!recorder || recorder.state === "inactive") {
        stopTracks();
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const durationSec = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });

        stopTracks();
        setIsRecording(false);
        setRecordingTimer(0);
        mediaRecorderRef.current = null;

        resolve({ blob, durationSec });
      };

      try {
        recorder.stop();
      } catch {
        stopTracks();
        setIsRecording(false);
        resolve(null);
      }
    });
  }, [clearTimer, stopTracks]);

  const cancelRecording = useCallback(() => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // silencia
      }
    }
    stopTracks();
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTimer(0);
    mediaRecorderRef.current = null;
  }, [clearTimer, stopTracks]);

  return {
    isRecording,
    recordingTimer,
    recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
    stopTracks,
  };
}
