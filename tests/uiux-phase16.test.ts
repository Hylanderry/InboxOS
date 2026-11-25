import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyChatScopedUpdate } from "../src/features/inbox/hooks/chat-scoped-update.ts";
import { shouldMarkChatRead } from "../src/features/inbox/read-policy.ts";
import {
  isValidInstanceName,
  normalizeDisplayName,
} from "../src/server/evolution/instance-name.ts";
const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

test("F16/INBOX26: conversa visível marca não lidas mesmo quando foi selecionada automaticamente", () => {
  assert.equal(
    shouldMarkChatRead({ unread: 3, selectionSource: "automatic", timelineVisible: true }),
    true,
  );
  assert.equal(
    shouldMarkChatRead({ unread: 3, selectionSource: "user", timelineVisible: false }),
    false,
  );
  assert.equal(
    shouldMarkChatRead({ unread: 0, selectionSource: "automatic", timelineVisible: true }),
    false,
  );
});

test("F16/MEDIA05: attachment choices and audio playback have usable touch targets", () => {
  const composer = source("src/features/inbox/components/MessageComposer.tsx");
  const audio = source("src/features/media/components/AudioPlayer.tsx");
  assert.match(composer, /role="menu"/);
  assert.match(composer, /role="menuitem"/);
  assert.match(composer, /min-h-11 px-3 py-2/);
  assert.match(audio, /min-h-11 min-w-11/);
});

test("F16/INBOX32: failed read acknowledgement restores only its own optimistic counter", () => {
  const conversations = source("src/features/inbox/hooks/useConversations.ts");
  assert.match(conversations, /let previousUnread: number \| null = null/);
  assert.match(conversations, /conversation\.unread === 0/);
  assert.match(conversations, /unread: unreadToRestore/);
});

test("F16/INBOX31: group presence keeps its destination scope", () => {
  const messages = source("src/features/inbox/hooks/useMessages.ts");
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(messages, /phone: string \| null,\s*isGroup = false/);
  assert.match(messages, /instanceName: instanceName \|\| undefined,\s*isGroup,/);
  assert.match(shell, /activeChat\?\.isGroup \?\? false/);
});

test("F16/INBOX27: timeline oferece retorno ao fim sem rolar durante presença", () => {
  const timeline = source("src/features/inbox/components/MessageTimeline.tsx");
  assert.match(timeline, /Ir para as mensagens mais recentes/);
  assert.doesNotMatch(timeline, /lastMsg\?\.sender === "agent"/);
  assert.match(timeline, /showScrollToBottom/);
  assert.doesNotMatch(timeline, /\|\|\s*typing\s*\|\|\s*recording\)\s*\{[\s\S]*scrollIntoView/);
});

test("F16/INBOX28: composer encerra presença ao limpar, enviar ou parar áudio", () => {
  const composer = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(composer, /presenceTimerRef/);
  assert.match(composer, /onPresence\("paused"\)/);
  assert.match(composer, /clearTimeout\(presenceTimerRef\.current\)/);
});

test("F16/UI01: atualização assíncrona do chat A não contamina mensagens visíveis do chat B", () => {
  const visible = [{ id: "b-1" }];
  const cacheA = [{ id: "a-1" }];
  const result = applyChatScopedUpdate("B", "A", visible, cacheA, (list) => [
    ...list,
    { id: "a-2" },
  ]);
  assert.deepEqual(result.visible, visible);
  assert.strictEqual(result.visible, visible);
  assert.deepEqual(result.target, [{ id: "a-1" }, { id: "a-2" }]);
});

test("F16/UI23: cadastro longo usa rolagem da página no mobile, não cartão inacessível", () => {
  const css = source("src/styles.css");
  assert.match(css, /\.auth-page:has\(\.auth-card \.auth-segment\)[\s\S]*height:\s*auto/);
  assert.match(
    css,
    /\.auth-page:has\(\.auth-card \.auth-segment\) \.auth-card[\s\S]*max-height:\s*none/,
  );
  assert.match(css, /min-width:\s*480px\) and \(max-width:\s*1279px\)[\s\S]*auth-page:has/);
});

test("F16/UI24: telas de clientes e agenda escutam eventos do workspace", () => {
  const code = source("src/features/inbox/components/ProductViews.tsx");
  assert.match(code, /subscribeInboxEvent/);
  assert.match(code, /calendar_appointments:change/);
  assert.match(code, /crm_leads:change/);
  assert.match(code, /crm_lead_tags:change/);
});

test("F16/UI25: breakpoint desktop pequeno mantém a navegação lateral visível", () => {
  const rail = source("src/features/inbox/components/AccountRail.tsx");
  assert.match(rail, /workspace-panel hidden h-full w-\[228px\][\s\S]*?lg:flex/);
  assert.doesNotMatch(rail, /workspace-panel hidden h-full w-\[228px\][\s\S]*?xl:flex/);
});

test("F16/UI02: mensagens do chat ativo atualizam UI e cache com o mesmo resultado", () => {
  const visible = [{ id: "a-1" }];
  const result = applyChatScopedUpdate("A", "A", visible, [], (list) => [...list, { id: "a-2" }]);
  assert.deepEqual(result.visible, [{ id: "a-1" }, { id: "a-2" }]);
  assert.strictEqual(result.target, result.visible);
});

test("F16/UI03: callback de update não recebe lista do chat ativo quando alvo é outro", () => {
  const result = applyChatScopedUpdate("B", "A", ["segredo-B"], ["mensagem-A"], (list) => {
    assert.deepEqual(list, ["mensagem-A"]);
    return [...list, "reconciliada-A"];
  });
  assert.deepEqual(result.visible, ["segredo-B"]);
});

test("F16/UI04: fetch descarta resultado após parse caso chat tenha mudado", () => {
  const code = source("src/features/inbox/hooks/useMessages.ts");
  assert.match(
    code,
    /const data = await res\.json\(\);[\s\S]*?controller\.signal\.aborted \|\| activeChatIdRef\.current !== chatId/,
  );
  assert.match(code, /applyChatScopedUpdate\(/);
});

test("F16/INBOX30: refresh fora de ordem não perde a conversa selecionada", () => {
  const conversations = source("src/features/inbox/hooks/useConversations.ts");
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(conversations, /const fetchSequenceRef = useRef\(0\)/);
  assert.match(conversations, /const requestSequence = \+\+fetchSequenceRef\.current/);
  assert.match(conversations, /requestSequence !== fetchSequenceRef\.current/);
  assert.match(shell, /selectedChatSnapshotRef/);
  assert.match(shell, /conversations\.length === 0/);
  assert.match(
    shell,
    /!conversations\.some\(\(conversation\) => conversation\.id === selectedChatId\)/,
  );
});

test("F16/NAV01: dashboard é a tela padrão da área autenticada", () => {
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(shell, /useSearch\(\{ from: "\/" \}\)/);
  assert.match(shell, /useState<AppView>\(searchView\)/);
  assert.match(shell, /currentView === "dashboard" && <DashboardView/);
});

test("F16/UI05: histórico possui erro explícito e ação de tentar novamente", () => {
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  const timeline = source("src/features/inbox/components/MessageTimeline.tsx");
  assert.match(shell, /error=\{messagesError\}/);
  assert.match(shell, /onRetry=\{\(\) => void refetchMessages\(\)\}/);
  assert.match(timeline, /role="alert"/);
  assert.match(timeline, /Tentar novamente/);
});

test("F16/UI06: preferencia de tema armazenada de forma defensiva", () => {
  const provider = source("src/components/theme-provider.tsx");
  assert.match(provider, /inboxos:theme/);
  assert.match(provider, /if \(!themeLoaded\) return;/);
  assert.match(provider, /localStorage\.setItem/);
  assert.match(source("src/features/inbox/components/InboxShell.tsx"), /useTheme\(\)/);
});

test("F16/INBOX29: InboxShell não hidrata o tema duas vezes nem alterna em loop", () => {
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(shell, /const \{ isDarkMode, toggleTheme, themeLoaded \} = useTheme\(\)/);
  assert.doesNotMatch(shell, /localStorage\.getItem\("inboxos:theme"\)/);
  assert.doesNotMatch(shell, /setIsDarkMode\(stored === "dark"\)/);
});

test("F16/UI18: autenticação usa tema claro por padrão, toggle e texto de lembrança curto", () => {
  const root = source("src/routes/__root.tsx");
  const auth = source("src/features/auth/components/AuthShell.tsx");
  const login = source("src/routes/auth/login.tsx");
  assert.doesNotMatch(root, /className="dark"/);
  assert.match(root, /<ThemeProvider>/);
  assert.match(auth, /auth-theme-toggle/);
  assert.match(auth, /toggleTheme/);
  assert.match(login, /Lembrar de mim/);
  assert.doesNotMatch(login, /Lembrar deste dispositivo/);
  assert.doesNotMatch(login, /Acesso seguro/);
  assert.doesNotMatch(login, /supabase\.auth\.getSession\(\)/);
});

test("F16/AUTH01: login preserva destino interno ao entrar pelo admin", () => {
  const login = source("src/routes/auth/login.tsx");
  assert.match(login, /new URLSearchParams\(window\.location\.search\)\.get\("next"\)/);
  assert.match(login, /next\.startsWith\("\/"\)/);
  assert.match(login, /!next\.startsWith\("\/\/"\)/);
  assert.match(login, /window\.location\.replace\(destination\)/);
});
test("F16/UI19: campos de senha têm alternância acessível de visibilidade", () => {
  const password = source("src/components/ui/password-input.tsx");
  assert.match(password, /EyeSlash/);
  assert.match(password, /aria-pressed/);
  assert.match(password, /aria-label/);
  for (const file of [
    "src/features/auth/components/AuthShell.tsx",
    "src/features/auth/ConsentView.tsx",
    "src/features/inbox/components/SettingsView.tsx",
    "src/features/inbox/components/SystemAdminView.tsx",
  ]) {
    assert.match(source(file), /PasswordInput/);
  }
});

test("F16/UI20: aceite legal começa compacto e só libera após rolagem do modal", () => {
  const register = source("src/routes/auth/register.tsx");
  const dialog = source("src/features/legal/components/LegalConsentDialog.tsx");
  assert.match(register, /className="auth-legal-check"/);
  assert.match(register, /LegalConsentDialog/);
  assert.match(register, /setLegalDialogOpen\(true\)/);
  assert.match(register, /Li e concordo com os/);
  assert.match(register, /to="\/legal\/terms"/);
  assert.match(register, /to="\/legal\/privacy"/);
  assert.match(dialog, /className="legal-dialog-native-check"/);
  assert.match(dialog, /disabled={!reachedEnd}/);
  assert.match(dialog, /disabled={!accepted}/);
});

test("F16/UI29: modal legal prende foco e devolve-o ao controle de origem", () => {
  const dialog = source("src/features/legal/components/LegalConsentDialog.tsx");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /e\.key !== "Tab"/);
  assert.match(dialog, /restoreFocusRef\.current\?\.focus/);
  assert.match(dialog, /role="tablist"/);
  assert.match(dialog, /role="tabpanel"/);
});

test("F16/UI07: menu do cabeçalho possui Escape, clique externo, foco e ARIA", () => {
  const code = source("src/features/inbox/components/ChatHeader.tsx");
  assert.match(code, /document\.addEventListener\("pointerdown", dismissOutside\)/);
  assert.match(code, /document\.addEventListener\("keydown", dismissEscape\)/);
  assert.match(code, /menuTriggerRef\.current\?\.focus\(\)/);
  assert.match(code, /aria-expanded=\{isMenuOpen\}/);
  assert.doesNotMatch(code, /onMouseLeave=\{\(\) => setIsMenuOpen\(false\)\}/);
});

test("F16/UI08: avatar revalida quando a URL muda", () => {
  for (const file of ["ChatHeader.tsx", "ConversationRow.tsx"]) {
    const code = source(`src/features/inbox/components/${file}`);
    assert.match(code, /useEffect\(\(\) => setImgFailed\(false\), \[conversation\.avatar\]\)/);
  }
});

test("F16/UI09: perfil comercial possui trap de teclado, rotulo e retorno de foco", () => {
  const code = source("src/features/inbox/components/BusinessProfileModal.tsx");
  assert.match(code, /aria-labelledby="business-profile-title"/);
  assert.match(code, /event\.key !== "Tab"/);
  assert.match(code, /previousFocus\?\.isConnected/);
  assert.match(code, /profileRequestKeyRef/);
  assert.match(code, /aria-label="Fechar informações do contato"/);
});

test("F16/UI10: novo chat nao perde a resposta citada devido a envio antigo", () => {
  const code = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(code, /if \(activeChatIdRef\.current === activeChat\.id\) setReplyingTo\(null\)/);
});

test("F16/UI11: sincronizacao manual e controles de contas possuem acessibilidade", () => {
  const code = source("src/features/inbox/components/AccountsSidebar.tsx");
  assert.match(code, /WhatsAppToast\.networkError\("Não foi possível sincronizar/);
  assert.match(code, /aria-pressed=\{isPinned\}/);
  assert.match(code, /aria-label="Conectar nova conta de WhatsApp"/);
});

test("F16/UI12: tema claro torna citacao legivel e a preview fecha so no backdrop", () => {
  const composer = source("src/features/inbox/components/MessageComposer.tsx");
  const preview = source("src/features/media/components/MediaPreviewModal.tsx");
  assert.match(composer, /isDarkMode \? "text-zinc-200" : "text-neutral-800"/);
  assert.match(preview, /event\.target === event\.currentTarget/);
});

test("F16/UI13: botoes criticos tem alvo de toque legivel", () => {
  const css = source("src/styles.css");
  const settings = source("src/features/inbox/components/SettingsView.tsx");
  assert.match(css, /\.chat-header-action,[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
  assert.match(settings, /min-h-11 shrink-0 rounded-xl/);
});

test("F16/UI14: presença em tempo real permanece isolada por instância", () => {
  const presence = source("src/features/inbox/hooks/usePresence.ts");
  const events = source("src/routes/api/events/index.ts");
  const timeline = source("src/features/inbox/components/MessageTimeline.tsx");
  assert.match(presence, /presenceKey\(phone, instanceName, instanceId\)/);
  assert.match(presence, /instance_name\?: string/);
  assert.doesNotMatch(presence, /presences\[presenceKey\(phone\)\]/);
  assert.match(events, /select\("phone,state,updated_at,instance_id,instance_name"\)/);
  assert.match(timeline, /activeInstanceName/);
});
test("F16/UI15: troca de workspace reseta cursor realtime e lista de conversas", () => {
  const socket = source("src/lib/realtimeSocket.ts");
  const conversations = source("src/features/inbox/hooks/useConversations.ts");
  assert.match(socket, /inboxos:workspace-change/);
  assert.match(socket, /workspaceEpoch/);
  assert.match(socket, /requestEpoch !== workspaceEpoch/);
  assert.match(conversations, /setConversations\(\[\]\)/);
  assert.match(conversations, /setNextCursor\(null\)/);
  assert.match(conversations, /window\.addEventListener\("inboxos:workspace-change"/);
});
test("F16/UI36: sessões são agrupadas por dispositivo e lista completa usa dialog acessível", () => {
  const settings = source("src/features/inbox/components/SettingsView.tsx");
  assert.match(settings, /function buildSecurityConnections\(/);
  assert.match(settings, /const key = session\.device_id \? `device:\$\{session\.device_id\}`/);
  assert.match(settings, /legacySessionKey\(session\)/);
  assert.match(settings, /last_ip[\s\S]*user_agent/);
  assert.match(settings, /aria-modal="true"/);
  assert.match(settings, /aria-labelledby="security-sessions-title"/);
  assert.match(settings, /event\.key === "Escape"/);
  assert.match(settings, /Cada dispositivo aparece uma única vez/);
  assert.match(settings, /Ver todas as (sessões|conexões)/);
});
test("F16/UI30: inbox mobile carrega conversas sem bloquear na sincronização Evolution", () => {
  const conversations = source("src/features/inbox/hooks/useConversations.ts");
  assert.match(conversations, /void fetchConversations\(\)/);
  assert.doesNotMatch(
    conversations,
    /syncEvolution\(true\)\s*\.then\(\(\)\s*=>\s*fetchConversations/,
  );
});

test("F16/UI38: sincronização automática de fotos roda somente na Inbox", () => {
  const conversations = source("src/features/inbox/hooks/useConversations.ts");
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(conversations, /enableProfileBackfill\?: boolean/);
  assert.match(conversations, /if \(!enableProfileBackfill\) return;/);
  assert.match(conversations, /\[enableProfileBackfill, syncProfilePictures\]/);
  assert.match(shell, /useConversations\(\{ enableProfileBackfill: currentView === "inbox" \}\)/);
});
test("F16/UI16: troca de workspace limpa seleção e cache de mensagens", () => {
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  const messages = source("src/features/inbox/hooks/useMessages.ts");
  assert.match(shell, /inboxos:workspace-change/);
  assert.match(shell, /setSelectedChatId\(null\)/);
  assert.match(messages, /messagesCache\.clear\(\)/);
  assert.match(messages, /setDisplayedChatId\(null\)/);
});
test("F16/UI17: interface não expõe nomes de provedores ou plataformas", () => {
  const visibleSources = [
    source("src/features/instances/components/QrCodeDialog.tsx"),
    source("src/features/inbox/components/ProductViews.tsx"),
    source("src/features/inbox/components/SystemAdminView.tsx"),
  ];
  for (const code of visibleSources) {
    assert.doesNotMatch(code, /Evolution API|Baileys|GROQ_API_KEY|API Keys/);
  }
});

test("F16/UI37: System Admin usa tokens de texto legíveis no tema claro", () => {
  const admin = source("src/features/inbox/components/SystemAdminView.tsx");
  assert.match(admin, /const textMutedClass = isDarkMode/);
  assert.match(admin, /className=\{`text-xs \$\{textMutedClass\}`\}/);
  assert.doesNotMatch(admin, /className="(?:[^"`]* )?text-zinc-[34]00/);
});

test("F16/MEDIA01: retry de mídia reutiliza mediaPath e nunca envia URL assinada como Base64", () => {
  const hook = source("src/features/inbox/hooks/useMessages.ts");
  assert.match(hook, /mediaPath\?: string/);
  assert.match(hook, /mediaPath: failedMsg\.mediaPath/);
  assert.match(hook, /message\.id === tempId \? \{ \.\.\.message, mediaPath \}/);
  assert.match(hook, /mediaPath: failedMsg\.mediaPath/);
  assert.doesNotMatch(
    hook,
    /media:\s*failedMsg\.mediaUrl \|\| failedMsg\.audioUrl \|\| failedMsg\.fileUrl/,
  );
});

test("F16/MEDIA02: GIF recebido usa imagem animada, não elemento de vídeo", () => {
  const bubble = source("src/features/inbox/components/MessageBubble.tsx");
  assert.match(bubble, /isGif[\s\S]*?<img/);
  assert.doesNotMatch(bubble, /isGif[\s\S]*?<video src=\{message\.mediaUrl\}/);
});

test("F16/MEDIA03: endpoint de mídia exige prefixo do workspace autenticado", () => {
  const route = source("src/routes/api/media/$.ts");
  assert.match(route, /path\.startsWith\(\x60\$\{auth\.workspaceId\}\/\x60\)/);
  assert.match(route, /Arquivo .*encontrado/);
});

test("F16/UI21: cadastro usa checkbox simples com links legais", () => {
  const register = source("src/routes/auth/register.tsx");
  assert.match(register, /Li e concordo com os/);
  assert.match(register, /to="\/legal\/terms"/);
  assert.match(register, /to="\/legal\/privacy"/);
  assert.match(register, /onAccept=\{\(\) => \{[\s\S]*setAcceptedTerms\(true\)/);
});

test("F16/UI22: senha mantém o olho ancorado e o medidor anima estados", () => {
  const password = source("src/components/ui/password-input.tsx");
  const auth = source("src/features/auth/components/AuthShell.tsx");
  const css = source("src/styles.css");
  assert.match(password, /password-input-toggle/);
  assert.match(auth, /placeholder=/);
  assert.match(auth, /is-score-/);
  assert.match(css, /\.password-input-toggle\s*\{[\s\S]*inset-block: 2px;/);
  assert.match(css, /\.password-meter-track i\s*\{[\s\S]*transition:/);
  assert.match(css, /\.auth-legal-check[\s\S]*appearance: none/);
});

test("F16/UI26: seletor de país mantém códigos legíveis sem emoji quebrado", () => {
  const register = source("src/routes/auth/register.tsx");
  const css = source("src/styles.css");
  assert.doesNotMatch(register, /countryFlag\(x\.code\)/);
  assert.match(register, /GlobeHemisphereWest/);
  assert.match(register, /role="listbox"/);
  assert.match(register, /auth-country-option-code/);
  assert.match(register, /auth-country-option-dial/);
  assert.match(register, /document\.addEventListener\("scroll", closeOnScroll, true\)/);
  const compactMenuOverride = css.lastIndexOf("@media (max-width: 479px)");
  assert.ok(compactMenuOverride >= 0);
  assert.match(
    css.slice(compactMenuOverride),
    /\.auth-country-menu\s*\{[\s\S]*?top: auto;[\s\S]*?bottom: calc\(100% \+ 6px\)/,
  );
});

test("F16/UI27: controles de autenticação têm alvo de toque e indicador estável", () => {
  const register = source("src/routes/auth/register.tsx");
  const login = source("src/routes/auth/login.tsx");
  const css = source("src/styles.css");
  assert.match(register, /id="legal-consent"/);
  assert.match(register, /className="auth-check-box"/);
  assert.match(login, /id="remember-device"/);
  assert.match(login, /className="auth-check-box"/);
  assert.match(css, /\.auth-check-input,[\s\S]*\.auth-legal-check\s*\{[\s\S]*opacity: 0/);
  assert.match(css, /\.auth-check-box\s*\{[\s\S]*pointer-events: none/);
  assert.match(css, /\.auth-check-box\s*\{[\s\S]*min-height|\.auth-check-box\s*\{/);
});

test("F16/UI28: aceite legal permite desmarcar sem reabrir o modal", () => {
  const register = source("src/routes/auth/register.tsx");
  assert.match(register, /className="auth-legal-row"[\s\S]*role="group"/);
  assert.match(register, /id="legal-consent"[\s\S]*onChange=/);
  assert.doesNotMatch(register, /id="legal-consent"[\s\S]*readOnly/);
  assert.match(register, /setAcceptedTerms\(false\)/);
  assert.match(register, /clearRegistrationLegalConsentCookie/);
  assert.doesNotMatch(register, /htmlFor="legal-consent"/);
});

test("F16/UI40: consentimento do cadastro usa cookie de 30 minutos e limpa ao sair", () => {
  const register = source("src/routes/auth/register.tsx");
  const consent = source("src/features/legal/legal-consent.ts");
  assert.match(consent, /REGISTRATION_LEGAL_CONSENT_COOKIE/);
  assert.match(consent, /REGISTRATION_LEGAL_CONSENT_TTL_MS/);
  assert.match(consent, /Max-Age=\$\{REGISTRATION_LEGAL_CONSENT_TTL_SECONDS\}/);
  assert.match(register, /hasRegistrationLegalConsentCookie/);
  assert.match(register, /pagehide/);
  assert.match(register, /clearRegistrationLegalConsentCookie/);
  assert.match(register, /setTimeout/);
  assert.match(register, /acceptedTerms: true/);
  assert.match(register, /acceptedPrivacy: true/);
});

test("F16/MEDIA04: preview de mídia usa ícones Phosphor por tipo", () => {
  const icon = source("src/features/inbox/components/MediaTypeIcon.tsx");
  const row = source("src/features/inbox/components/ConversationRow.tsx");
  assert.match(icon, /FileAudio/);
  assert.match(icon, /Sticker/);
  assert.match(icon, /VideoCamera/);
  assert.match(row, /<MediaTypeIcon/);
});

test("F16/CLIENTS01: Clientes permite criar, importar e exportar contatos", () => {
  const clients = source("src/features/inbox/components/ProductViews.tsx");
  assert.match(clients, /title="Clientes"/);
  assert.match(clients, /Novo cliente/);
  assert.match(clients, /Importar CSV/);
  assert.match(clients, /Exportar CSV/);
  assert.match(clients, /createLead\(/);
  assert.match(clients, /URL\.createObjectURL/);
});

test("F16/CLIENTS02: importação CSV ignora cabeçalho e não gera POST inválido", () => {
  const clients = source("src/features/inbox/components/ProductViews.tsx");
  assert.match(clients, /const dataRows = rows\.slice\(hasHeader \? 1 : 0\)/);
  assert.match(clients, /const hasHeader =/);
  assert.match(clients, /rows\[0\]\?\.\[0\]/);
  assert.match(clients, /validateClientImportCount\(dataRows\.length\)/);
  assert.match(clients, /const rowsToImport = dataRows/);
  assert.match(clients, /parseDelimitedCsv/);
});

test("F16/FOLLOWUP01: follow-up vincula cliente, nota e reagendamento", () => {
  const views = source("src/features/inbox/components/ProductViews.tsx");
  assert.match(views, /Cliente do follow-up/);
  assert.match(views, /leadId: form\.leadId \|\| null/);
  assert.match(views, /note: form\.note\.trim\(\) \|\| null/);
  assert.match(views, /Reagendar tarefa/);
  assert.match(views, /updateFollowUp\(\{[\s\S]*dueAt:/);
});

test("F16/INST01: a lista de instâncias expõe o nome exibido sem trocar a chave técnica", () => {
  const route = source("src/routes/api/instances/index.ts");
  const hook = source("src/features/instances/hooks/useInstances.ts");
  const types = source("src/features/inbox/types.ts");
  assert.match(route, /display_name/);
  assert.match(route, /alias:\s*saved\.display_name\s*\|\|\s*saved\.instance_name/);
  assert.match(hook, /value\("alias",\s*"display_name"/);
  assert.match(types, /alias\?:\s*string/);
});

test("F16/INST02: renomear a instância é um PATCH admin escopado ao workspace", () => {
  const route = source("src/routes/api/instances/$name/index.ts");
  assert.match(route, /PATCH:\s*async/);
  assert.match(
    route,
    /requireApiPermission\(request,\s*["']instances\.manage["']\s*,\s*["']admin["']\)/,
  );
  assert.match(route, /\.eq\(["']workspace_id["'],\s*auth\.workspaceId\)/);
  assert.match(route, /\.eq\(["']instance_name["'],\s*name\)/);
  assert.match(route, /display_name/);
  assert.doesNotMatch(route, /evolutionFetch\([^\n]*rename|instance\/rename/);
});

test("F16/INST03: nova conexão permite escolher um identificador técnico validado", () => {
  const manager = source("src/features/instances/components/ConnectionManager.tsx");
  const route = source("src/routes/api/instances/index.ts");
  assert.match(manager, /Nome da instância/);
  assert.match(manager, /instanceName/);
  assert.match(manager, /pattern=/);
  assert.match(route, /isValidInstanceName/);
  assert.match(route, /displayName/);
});

test("F16/INST04: health check do webhook não é repetido a cada refresh", () => {
  const route = source("src/routes/api/instances/index.ts");
  assert.match(route, /webhookHealthCache/);
  assert.match(route, /WEBHOOK_HEALTH_TTL_MS/);
  assert.match(route, /shouldCheckWebhook/);
});

test("F16/INST05: validação do nome impede caracteres ambíguos e normaliza o rótulo", () => {
  assert.equal(isValidInstanceName("WhatsApp_Comercial-01"), true);
  assert.equal(isValidInstanceName(" WhatsApp Comercial "), false);
  assert.equal(isValidInstanceName("a/b"), false);
  assert.equal(normalizeDisplayName("  WhatsApp   Comercial  "), "WhatsApp Comercial");
  assert.equal(normalizeDisplayName("   "), null);
});

test("F16/INST06: nome Evolution já pertencente a outro workspace retorna conflito", () => {
  const route = source("src/routes/api/instances/index.ts");
  assert.match(route, /\.eq\(["']instance_name["'],\s*instanceName\)/);
  assert.match(route, /workspace_id/);
  assert.match(route, /409/);
  assert.match(route, /já está vinculada|já pertence|outro workspace/i);
});

test("F16/INST13: conexão Evolution existente não é anexada sem vínculo local", () => {
  const route = source("src/routes/api/instances/index.ts");
  assert.match(route, /const knownInWorkspace/);
  assert.match(route, /alreadyExists && !knownInWorkspace/);
  assert.match(route, /Evolution e ainda não foi vinculada/i);
  assert.match(route, /409/);
});

test("F16/INST07: o atalho + da barra lateral usa o mesmo fluxo nomeado de Conexões", () => {
  const shell = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(shell, /onOpenNewConnection=\{\(\) => \{[\s\S]*setCurrentView\("conexoes"\)/);
  assert.doesNotMatch(shell, /onOpenNewConnection=\{\(\) => \{[\s\S]*Date\.now\(\)/);
  assert.doesNotMatch(shell, /const QrCodeDialog = lazy/);
  assert.doesNotMatch(shell, /isQrModalOpen|qrInstanceName/);
});

test("F16/INST08: falha ao ler instÃ¢ncias no Supabase nÃ£o vira lista vazia falsa", () => {
  const route = source("src/routes/api/instances/index.ts");
  assert.match(route, /data: savedInstances,\s*error: savedInstancesError/);
  assert.match(route, /savedInstancesError/);
  assert.match(route, /Falha ao consultar inst.*do workspace/);
});

test("F16/INST09: o dialog de QR nÃ£o cria instÃ¢ncia silenciosa sem nome escolhido", () => {
  const dialog = source("src/features/instances/components/QrCodeDialog.tsx");
  assert.doesNotMatch(dialog, /WhatsApp_\$\{Date\.now/);
  assert.doesNotMatch(dialog, /Date\.now\(\)\.toString\(\)/);
});

test("F16/INST10: respostas QR antigas nÃ£o ressuscitam estado apÃ³s fechar ou trocar a instÃ¢ncia", () => {
  const dialog = source("src/features/instances/components/QrCodeDialog.tsx");
  assert.match(dialog, /requestEpochRef/);
  assert.match(dialog, /requestEpoch !== requestEpochRef\.current/);
  assert.match(dialog, /requestEpochRef\.current \+= 1/);
});

test("F16/INST12: QR nunca consulta Evolution antes de validar o workspace", () => {
  const route = source("src/routes/api/instances/$name/qrcode.ts");
  const ownership = route.indexOf("Conexão não encontrada neste workspace");
  const provider = route.indexOf("/instance/connectionState/");
  assert.ok(ownership >= 0);
  assert.ok(provider > ownership);
  assert.match(route, /eq\("workspace_id", auth\.workspaceId\)/);
});

test("F16/INST11: modal de nova conexÃ£o fecha no Escape, prende Tab e devolve foco", () => {
  const manager = source("src/features/instances/components/ConnectionManager.tsx");
  assert.match(manager, /newConnectionDialogRef/);
  assert.match(manager, /event\.key === "Escape"/);
  assert.match(manager, /document\.addEventListener\("keydown", onKeyDown\)/);
  assert.match(manager, /event\.key !== "Tab"/);
  assert.match(manager, /newConnectionTriggerRef\.current\?\.focus\(\)/);
  assert.match(manager, /createPortal\(/);
  assert.match(manager, /document\.body/);
  assert.match(manager, /z-\[120\]/);
  assert.match(manager, /min-h-\[100dvh\]/);
});

test("F16/UI31: feedback usa o tema do toggle e uma posição única", () => {
  const toaster = source("src/components/ui/sonner.tsx");
  const root = source("src/routes/__root.tsx");
  const css = source("src/styles.css");
  assert.match(toaster, /const \{ theme \} = useTheme\(\)/);
  assert.match(toaster, /theme=\{theme\}/);
  assert.match(toaster, /position="top-right"/);
  assert.match(toaster, /mobileOffset/);
  assert.match(root, /<Toaster closeButton \/>/);
  assert.match(css, /\[data-sonner-toast\]\.inbox-toast/);
  assert.match(css, /\.inbox-feedback-error/);
  // Tema escuro por tokens (uma superfície neutra nos dois temas, cor só no ícone).
  assert.match(css, /:root\.dark \{[^}]*--feedback-surface/);
  assert.match(css, /:root \{[^}]*--feedback-surface/);
  assert.doesNotMatch(css, /\.inbox-feedback-error \{[^}]*background: rgba\(190, 24, 93/);
});

test("F16/UI32: alertas de IA e timeline seguem o feedback semântico do produto", () => {
  const products = source("src/features/inbox/components/ProductViews.tsx");
  const timeline = source("src/features/inbox/components/MessageTimeline.tsx");
  const toasts = source("src/components/ui/ToastProvider.tsx");
  assert.match(products, /Respostas automáticas desativadas/);
  assert.match(products, /inbox-feedback-state/);
  assert.match(timeline, /Mensagens indisponíveis/);
  assert.match(timeline, /inbox-feedback-error/);
  assert.match(toasts, /Conexão indisponível/);
  assert.match(toasts, /Não foi possível concluir agora/);
  assert.doesNotMatch(toasts, /Tentando reconectar automaticamente/);
});

test("F16/INST14: connection header keeps its description readable on mobile", () => {
  const manager = source("src/features/instances/components/ConnectionManager.tsx");
  assert.match(manager, /flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between/);
  assert.match(manager, /flex w-full shrink-0 items-center gap-2 sm:w-auto/);
  assert.match(manager, /min-h-11 min-w-0 flex-1 items-center justify-center/);
  assert.match(manager, /whitespace-nowrap/);
});

test("F16/MEDIA06: previews of incoming media use keyboard-accessible controls", () => {
  const bubble = source("src/features/inbox/components/MessageBubble.tsx");
  assert.match(
    bubble,
    /aria-label=\{stickerIsVideo \? "Ampliar figurinha em vídeo" : "Ampliar figurinha"\}/,
  );
  assert.match(bubble, /aria-label="Ampliar GIF"/);
  assert.match(bubble, /aria-label="Ampliar imagem"/);
  assert.match(bubble, /aria-label=\{`Visualizar \$\{message\.fileName \|\| "documento"\}`\}/);
  assert.match(bubble, /focus-visible:ring-2 focus-visible:ring-\[#00a884\]\/60/);
  assert.doesNotMatch(bubble, /bg-rose-500\/20 text-rose-400/);
});

test("F16/UI38: conteúdo truncado continua acessível sem causar overflow", () => {
  const accounts = source("src/features/inbox/components/AccountsSidebar.tsx");
  const header = source("src/features/inbox/components/ChatHeader.tsx");
  const row = source("src/features/inbox/components/ConversationRow.tsx");
  const products = source("src/features/inbox/components/ProductViews.tsx");
  const admin = source("src/features/inbox/components/SystemAdminView.tsx");
  const css = source("src/styles.css");

  assert.match(accounts, /<p\s+title=\{inst\.alias \|\| inst\.instanceName\}/);
  assert.match(header, /<h3\s+title=\{cleanName\}/);
  assert.match(row, /<h4\s+title=\{cleanName\}/);
  assert.match(row, /<span\s+title=\{cleanMessage\}[^>]*className="truncate"/);

  assert.match(products, /<h2\s+title=\{stage\.name\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{lead\.name\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{task\.title\}[^>]*className=/);
  assert.match(products, /<p\s+title=\{document\.title\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{agent\.name\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{assignedInstance\?\.instance_name \|\|/);
  assert.match(
    products,
    /<span\s+title=\{r\.input_excerpt \|\| "Sem entrada"\}[^>]*className="truncate/,
  );
  assert.match(products, /<p\s+title=\{appointment\.title\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{client\.name\}[^>]*className="truncate/);
  assert.match(products, /<p\s+title=\{client\.phone_e164 \|\| client\.email \|\| "Sem contato"\}/);

  assert.match(admin, /min-w-0 break-words/);
  assert.match(admin, /min-w-0 break-all/);
  assert.match(css, /.inbox-app :where\(\.flex > \*, \.grid > \*\)\s*\{\s*min-width: 0;/);
  assert.match(
    css,
    /.inbox-app :where\(p, h1, h2, h3, h4, h5, h6, label, strong, b, code, time\)\s*\{\s*overflow-wrap: anywhere;/,
  );
});
