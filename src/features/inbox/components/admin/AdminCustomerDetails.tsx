import { useEffect, useState } from "react";
import { ArrowSquareOut, EnvelopeSimple, Phone, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api-fetch";

type Customer = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    phone_e164: string | null;
  } | null;
  workspaceCount: number;
  workspaceListComplete: boolean;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string | null;
    status: string;
    membershipRole: string;
    membershipStatus: string;
    instancesTotal: number;
    instancesOpen: number;
  }>;
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Não registrado";

export function AdminCustomerDetails({
  userId,
  dark,
  onClose,
}: {
  userId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const border = dark ? "border-white/10" : "border-black/10";
  const muted = dark ? "text-zinc-400" : "text-neutral-500";

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void apiFetch(
      `/api/admin/users/?userId=${encodeURIComponent(userId)}`,
      {},
      { workspace: false },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          customer?: Customer;
          error?: string;
        };
        if (!response.ok || !payload.customer)
          throw new Error(payload.error || "Não foi possível carregar a ficha do cliente.");
        if (active) setCustomer(payload.customer);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Falha ao carregar cliente.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const fullName = [customer?.profile?.first_name, customer?.profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={`rounded-2xl border ${border} p-4`}
      aria-label="Ficha individual do cliente"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Ficha do cliente</h3>
          <p className={`mt-1 text-xs ${muted}`}>Consulta administrativa somente leitura.</p>
        </div>
        <button className={muted} onClick={onClose} aria-label="Fechar ficha do cliente">
          <X size={16} />
        </button>
      </header>
      {busy && (
        <p className={`mt-4 text-sm ${muted}`} role="status">
          Carregando ficha do cliente.
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      {customer && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`rounded-xl border ${border} p-3`}>
              <p className={`text-xs ${muted}`}>Nome</p>
              <p className="mt-1 text-sm">{fullName || "Não informado"}</p>
            </div>
            <div className={`rounded-xl border ${border} p-3`}>
              <p className={`text-xs ${muted}`}>E-mail</p>
              <p className="mt-1 break-all text-sm">{customer.email || "Não informado"}</p>
            </div>
            <div className={`rounded-xl border ${border} p-3`}>
              <p className={`text-xs ${muted}`}>Cadastro</p>
              <p className="mt-1 text-sm">{formatDate(customer.createdAt)}</p>
            </div>
            <div className={`rounded-xl border ${border} p-3`}>
              <p className={`text-xs ${muted}`}>Último acesso</p>
              <p className="mt-1 text-sm">{formatDate(customer.lastSignInAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {customer.email && (
              <a
                className={`inline-flex min-h-10 items-center gap-1 rounded-xl border ${border} px-3`}
                href={`mailto:${customer.email}`}
              >
                <EnvelopeSimple size={15} /> E-mail <ArrowSquareOut size={12} />
              </a>
            )}
            {customer.profile?.phone_e164 && (
              <a
                className={`inline-flex min-h-10 items-center gap-1 rounded-xl border ${border} px-3`}
                href={`tel:${customer.profile.phone_e164}`}
              >
                <Phone size={15} /> Ligar <ArrowSquareOut size={12} />
              </a>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">Workspaces e instâncias</h4>
              <span className={`text-xs ${muted}`}>{customer.workspaceCount} vínculo(s)</span>
            </div>
            {!customer.workspaceListComplete && (
              <p className="mt-2 text-xs text-amber-500">
                Exibindo os 25 workspaces mais recentes.
              </p>
            )}
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {customer.workspaces.map((workspace) => (
                <article key={workspace.id} className={`rounded-xl border ${border} p-3`}>
                  <p className="text-sm font-semibold">{workspace.name}</p>
                  <p className={`mt-1 text-xs ${muted}`}>
                    {workspace.slug || workspace.id} · {workspace.status}
                  </p>
                  <p className="mt-1 text-xs">
                    Papel: {workspace.membershipRole} · Instâncias: {workspace.instancesTotal} (
                    {workspace.instancesOpen} abertas)
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
