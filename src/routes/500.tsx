import { createFileRoute, Link } from "@tanstack/react-router";
import { WarningCircle, ArrowClockwise, House } from "@phosphor-icons/react";

export const Route = createFileRoute("/500")({ component: ServerErrorPage });

function ServerErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-zinc-900 px-4 py-8">
      <div className="w-full max-w-md text-center p-8 sm:p-12 rounded-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] bg-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-800">
          <WarningCircle size={32} weight="bold" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Erro 500 / 505
        </span>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
          Instabilidade no Servidor
        </h1>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          Nossos servidores enfrentaram uma oscilação momentânea ao processar sua solicitação. Seus
          dados continuam seguros.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 text-sm font-semibold text-white transition-all hover:bg-black shadow-sm whitespace-nowrap"
          >
            <ArrowClockwise size={16} weight="bold" />
            <span>Recarregar página</span>
          </button>
          <Link
            to="/"
            search={{ view: "dashboard" }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50 whitespace-nowrap"
          >
            <House size={16} weight="bold" />
            <span>Voltar ao início</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
