import { useState, useRef, useEffect } from "react";
import {
  X,
  DownloadSimple,
  UploadSimple,
  FileText,
  CheckCircle,
  WarningCircle,
  ArrowsClockwise,
  UserPlus,
} from "@phosphor-icons/react";
import type { Conversation, ChatMessage } from "../types";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { apiFetch } from "@/lib/api-fetch";

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChat?: Conversation | null;
  messages?: ChatMessage[];
  allConversations?: Conversation[];
  onImportComplete?: () => void;
  isDarkMode?: boolean;
}

export function ImportExportModal({
  isOpen,
  onClose,
  activeChat,
  messages = [],
  allConversations = [],
  onImportComplete,
  isDarkMode = true,
}: ImportExportModalProps) {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [importInput, setImportInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mantém a tabulação dentro do modal e devolve o foco ao disparador.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Exportar conversa atual como arquivo TXT formatado
  const handleExportCurrentTxt = () => {
    if (!activeChat) return;

    let content = `========================================================\n`;
    content += `Conversa WhatsApp: ${activeChat.name} (${activeChat.phone})\n`;
    content += `Instância: ${activeChat.instanceName}\n`;
    content += `Data da exportação: ${new Date().toLocaleString("pt-BR")}\n`;
    content += `Total de mensagens: ${messages.length}\n`;
    content += `========================================================\n\n`;

    for (const msg of messages) {
      const sender = msg.sender === "agent" ? "Você" : msg.senderName || activeChat.name;
      const typeStr = msg.type !== "text" ? ` [${msg.type.toUpperCase()}]` : "";
      content += `[${msg.time}] ${sender}:${typeStr} ${msg.text || (msg.mediaUrl ? msg.mediaUrl : "")}\n`;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversa_${activeChat.phone || "whatsapp"}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    WhatsAppToast.success("Conversa exportada", "Arquivo TXT gerado com sucesso.");
  };

  // Exportar conversa atual como JSON
  const handleExportCurrentJson = () => {
    if (!activeChat) return;
    const data = {
      chat: activeChat,
      exportedAt: new Date().toISOString(),
      messages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversa_${activeChat.phone || "whatsapp"}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    WhatsAppToast.success("Conversa exportada", "Arquivo JSON estruturado gerado com sucesso.");
  };

  // Exportar todas as conversas do painel como backup JSON
  const handleExportAllJson = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      total: allConversations.length,
      conversations: allConversations,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_conversas_whatsapp_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    WhatsAppToast.success(
      "Backup exportado",
      `${allConversations.length} conversas salvas em JSON.`,
    );
  };

  // Processa arquivo selecionado para importação
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Evita travamento do browser ao abrir arquivos gigantes; backend tem limites próprios.
    if (file.size > 2 * 1024 * 1024) {
      WhatsAppToast.fileTooLarge(2);
      e.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      WhatsAppToast.networkError("Não foi possível ler o arquivo selecionado.");
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportInput(text);
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = "";
  };

  // Envia contatos para a rota de importação
  const handleImportSubmit = async () => {
    if (!importInput.trim()) {
      WhatsAppToast.networkError("Insira contatos ou envie um arquivo para importar.");
      return;
    }

    setIsSubmitting(true);
    setImportResult(null);

    try {
      let items: unknown[] = [];
      const trimmed = importInput.trim();

      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        // Formato JSON
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          items = Array.isArray(record["contacts"])
            ? record["contacts"]
            : Array.isArray(record["chats"])
              ? record["chats"]
              : [record];
        }
      } else {
        // Formato CSV (linhas com "Nome, Telefone" ou apenas "Telefone")
        const lines = trimmed.split(/\r?\n/);
        for (const line of lines) {
          const parts = line.split(/[,;\t]/).map((p) => p.trim());
          if (parts.length >= 2) {
            items.push({ name: parts[0], phone: parts[1] });
          } else if (parts[0]) {
            items.push({ name: null, phone: parts[0] });
          }
        }
      }

      if (items.length === 0) {
        throw new Error("Nenhum registro legível encontrado.");
      }

      const res = await apiFetch("/api/sync/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: items }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao importar contatos.");
      }

      setImportResult({ count: data.imported });
      WhatsAppToast.success(
        "Importação concluída",
        `${data.imported} contatos/conversas foram sincronizados com sucesso.`,
      );
      if (onImportComplete) onImportComplete();
    } catch (err: unknown) {
      WhatsAppToast.networkError(
        err instanceof Error ? err.message : "Erro ao processar importação",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm transition-all duration-200 animate-fade-in overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`relative w-full max-w-lg m-auto p-6 rounded-2xl border shadow-2xl transition-all overflow-hidden ${
          isDarkMode
            ? "bg-[#111216] border-white/[0.12] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
            : "bg-white border-neutral-200 text-neutral-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
        }`}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-export-dialog-title"
      >
        {/* Cabeçalho */}
        <div className="relative flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.05] text-zinc-400 border border-white/[0.08]">
              {tab === "export" ? (
                <DownloadSimple size={22} weight="bold" />
              ) : (
                <UploadSimple size={22} weight="bold" />
              )}
            </div>
            <div>
              <h3 id="import-export-dialog-title" className="text-base font-bold tracking-tight">
                Importação & Exportação
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Gerencie histórico e contatos do WhatsApp
              </p>
            </div>
          </div>

          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar importação e exportação"
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode
                ? "text-neutral-400 hover:text-white hover:bg-white/10"
                : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas Alternadoras */}
        <div className="flex gap-2 mt-4 p-1 rounded-xl bg-neutral-500/10 border border-white/5">
          <button
            type="button"
            onClick={() => setTab("export")}
            aria-pressed={tab === "export"}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              tab === "export"
                ? isDarkMode
                  ? "bg-white/[0.11] text-white"
                  : "bg-black/[0.08] text-neutral-900"
                : isDarkMode
                  ? "text-neutral-400 hover:text-white"
                  : "text-neutral-600 hover:text-neutral-950"
            }`}
          >
            <DownloadSimple size={15} weight="bold" />
            <span>Exportar</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("import")}
            aria-pressed={tab === "import"}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              tab === "import"
                ? isDarkMode
                  ? "bg-white/[0.11] text-white"
                  : "bg-black/[0.08] text-neutral-900"
                : isDarkMode
                  ? "text-neutral-400 hover:text-white"
                  : "text-neutral-600 hover:text-neutral-950"
            }`}
          >
            <UploadSimple size={15} weight="bold" />
            <span>Importar</span>
          </button>
        </div>

        {/* Conteúdo Aba Exportar */}
        {tab === "export" && (
          <div className="py-5 space-y-4 animate-smooth-in">
            {activeChat ? (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDarkMode ? "bg-[#16171d]/80 border-white/5" : "bg-neutral-50 border-neutral-200"
                }`}
              >
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Conversa Atual
                  </h4>
                  <p className="text-xs font-semibold mt-0.5">
                    {activeChat.name} ({activeChat.phone})
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {messages.length} mensagens carregadas nesta tela
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportCurrentTxt}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-colors ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                        : "bg-white border-neutral-200 hover:bg-neutral-100 text-neutral-900 shadow-xs"
                    }`}
                  >
                    <FileText size={15} />
                    <span>Texto (.txt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCurrentJson}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-colors ${
                      isDarkMode
                        ? "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                        : "bg-white border-neutral-200 hover:bg-neutral-100 text-neutral-900 shadow-xs"
                    }`}
                  >
                    <DownloadSimple size={15} />
                    <span>Dados (.json)</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 text-center py-2">
                Selecione uma conversa para exportar o histórico individual.
              </p>
            )}

            {/* Exportar Todas as Conversas */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isDarkMode ? "bg-[#16171d]/80 border-white/5" : "bg-neutral-50 border-neutral-200"
              }`}
            >
              <div>
                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                  Backup Geral
                </h4>
                <p className="text-xs font-semibold mt-0.5">
                  Todas as conversas do painel ({allConversations.length})
                </p>
                <p className="text-[11px] text-neutral-400">
                  Exporta metadados de todas as conversas conectadas para backup JSON.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportAllJson}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-zinc-200 active:scale-[0.99] dark:bg-white dark:text-black"
              >
                <DownloadSimple size={16} weight="bold" />
                <span>Exportar Todas as Conversas (JSON)</span>
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo Aba Importar */}
        {tab === "import" && (
          <div className="py-5 space-y-4 animate-smooth-in">
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isDarkMode ? "bg-[#16171d]/80 border-white/5" : "bg-neutral-50 border-neutral-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Importar Contatos / Conversas
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Aceita JSON ou lista CSV (ex: Nome, 5511999999999)
                  </p>
                </div>

                <input
                  type="file"
                  accept=".json,.csv,.txt"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                    isDarkMode
                      ? "bg-white/5 border-white/10 hover:bg-white/10 text-neutral-300"
                      : "bg-white border-neutral-200 hover:bg-neutral-100 text-neutral-700"
                  }`}
                >
                  <UploadSimple size={14} />
                  <span>Carregar Arquivo</span>
                </button>
              </div>

              <textarea
                aria-label="Contatos para importar em formato CSV ou JSON"
                rows={5}
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder={
                  "João Silva, 5511999999999\nMaria Santos, 5521988888888\nou cole um JSON completo aqui..."
                }
                className={`w-full p-3 rounded-lg border text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-zinc-500 ${
                  isDarkMode
                    ? "bg-[#101115] border-neutral-800 text-neutral-200 placeholder-neutral-600"
                    : "bg-white border-neutral-200 text-neutral-900 placeholder-neutral-400"
                }`}
              />

              {importResult && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-xs font-semibold text-[#00a884] animate-smooth-in"
                >
                  <CheckCircle size={16} weight="fill" />
                  <span>{importResult.count} contatos/conversas sincronizados com sucesso!</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isSubmitting || !importInput.trim()}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {isSubmitting ? (
                  <>
                    <ArrowsClockwise size={15} className="animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} weight="bold" />
                    <span>Importar Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
