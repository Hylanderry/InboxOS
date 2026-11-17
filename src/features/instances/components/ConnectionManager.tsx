import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  QrCode,
  Trash,
  ChatCircleText,
  WhatsappLogo,
  PencilSimple,
  ArrowsClockwise,
  Check,
  X,
} from "@phosphor-icons/react";
import type { WhatsAppInstance } from "@/features/inbox/types";
import { QrCodeDialog } from "./QrCodeDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { apiFetch } from "@/lib/api-fetch";

interface ConnectionManagerProps {
  instances: WhatsAppInstance[];
  onSelectInstance: (instanceId: string) => void;
  onDeleteInstance: (instanceName: string) => Promise<boolean>;
  onRefresh: () => void;
  isDarkMode?: boolean;
}

export function ConnectionManager({
  instances,
  onSelectInstance,
  onDeleteInstance,
  onRefresh,
  isDarkMode = true,
}: ConnectionManagerProps) {
  const [selectedForQr, setSelectedForQr] = useState<string | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isNewConnectionOpen, setIsNewConnectionOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [editedAlias, setEditedAlias] = useState("");
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [instancePendingDeletion, setInstancePendingDeletion] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const newConnectionTriggerRef = useRef<HTMLButtonElement>(null);
  const newConnectionDialogRef = useRef<HTMLFormElement>(null);

  const closeNewConnection = useCallback(() => {
    if (isCreating) return;
    setIsNewConnectionOpen(false);
    requestAnimationFrame(() => newConnectionTriggerRef.current?.focus());
  }, [isCreating]);

  useEffect(() => {
    if (!isNewConnectionOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = newConnectionDialogRef.current;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
    requestAnimationFrame(() => focusables()[0]?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNewConnection();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeNewConnection, isNewConnectionOpen]);

  const handleOpenQr = (instanceName: string) => {
    setSelectedForQr(instanceName);
    setIsQrOpen(true);
  };

  const handleCreateConnection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instanceName = newInstanceName.trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/.test(instanceName)) {
      WhatsAppToast.networkError(
        "Use 2–80 caracteres: letras, números, ponto, hífen ou sublinhado.",
      );
      return;
    }

    setIsCreating(true);
    try {
      const res = await apiFetch("/api/instances/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName,
          displayName: newDisplayName.trim() || instanceName,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        warning?: string;
        webhookConfigured?: boolean;
      } | null;
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setIsNewConnectionOpen(false);
      setNewInstanceName("");
      setNewDisplayName("");
      handleOpenQr(instanceName);
      await onRefresh();
      if (data?.webhookConfigured === false) {
        WhatsAppToast.warning("Conexão criada", data.warning);
      }
    } catch (error: unknown) {
      WhatsAppToast.networkError(
        error instanceof Error ? error.message : "Não foi possível criar a conexão.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const beginAliasEdit = (instance: WhatsAppInstance) => {
    setEditingInstance(instance.instanceName);
    setEditedAlias(instance.alias || instance.instanceName);
  };

  const saveAlias = async (instanceName: string) => {
    setIsSavingAlias(true);
    try {
      const res = await apiFetch(`/api/instances/${encodeURIComponent(instanceName)}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editedAlias }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditingInstance(null);
      await onRefresh();
      WhatsAppToast.success("Nome atualizado", "O identificador técnico foi preservado.");
    } catch (error: unknown) {
      WhatsAppToast.networkError(
        error instanceof Error ? error.message : "Não foi possível atualizar o nome.",
      );
    } finally {
      setIsSavingAlias(false);
    }
  };

  const handleDelete = async () => {
    if (!instancePendingDeletion) return;
    setIsDeleting(true);
    try {
      const deleted = await onDeleteInstance(instancePendingDeletion);
      if (deleted) {
        WhatsAppToast.success(
          "Conta removida",
          `${instancePendingDeletion} foi removida do painel.`,
        );
        setInstancePendingDeletion(null);
      } else {
        WhatsAppToast.networkError("Não foi possível remover a conta.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Sessões encerradas são removidas pelo servidor assim que a Evolution
  // confirma a desconexão. O filtro também evita exibir um estado obsoleto
  // enquanto a reconciliação do webhook ainda está chegando ao navegador.
  const visibleInstances = instances.filter((instance) => instance.state !== "disconnected");

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6 animate-smooth-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h2
            className={`text-lg font-bold tracking-tight ${isDarkMode ? "text-white" : "text-neutral-950"}`}
          >
            Conexões
          </h2>
          <p className={`text-xs mt-0.5 ${isDarkMode ? "text-neutral-400" : "text-neutral-600"}`}>
            Gerencie sessões, pareamento e disponibilidade dos canais conectados.
          </p>
        </div>

        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onRefresh}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${isDarkMode ? "border-white/[0.09] text-neutral-300 hover:bg-white/[0.06]" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
            aria-label="Atualizar status das conexões"
            title="Atualizar status das conexões"
          >
            <ArrowsClockwise size={16} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            type="button"
            ref={newConnectionTriggerRef}
            onClick={() => setIsNewConnectionOpen(true)}
            className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2.5 text-xs font-semibold transition-colors active:scale-[0.99] sm:flex-none ${isDarkMode ? "border-white/[0.09] bg-white text-black hover:bg-zinc-200" : "border-black bg-neutral-950 text-white hover:bg-neutral-800"}`}
          >
            <Plus size={16} weight="bold" />
            <span>Nova Conexão</span>
          </button>
        </div>
      </div>

      {/* Grid de Instâncias */}
      {visibleInstances.length === 0 ? (
        <div
          className={`p-12 rounded-2xl border flex flex-col items-center justify-center text-center ${
            isDarkMode ? "bg-[#121215]/60 border-[#222226]" : "bg-white border-[#e2e4e9] shadow-sm"
          }`}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/25">
            <QrCode size={32} weight="bold" />
          </div>
          <h3 className="text-base font-bold">Nenhuma conta conectada</h3>
          <p className="text-xs text-neutral-400 mt-1 max-w-md">
            Conecte o seu número para sincronizar conversas e receber mensagens em tempo real.
          </p>
          <button
            type="button"
            onClick={() => setIsNewConnectionOpen(true)}
            className="mt-6 flex items-center gap-2 rounded-lg border border-transparent bg-neutral-950 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Plus size={16} weight="bold" />
            <span>Conectar WhatsApp Agora</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleInstances.map((acc) => {
            const isConnected = acc.state === "open";
            return (
              <div
                key={acc.id}
                className={`p-5 rounded-xl border transition-colors flex flex-col justify-between ${
                  isDarkMode
                    ? "bg-[#121215] border-[#222226] hover:border-[#333338]"
                    : "bg-white border-[#e2e4e9] shadow-xs"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-neutral-700/30 shrink-0">
                        {acc.profilePicUrl ? (
                          <img
                            src={acc.profilePicUrl}
                            alt={acc.instanceName}
                            className={`w-full h-full object-cover ${!isConnected ? "grayscale opacity-50" : ""}`}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#00a884]/15 text-[#00a884] font-bold text-sm">
                            <WhatsappLogo size={24} weight="fill" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        {editingInstance === acc.instanceName ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={editedAlias}
                              onChange={(event) => setEditedAlias(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveAlias(acc.instanceName);
                                if (event.key === "Escape") setEditingInstance(null);
                              }}
                              maxLength={80}
                              autoFocus
                              aria-label={`Nome exibido de ${acc.instanceName}`}
                              className={`w-36 rounded-md border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#00a884]/40 ${isDarkMode ? "border-white/15 bg-white/5 text-white" : "border-neutral-300 bg-white text-neutral-900"}`}
                            />
                            <button
                              type="button"
                              onClick={() => void saveAlias(acc.instanceName)}
                              disabled={isSavingAlias}
                              className="rounded-md p-1 text-[#00a884] hover:bg-[#00a884]/10 disabled:opacity-50"
                              aria-label="Salvar nome exibido"
                            >
                              <Check size={14} weight="bold" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingInstance(null)}
                              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-500/10"
                              aria-label="Cancelar edição do nome"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h4 className="text-sm font-bold tracking-tight truncate">
                              {acc.alias || acc.instanceName}
                            </h4>
                            <button
                              type="button"
                              onClick={() => beginAliasEdit(acc)}
                              className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-500/10 hover:text-current"
                              aria-label={`Editar nome de ${acc.alias || acc.instanceName}`}
                              title="Editar nome exibido"
                            >
                              <PencilSimple size={13} />
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                          ID: {acc.instanceName}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {acc.phone || "Sem número"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInstancePendingDeletion(acc.instanceName)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Excluir instância"
                      aria-label={`Excluir conexão ${acc.alias || acc.instanceName}`}
                    >
                      <Trash size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`w-2 h-2 rounded-full ${isConnected ? "bg-[#00a884]" : "bg-rose-500"}`}
                    />
                    <span className="text-[11px] text-neutral-400">
                      Status:{" "}
                      <strong className={isConnected ? "text-[#00a884]" : "text-rose-400"}>
                        {isConnected ? "Conectado" : "Desconectado"}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800/40">
                  {!isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleOpenQr(acc.instanceName)}
                      className="w-full py-2.5 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 bg-neutral-950 hover:bg-neutral-800 text-white transition-colors dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      <QrCode size={16} weight="bold" />
                      <span>Conectar WhatsApp</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectInstance(acc.instanceName)}
                      className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        isDarkMode
                          ? "bg-[#1e1e22] text-white hover:bg-[#27272c] border border-[#2e2e34]"
                          : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 border border-neutral-200"
                      }`}
                    >
                      <ChatCircleText size={16} />
                      <span>Ver Conversas</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isNewConnectionOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="inboxos-connection-modal-backdrop fixed inset-0 z-[120] grid min-h-[100dvh] place-items-center overflow-y-auto bg-black/55 p-3 backdrop-blur-md sm:p-6"
            style={{
              position: "fixed",
              inset: 0,
              width: "100vw",
              minHeight: "100dvh",
              zIndex: 120,
            }}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeNewConnection();
            }}
          >
            <form
              ref={newConnectionDialogRef}
              onSubmit={(event) => void handleCreateConnection(event)}
              onClick={(event) => event.stopPropagation()}
              className={`my-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border p-4 shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:p-5 ${isDarkMode ? "border-white/10 bg-[#121215] text-white" : "border-neutral-200 bg-white text-neutral-900"}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-connection-title"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 id="new-connection-title" className="text-base font-bold">
                    Nova conexão WhatsApp
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Escolha o identificador técnico usado pela Evolution e, opcionalmente, um nome
                    amigável.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeNewConnection}
                  disabled={isCreating}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-neutral-400 hover:bg-neutral-500/10"
                  aria-label="Fechar nova conexão"
                >
                  <X size={18} />
                </button>
              </div>
              <label className="block text-xs font-semibold" htmlFor="instance-name-input">
                Nome da instância
              </label>
              <input
                id="instance-name-input"
                value={newInstanceName}
                onChange={(event) => setNewInstanceName(event.target.value)}
                placeholder="WhatsApp_Comercial"
                pattern="[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?"
                minLength={2}
                maxLength={80}
                required
                autoFocus
                className={`mt-2 min-h-11 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-[#00a884]/40 ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white placeholder:text-neutral-600" : "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"}`}
              />
              <p className="mt-1.5 text-[11px] text-neutral-500">
                Use letras, números, ponto, hífen ou sublinhado. Esse ID não muda depois da conexão.
              </p>
              <label
                className="mt-4 block text-xs font-semibold"
                htmlFor="instance-display-name-input"
              >
                Nome exibido (opcional)
              </label>
              <input
                id="instance-display-name-input"
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
                placeholder="WhatsApp Comercial"
                maxLength={80}
                className={`mt-2 min-h-11 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-[#00a884]/40 ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white placeholder:text-neutral-600" : "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"}`}
              />
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeNewConnection}
                  disabled={isCreating}
                  className={`min-h-11 w-full rounded-xl border px-4 text-xs font-semibold sm:w-auto ${isDarkMode ? "border-white/10 text-neutral-300 hover:bg-white/[0.06]" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00a884] px-4 text-xs font-bold text-white transition hover:bg-[#008f70] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                >
                  {isCreating && <ArrowsClockwise size={15} className="animate-spin" />}
                  {isCreating ? "Criando…" : "Continuar para o QR Code"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      <QrCodeDialog
        isOpen={isQrOpen}
        instanceName={selectedForQr || undefined}
        onClose={() => setIsQrOpen(false)}
        onConnected={() => {
          onRefresh();
          setIsQrOpen(false);
        }}
        isDarkMode={isDarkMode}
      />
      <ConfirmDialog
        open={Boolean(instancePendingDeletion)}
        title="Excluir conexão WhatsApp?"
        description={`A conta ${instancePendingDeletion || "selecionada"} será desconectada. O histórico local seguirá a política de retenção deste workspace.`}
        confirmLabel="Excluir conexão"
        destructive
        busy={isDeleting}
        dark={isDarkMode}
        onCancel={() => setInstancePendingDeletion(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
