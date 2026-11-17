import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Microphone, WarningCircle } from "@phosphor-icons/react";
import { formatAudioDuration } from "@/features/inbox/mappers/messageMapper";

interface AudioPlayerProps {
  audioUrl?: string | null | undefined;
  duration?: number | null | undefined;
  isMe?: boolean | undefined;
  isDarkMode?: boolean | undefined;
}

const WAVE_BARS = [
  35, 60, 25, 80, 45, 95, 30, 70, 50, 85, 30, 65, 90, 40, 75, 45, 60, 85, 40, 70, 30, 55,
];

export function AudioPlayer({
  audioUrl,
  duration,
  isMe = false,
  isDarkMode = true,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTimeSec(Math.floor(audio.currentTime));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTimeSec(0);
    };

    const handleError = () => {
      setIsPlaying(false);
      setHasError(true);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  // A realtime message may initially expose the private storage path and
  // then be reconciled to a signed URL. Reset the player state so a previous
  // load error never blocks playback after that URL changes.
  useEffect(() => {
    setHasError(false);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTimeSec(0);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.load();
    }
  }, [audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      setHasError(true);
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setHasError(false);
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // P2-03: Não simula progresso falso; registra erro real
        setIsPlaying(false);
        setHasError(true);
      }
    }
  };

  const handleSpeedToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] ?? 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = clickPos * audio.duration;
  };

  const formattedDuration = formatAudioDuration(duration);
  const formattedCurrent = formatAudioDuration(currentTimeSec);

  return (
    <div className="flex items-center gap-2.5 py-0.5 min-w-[210px] max-w-[260px]">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Botão Play / Pause / Erro */}
      <button
        type="button"
        onClick={togglePlay}
        className={`min-h-11 min-w-11 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-xs ${
          hasError
            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
            : isMe
              ? "bg-white text-black hover:bg-neutral-200"
              : isDarkMode
                ? "bg-[#27272e] text-white hover:bg-[#34343d] border border-[#3e3e48]"
                : "bg-neutral-900 text-white hover:bg-neutral-800"
        }`}
        title={hasError ? "Áudio indisponível" : isPlaying ? "Pausar" : "Reproduzir áudio"}
      >
        {hasError ? (
          <WarningCircle size={15} weight="bold" />
        ) : isPlaying ? (
          <Pause size={14} weight="fill" />
        ) : (
          <Play size={14} weight="fill" className="ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Waveform Interativa */}
        <div
          onClick={handleSeek}
          className="flex items-center gap-[2px] h-4 cursor-pointer"
          title="Clique para avançar/retroceder"
        >
          {WAVE_BARS.map((h, i) => {
            const barProgress = (i / WAVE_BARS.length) * 100;
            const isPlayed = progress >= barProgress;
            return (
              <span
                key={i}
                style={{ height: `${Math.max(20, h * 0.75)}%` }}
                className={`w-[2px] rounded-full transition-colors duration-100 ${
                  hasError
                    ? "bg-rose-500/30"
                    : isPlayed
                      ? isMe
                        ? "bg-white"
                        : isDarkMode
                          ? "bg-[#00a884]"
                          : "bg-neutral-900"
                      : isMe
                        ? "bg-white/30"
                        : isDarkMode
                          ? "bg-[#33333d]"
                          : "bg-neutral-300"
                }`}
              />
            );
          })}
        </div>

        {/* Rodapé: Tempo e Controle de Velocidade */}
        <div
          className={`flex justify-between items-center text-[10px] mt-1 font-medium ${
            isMe ? "text-white/75" : isDarkMode ? "text-[#8e8e93]" : "text-neutral-500"
          }`}
        >
          <div className="flex items-center gap-1">
            <Microphone size={10} weight="fill" />
            <span>{isPlaying ? formattedCurrent : formattedDuration}</span>
          </div>

          <button
            type="button"
            onClick={handleSpeedToggle}
            className={`px-1 rounded text-[9px] font-bold transition-colors ${
              isMe
                ? "bg-white/20 text-white hover:bg-white/30"
                : isDarkMode
                  ? "bg-[#222226] text-[#a1a1aa] hover:text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>
    </div>
  );
}
