import { Trash, PaperPlaneRight } from "@phosphor-icons/react";

interface AudioRecorderBarProps {
  recordingTimer: number;
  onCancel: () => void;
  onSend: () => void;
  isDarkMode?: boolean;
}

export function AudioRecorderBar({
  recordingTimer,
  onCancel,
  onSend,
  isDarkMode = true,
}: AudioRecorderBarProps) {
  const mins = Math.floor(recordingTimer / 60);
  const secs = recordingTimer % 60;
  const formatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  return (
    <div
      className={`flex-1 flex items-center justify-between px-4 py-2 rounded-xl border transition-all animate-smooth-in ${
        isDarkMode
          ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
          : "bg-rose-50 border-rose-200 text-rose-600"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
        <span className="text-xs font-semibold">Gravando áudio... {formatted}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
            isDarkMode
              ? "text-neutral-400 hover:text-white hover:bg-neutral-800"
              : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200"
          }`}
          title="Descartar gravação"
        >
          <Trash size={16} />
        </button>

        <button
          type="button"
          onClick={onSend}
          className={`p-1.5 rounded-lg transition-colors active:scale-[0.98] ${isDarkMode ? "bg-white text-black hover:bg-zinc-200" : "bg-neutral-950 text-white hover:bg-neutral-800"}`}
          title="Enviar áudio"
        >
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>
    </div>
  );
}
