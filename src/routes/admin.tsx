import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ShieldCheck, ArrowLeft, Moon, Sun, SignOut } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api-fetch";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-context";

const SystemAdminView = lazy(() =>
  import("@/features/inbox/components/SystemAdminView").then((module) => ({
    default: module.SystemAdminView,
  })),
);

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Administração global · Inbox OS" }],
  }),
  component: AdminRoute,
});

function AdminLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f7f6] text-sm text-neutral-500 dark:bg-[#080809] dark:text-zinc-400">
      Validando acesso administrativo…
    </div>
  );
}

function AdminRoute() {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");
  const [role, setRole] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await supabase.auth.getSession();
      if (!active) return;
      if (!session.data.session) {
        window.location.replace("/auth/login?next=/admin");
        return;
      }
      const response = await apiFetch("/api/admin/me/", {}, { workspace: false });
      if (!active) return;
      if (!response.ok) {
        setStatus("denied");
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { role?: string };
      setRole(payload.role ?? "");
      setStatus("allowed");
    })().catch(() => {
      if (active) setStatus("denied");
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") return <AdminLoading />;
  if (status === "denied") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f7f6] px-5 text-neutral-900 dark:bg-[#080809] dark:text-white">
        <section className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#111113]">
          <ShieldCheck size={30} className="mx-auto mb-4 text-neutral-500 dark:text-zinc-400" />
          <h1 className="text-xl font-semibold">Acesso administrativo restrito</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-zinc-400">
            Esta área exige uma conta System Admin ativa. Nenhum dado administrativo foi carregado.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-neutral-900 dark:hover:bg-zinc-200"
          >
            <ArrowLeft size={16} /> Voltar ao sistema
          </a>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`admin-control-plane-shell ${
        isDarkMode
          ? "min-h-screen bg-[#080809] text-white"
          : "min-h-screen bg-[#f7f7f6] text-neutral-900"
      }`}
    >
      <header
        className={
          isDarkMode
            ? "flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#0a0a0b] px-5 sm:px-8"
            : "flex h-16 items-center justify-between border-b border-black/[0.08] bg-white px-5 sm:px-8"
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate({ to: "/", search: { view: "dashboard" } })}
            aria-label="Voltar ao sistema"
            className={
              isDarkMode
                ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-300 transition hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                : "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-black/10 text-neutral-600 transition hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            }
          >
            <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <div
            className={
              isDarkMode
                ? "grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06]"
                : "grid h-9 w-9 place-items-center rounded-xl border border-black/10 bg-black/[0.03]"
            }
          >
            <ShieldCheck size={19} weight="duotone" />
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold">Inbox OS · Administração</p>
            <p
              className={isDarkMode ? "text-[11px] text-zinc-500" : "text-[11px] text-neutral-500"}
            >
              Control plane · {role || "validando"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Alternar tema"
            onClick={toggleTheme}
            className={
              isDarkMode
                ? "grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-300 transition hover:bg-white/[0.07]"
                : "grid h-10 w-10 place-items-center rounded-xl border border-black/10 text-neutral-600 transition hover:bg-black/[0.04]"
            }
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            onClick={() =>
              void supabase.auth.signOut().finally(() => window.location.assign("/auth/login"))
            }
            className={
              isDarkMode
                ? "inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.07]"
                : "inline-flex h-10 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold text-neutral-700 transition hover:bg-black/[0.04]"
            }
          >
            <SignOut size={16} /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px]">
        <Suspense fallback={<AdminLoading />}>
          <SystemAdminView isDarkMode={isDarkMode} />
        </Suspense>
      </main>
    </div>
  );
}
