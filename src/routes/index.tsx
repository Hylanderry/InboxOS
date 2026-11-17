import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";
import { isWorkspaceView, type AppView } from "@/features/inbox/navigation";
// Preload InboxShell immediately so it's ready by the time auth resolves
const InboxShell = lazy(() =>
  import("@/features/inbox/components/InboxShell").then((m) => ({ default: m.InboxShell })),
);
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
function Loading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#080809]"
      aria-busy="true"
      aria-label="Carregando workspace"
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#3f3f46",
          animation: "inboxos-ping 1.4s ease-in-out infinite",
        }}
      />
      <p style={{ color: "#52525b", fontSize: 12, margin: 0, fontFamily: "inherit" }}>
        Carregando…
      </p>
      <style>{`@keyframes inboxos-ping{0%,100%{opacity:.4;transform:scale(.8)}50%{opacity:.9;transform:scale(1.15)}}`}</style>
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
