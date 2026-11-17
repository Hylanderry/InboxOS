import { ArrowUpRight, Sparkle } from "@phosphor-icons/react";
import type { AppViewMeta } from "../navigation";

interface FeaturePlaceholderProps {
  meta: AppViewMeta;
  isDarkMode: boolean;
}

export function FeaturePlaceholder({ meta, isDarkMode }: FeaturePlaceholderProps) {
  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <div className="max-w-2xl">
          <p
            className={`text-[10px] font-semibold tracking-[0.18em] ${isDarkMode ? "text-zinc-600" : "text-neutral-400"}`}
          >
            {meta.eyebrow}
          </p>
          <h1
            className={`mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-[28px] ${isDarkMode ? "text-zinc-50" : "text-neutral-950"}`}
          >
            {meta.title}
          </h1>
          <p
            className={`mt-2 max-w-xl text-sm leading-6 ${isDarkMode ? "text-zinc-500" : "text-neutral-500"}`}
          >
            {meta.description}
          </p>
        </div>

        <div
          className={`mt-10 overflow-hidden rounded-2xl border ${
            isDarkMode ? "border-white/[0.065] bg-white/[0.018]" : "border-black/[0.07] bg-white/65"
          }`}
        >
          <div className="relative flex min-h-[310px] items-center justify-center px-6 py-14 text-center">
            <div
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-px ${isDarkMode ? "bg-gradient-to-r from-transparent via-white/10 to-transparent" : "bg-gradient-to-r from-transparent via-black/10 to-transparent"}`}
            />
            <div className="max-w-sm">
              <div
                className={`mx-auto grid h-10 w-10 place-items-center rounded-xl border ${
                  isDarkMode
                    ? "border-white/[0.075] bg-white/[0.035] text-zinc-400"
                    : "border-black/[0.08] bg-black/[0.025] text-neutral-500"
                }`}
              >
                <Sparkle size={18} />
              </div>
              <p
                className={`mt-5 text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-neutral-700"}`}
              >
                Área preparada para a próxima etapa
              </p>
              <p
                className={`mt-2 text-xs leading-5 ${isDarkMode ? "text-zinc-600" : "text-neutral-400"}`}
              >
                Sem dados fictícios, automações falsas ou chamadas externas enquanto o módulo não
                estiver pronto.
              </p>
              <div
                className={`mx-auto mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium ${isDarkMode ? "text-zinc-500" : "text-neutral-500"}`}
              >
                Estrutura reservada
                <ArrowUpRight size={12} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
