import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";
import { isWorkspaceView, type AppView } from "@/features/inbox/navigation";
const loadInboxShell = () => import("@/features/inbox/components/InboxShell");
// Baixa o app em paralelo com a checagem de sessão, para não esperar um depois do outro.
if (typeof window !== "undefined") void loadInboxShell().catch(() => {});
const InboxShell = lazy(() => loadInboxShell().then((m) => ({ default: m.InboxShell })));
export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search): { view: Exclude<AppView, "admin"> } => ({
    view: isWorkspaceView(search["view"]) ? search["view"] : "dashboard",
  }),
  head: () => ({
    meta: [{ title: `${PLATFORM_BRAND_NAME} — Operações de Atendimento` }],
  }),
  component: Index,
});
/**
 * Abertura do app sem "tela de carregamento": só o fundo do tema. Se a sessão
 * demorar, uma linha discreta aparece com fade depois de ~0,9s.
 */
function Loading() {
  return (
    <div className="ux-boot" aria-busy="true" aria-label="Carregando workspace">
      <span className="ux-loading-bar ux-boot-bar" aria-hidden="true" />
    </div>
  );
}
function Disconnected() {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/75 p-6 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111113] p-6 text-white">
        <h2 className="text-lg font-semibold">Este dispositivo foi desconectado</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Sua sessão foi encerrada. Entre novamente para continuar.
        </p>
        <button
          className="auth-primary mt-5 w-full"
          onClick={() => {
            void supabase.auth.signOut().finally(() => window.location.replace("/auth/login"));
          }}
        >
          Ir para o login
        </button>
      </div>
    </div>
  );
}
function ProtectedInbox() {
  const [ready, setReady] = useState(false),
    [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        window.location.replace("/auth/login");
        return;
      }
      setReady(true);
    });
    const onRevoked = () => setDisconnected(true);
    window.addEventListener("inboxos:session-revoked", onRevoked);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !disconnected) window.location.replace("/auth/login");
    });
    return () => {
      active = false;
      window.removeEventListener("inboxos:session-revoked", onRevoked);
      listener.subscription.unsubscribe();
    };
  }, [disconnected]);
  return (
    <>
      {ready ? (
        <Suspense fallback={<Loading />}>
          <InboxShell />
        </Suspense>
      ) : (
        <Loading />
      )}
      {disconnected && <Disconnected />}
    </>
  );
}
function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <ProtectedInbox />
    </ClientOnly>
  );
}
