import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";

interface OAuthResult {
  redirect_url?: string;
  redirect_to?: string;
}

interface AuthorizationDetails extends OAuthResult {
  client?: { name?: string } | null;
}

// A API supabase.auth.oauth ainda é beta: encapsulamos apenas os três métodos usados.
interface OAuthApi {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
}

async function getSupabase() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

async function oauthApi(): Promise<OAuthApi> {
  const supabase = await getSupabase();
  const api = (supabase.auth as unknown as { oauth?: OAuthApi }).oauth;
  if (!api) throw new Error("Servidor de autorização indisponível.");
  return api;
}

export function ConsentView({ authorizationId }: { authorizationId: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      if (!hasSession || !authorizationId) return;
      try {
        const api = await oauthApi();
        const { data: info, error: infoError } = await api.getAuthorizationDetails(authorizationId);
        if (cancelled) return;
        if (infoError) {
          setError(infoError.message);
          return;
        }
        const immediate = info?.redirect_url ?? info?.redirect_to;
        if (immediate && !info?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(info);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = await getSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    window.location.reload();
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const api = await oauthApi();
      const { data, error: decideError } = approve
        ? await api.approveAuthorization(authorizationId)
        : await api.denyAuthorization(authorizationId);
      if (decideError) {
        setBusy(false);
        setError(decideError.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("O servidor de autorização não devolveu um endereço de retorno.");
        return;
      }
      window.location.href = target;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!authorizationId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <p className="text-sm text-muted-foreground">Pedido de autorização inválido.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h1 className="text-lg font-semibold">Conectar assistente ao painel</h1>

        {signedIn === null && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}

        {signedIn === false && (
          <form className="mt-4 space-y-3" onSubmit={signIn}>
            <p className="text-sm text-muted-foreground">Entre na sua conta para continuar.</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <PasswordInput
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        {signedIn === true && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Permitir que {details?.client?.name ?? "o aplicativo"} acesse suas conversas e envie
              mensagens em seu nome?
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => decide(true)}
                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                Permitir
              </button>
              <button
                disabled={busy}
                onClick={() => decide(false)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Recusar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

export default ConsentView;
