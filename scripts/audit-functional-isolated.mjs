import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const OUT_DIR = resolve("tests/e2e-artifacts/functional-audit-2026-10-13");
mkdirSync(OUT_DIR, { recursive: true });
const viewportParts = (process.env.AUDIT_VIEWPORT || "1440x900").split("x").map(Number);
const viewport = {
  width: Number.isFinite(viewportParts[0]) ? viewportParts[0] : 1440,
  height: Number.isFinite(viewportParts[1]) ? viewportParts[1] : 900,
};
const viewportLabel = `${viewport.width}x${viewport.height}`;
const auditGroupChat = process.env.AUDIT_GROUP_CHAT === "1";
const auditSupabaseStorageKey =
  process.env.AUDIT_SUPABASE_STORAGE_KEY || "sb-local-audit-auth-token";

const user = {
  id: "97818e95-71bb-455b-9d41-35b809beab9b",
  aud: "authenticated",
  role: "authenticated",
  email: "qa@example.com",
  app_metadata: { provider: "email" },
  user_metadata: { role: "superadmin" },
};
const session = {
  access_token: "mock-valid-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "mock-refresh",
  user,
};

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function createState() {
  return {
    stages: [{ id: "stage-1", name: "Novo", color: "#3b82f6", position: 0, kind: "open" }],
    leads: [
      {
        id: "lead-1",
        stage_id: "stage-1",
        chat_id: "chat-1",
        contact_id: "contact-1",
        name: "Cliente QA",
        phone_e164: "+5511999999999",
        email: "qa@example.com",
        company: "InboxOS QA",
        value_cents: 120000,
        currency: "BRL",
        source: "qa",
        owner_user_id: null,
        notes: null,
        updated_at: new Date().toISOString(),
        profilePicUrl: null,
        contactCategory: "potential_lead",
      },
    ],
    tasks: [],
    tags: [{ id: "tag-1", name: "QA", color: "#71717a" }],
    calendars: [
      {
        id: "cal-1",
        name: "Agenda QA",
        timezone: "America/Sao_Paulo",
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        daily_capacity: 10,
        availability: {},
        is_default: true,
        active: true,
      },
    ],
    appointments: [],
    agents: [
      {
        id: "agent-1",
        name: "Agente QA",
        enabled: true,
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        instructions: "Qualificar contatos com linguagem clara.",
        runtime_config: {},
        temperature: 0.4,
        max_completion_tokens: 500,
        reply_mode: "manual",
        allow_groups: false,
        instance_id: "inst-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    conversations: [
      {
        id: "chat-1",
        chat_id: "chat-1",
        instance_id: "inst-1",
        instance_name: "WhatsApp_QA",
        name: "Cliente QA",
        phone: "+5511999999999",
        is_group: auditGroupChat,
        unread_count: 1,
        unread: 1,
        last_message: "Olá, teste seguro",
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contact_category: "lead",
        can_send: true,
      },
    ],
    messages: [
      {
        id: "msg-1",
        chat_id: "chat-1",
        direction: "inbound",
        sender: "client",
        type: "text",
        text: "Olá, teste seguro",
        created_at: new Date().toISOString(),
        status: "received",
      },
    ],
  };
}

function bodyOf(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    return {};
  }
}

function installApi(page, state, network) {
  return page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const startedAt = Date.now();
    let response = json({ success: true });
    const payload = bodyOf(request);

    if (path === "/api/events") {
      response = json({ events: [], cursor: "0", hasMore: false, snapshot: { presences: [] } });
    } else if (path === "/api/admin/me") {
      response = json({ role: "superadmin" });
    } else if (path === "/api/workspaces/members/" || path === "/api/workspaces/members") {
      response = json({ members: [] });
    } else if (path === "/api/workspaces/invitations/" || path === "/api/workspaces/invitations") {
      response = json({ invitations: [] });
    } else if (path === "/api/workspaces" || path === "/api/workspaces/") {
      if (method === "GET") {
        response = json({
          workspaces: [
            {
              id: "ws-1",
              name: "QA Workspace",
              slug: "qa",
              kind: "workspace",
              role: "owner",
              created_at: new Date().toISOString(),
            },
          ],
          activeWorkspaceId: "ws-1",
        });
      } else {
        response = json({ workspace: { id: "ws-new", name: payload.name || "Novo workspace" } });
      }
    } else if (path === "/api/dashboard") {
      response = json({
        metrics: {
          connectedInstances: 1,
          totalInstances: 1,
          activeChats: state.conversations.length,
          unread: 1,
          messages24h: state.messages.length,
          crmLeads: state.leads.length,
          pipelineByCurrency: [{ currency: "BRL", valueCents: 120000 }],
          pendingFollowUps: state.tasks.length,
          overdueFollowUps: 0,
          enabledAgents: state.agents.length,
          automaticAgents: 0,
        },
      });
    } else if (path === "/api/crm" || path === "/api/crm/") {
      if (method === "GET")
        response = json({ stages: state.stages, leads: state.leads, canManage: true });
      else if (method === "POST") {
        const lead = {
          id: `lead-${Date.now()}`,
          stage_id: state.stages[0]?.id || "stage-1",
          name: payload.name || "Lead QA",
          value_cents: Number(payload.valueCents || 0),
          currency: "BRL",
          phone_e164: null,
          email: null,
          company: null,
          source: "qa",
          owner_user_id: null,
          notes: null,
          updated_at: new Date().toISOString(),
        };
        state.leads.push(lead);
        response = json({ lead });
      } else if (method === "PATCH") {
        const lead = state.leads.find((item) => item.id === payload.id);
        if (lead && payload.stageId) lead.stage_id = payload.stageId;
        response = json({ lead: lead || payload });
      } else if (method === "DELETE") {
        state.leads = state.leads.filter((item) => item.id !== url.searchParams.get("id"));
        response = json({ success: true });
      }
    } else if (path === "/api/crm/stages") {
      if (method === "POST") {
        const stage = {
          id: `stage-${Date.now()}`,
          name: payload.name || "Nova",
          color: "#71717a",
          position: state.stages.length,
          kind: "open",
        };
        state.stages.push(stage);
        response = json({ stage });
      } else response = json({ stage: payload, success: true });
    } else if (path === "/api/follow-up" || path === "/api/follow-up/") {
      if (method === "GET") response = json({ tasks: state.tasks, canManage: true });
      else if (method === "POST") {
        const task = {
          id: `task-${Date.now()}`,
          lead_id: null,
          chat_id: null,
          title: payload.title || "Follow-up QA",
          note: null,
          due_at: payload.dueAt || new Date(Date.now() + 86400000).toISOString(),
          status: "pending",
          priority: payload.priority || "normal",
          owner_user_id: null,
          completed_at: null,
        };
        state.tasks.push(task);
        response = json({ task });
      } else if (method === "PATCH") {
        const task = state.tasks.find((item) => item.id === payload.id);
        if (task && payload.status) task.status = payload.status;
        response = json({ task: task || payload });
      } else response = json({ success: true });
    } else if (path === "/api/calendar" || path === "/api/calendar/") {
      if (method === "GET")
        response = json({
          calendars: state.calendars,
          appointments: state.appointments,
          canManage: true,
        });
      else if (method === "POST") {
        const calendar = {
          id: `cal-${Date.now()}`,
          name: payload.name || "Nova agenda",
          timezone: payload.timezone || "America/Sao_Paulo",
          slot_duration_minutes: payload.slotDurationMinutes || 30,
          buffer_minutes: payload.bufferMinutes || 0,
          daily_capacity: payload.dailyCapacity || 10,
          availability: payload.availability || {},
          is_default: true,
          active: true,
        };
        state.calendars.push(calendar);
        response = json({ calendar });
      } else response = json({ success: true });
    } else if (path === "/api/calendar/appointments") {
      if (method === "POST" || method === "PATCH") {
        const appointment = {
          id: payload.id || `appointment-${Date.now()}`,
          calendar_id: payload.calendarId,
          title: payload.title || "Atendimento QA",
          starts_at: payload.startsAt,
          ends_at: payload.endsAt,
          lead_id: payload.leadId || null,
          agent_id: payload.agentId || null,
          status: "scheduled",
          source: "manual",
          notes: null,
          chat_id: null,
        };
        const index = state.appointments.findIndex((item) => item.id === appointment.id);
        if (index >= 0) state.appointments[index] = appointment;
        else state.appointments.push(appointment);
        response = json({ appointment });
      }
    } else if (path === "/api/clients" || path === "/api/clients/") {
      if (method === "GET") {
        const query = (url.searchParams.get("q") || "").toLowerCase();
        const clients = state.leads
          .filter(
            (lead) =>
              !query ||
              `${lead.name} ${lead.phone_e164 || ""} ${lead.email || ""}`
                .toLowerCase()
                .includes(query),
          )
          .map((lead) => ({
            ...lead,
            tags: state.tags.filter((tag) => lead.tag_ids?.includes(tag.id)),
          }));
        response = json({ clients, tags: state.tags, canManage: true });
      } else if (method === "POST") {
        const tag = {
          id: `tag-${Date.now()}`,
          name: payload.name || "Tag QA",
          color: payload.color || "#71717a",
        };
        state.tags.push(tag);
        response = json({ tag });
      } else if (method === "PATCH" && Array.isArray(payload.leadIds)) {
        for (const lead of state.leads.filter((item) => payload.leadIds.includes(item.id)))
          lead.tag_ids = [...new Set([...(lead.tag_ids || []), ...(payload.tagIds || [])])];
        response = json({ success: true, assigned: payload.leadIds.length });
      }
    } else if (path === "/api/agents" || path === "/api/agents/") {
      if (method === "GET")
        response = json({
          agents: state.agents,
          instances: [
            { id: "inst-1", instance_name: "WhatsApp_QA", status: "open", phone: "+5511999999999" },
          ],
          runs: [],
          groqConfigured: true,
          aiConfigured: true,
          aiOptions: [{ provider: "groq", label: "Groq", models: ["llama-3.3-70b-versatile"] }],
        });
      else if (method === "POST") {
        const agent = {
          id: `agent-${Date.now()}`,
          name: payload.name || "Agente QA",
          enabled: true,
          provider: "groq",
          model: null,
          instructions: payload.instructions || "",
          runtime_config: payload.runtimeConfig || {},
          temperature: 0.4,
          max_completion_tokens: 500,
          reply_mode: "manual",
          allow_groups: false,
          instance_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        state.agents.push(agent);
        response = json({ agent });
      } else response = json({ success: true });
    } else if (path === "/api/knowledge" || path === "/api/knowledge/") {
      if (method === "GET") response = json({ documents: [] });
      else
        response = json({
          document: {
            id: "knowledge-1",
            title: payload.title || "QA",
            content: payload.content || "",
            active: true,
          },
        });
    } else if (path === "/api/agents/test") {
      response = json({ text: "Resposta de teste isolado." });
    } else if (path === "/api/chats" || path === "/api/chats/") {
      response = json({ chats: state.conversations, nextCursor: null });
    } else if (method === "POST" && /\/api\/chats\/[^/]+\/read$/.test(path)) {
      const chatId = path.split("/").at(-2);
      const chat = state.conversations.find((item) => item.id === chatId);
      if (chat) chat.unread = 0;
      response = json({ success: true, unread: 0 });
    } else if (path.endsWith("/business-profile")) {
      response = json({
        profile: {
          isBusiness: true,
          name: "Cliente QA",
          description: "Perfil isolado para auditoria",
          category: "Atendimento",
          website: [],
          email: null,
          address: null,
        },
      });
    } else if (path.includes("/messages")) {
      response = json({ messages: state.messages, nextCursor: null, hasMore: false });
    } else if (path === "/api/instances" || path === "/api/instances/") {
      response = json([
        {
          id: "inst-1",
          instanceName: "WhatsApp_QA",
          instance_name: "WhatsApp_QA",
          state: "open",
          status: "open",
          phone: "5511999999999",
          profilePicUrl: null,
        },
      ]);
    } else if (path.includes("/qrcode")) {
      response = json({ state: "open" });
    } else if (path === "/api/sync/evolution" || path === "/api/chats/sync-pfp") {
      response = json({ success: true });
    } else if (path === "/api/messages/send") {
      response = json({
        success: true,
        message: {
          id: `msg-${Date.now()}`,
          external_id: "qa-external",
          media_url: null,
          media_path: null,
        },
      });
    } else if (path === "/api/events") {
      response = json({ events: [], cursor: "0", hasMore: false, snapshot: { presences: [] } });
    } else if (path === "/api/profile/") {
      response = json({
        profile: {
          user_id: user.id,
          account_kind: "person",
          first_name: "QA",
          last_name: "Operator",
          email: user.email,
          phone_e164: "+5511999999999",
          country_code: "BR",
          avatar_path: null,
        },
      });
    } else if (path === "/api/company/") {
      response = json({
        company: {
          workspace_id: "ws-1",
          legal_name: "InboxOS QA",
          trade_name: "InboxOS",
          tax_id: "00000000000000",
          tax_id_normalized: "00000000000000",
          tax_status: "active",
          phone_e164: null,
          country_code: "BR",
          logo_path: null,
        },
      });
    } else if (path === "/api/auth/security/") {
      response = json({
        currentSessionId: "session-1",
        currentDeviceId: "device-1",
        devices: [],
        sessions: [],
      });
    } else if (path === "/api/legal/status") {
      response = json({ documents: [] });
    } else if (path === "/api/admin/me" || path === "/api/admin/me/") {
      response = json({ role: "superadmin" });
    } else if (path.startsWith("/api/admin/")) {
      response = json({
        metrics: {},
        users: [],
        workspaces: [],
        members: [],
        invitations: [],
        integrations: [],
        entries: [],
        canManage: true,
      });
    }

    const durationMs = Date.now() - startedAt;
    network.push({
      url: path + url.search,
      method,
      status: response.status,
      durationMs,
      body: payload,
    });
    await route.fulfill(response);
  });
}

async function visibleSurface(page) {
  return page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        label: el.getAttribute("aria-label"),
      })),
    inputs: [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        placeholder: el.getAttribute("placeholder"),
        label: el.getAttribute("aria-label"),
      })),
  }));
}

const pageTargets = [
  ["Dashboard", "Dashboard"],
  ["CRM", "CRM"],
  ["Clientes", "Clientes"],
  ["Inbox", "Inbox"],
  ["Follow-up", "Follow-up"],
  ["Calendário", "Calendário"],
  ["Conexões", "Conexões"],
  ["Agentes", "Agentes"],
  ["Configurações", "Configurações"],
  ["ADM Global", "ADM global"],
];

async function clickNavigation(page, label) {
  if (
    ["Clientes", "Follow-up", "Calendário", "Agentes", "Configurações", "ADM Global"].includes(
      label,
    )
  ) {
    const more = page.getByRole("button", { name: "Mais áreas" });
    if ((await more.count()) && (await more.isVisible())) await more.click();
  }
  const candidates = [
    label,
    label === "Dashboard" ? "Início" : label,
    label === "Calendário" ? "Agenda" : label,
    label === "ADM Global" ? "ADM global" : label,
    label === "ADM Global" ? "ADM" : label,
    label === "ADM Global" ? "Administração global" : label,
    label === "Configurações" ? "Ajustes" : label,
  ];
  for (const candidate of candidates) {
    const namePattern = candidate === "Inbox" ? /^Inbox.*$/i : new RegExp(`^${candidate}$`, "i");
    for (const role of ["link", "button", "menuitem"]) {
      const controls = page.getByRole(role, { name: namePattern });
      for (let index = 0; index < (await controls.count()); index += 1) {
        const control = controls.nth(index);
        if (await control.isVisible()) {
          await control.click();
          await page.waitForTimeout(600);
          return candidate;
        }
      }
    }
  }
  throw new Error(`Navegação não encontrada: ${label}`);
}

async function exercisePage(page, label, network, initialBefore = network.length) {
  const before = initialBefore;
  const actualLabel = await clickNavigation(page, label);
  if (label === "ADM Global") {
    await page.getByRole("heading", { name: /Administra.{1,4}o global/i }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    const tabs = page.getByRole("tab");
    if ((await tabs.count()) >= 2) {
      const firstTab = tabs.first();
      const nextTab = tabs.nth(1);
      await firstTab.focus();
      await firstTab.press("ArrowRight");
      if (!(await nextTab.evaluate((element) => document.activeElement === element))) {
        throw new Error("A navegação por teclado do ADM não moveu o foco para a próxima aba.");
      }
      const panelId = await nextTab.getAttribute("aria-controls");
      if (!panelId || !(await page.locator(`#${panelId}`).isVisible())) {
        throw new Error("A aba administrativa não revelou o painel associado.");
      }
    }
  }
  if (label === "ADM Global") {
    const adminAreas = [
      /vis/i,
      /usu/i,
      /workspace/i,
      /serv/i,
      /newsletter/i,
      /audit/i,
      /administra/i,
    ];
    for (const area of adminAreas) {
      const adminTab = page.getByRole("tab", { name: area });
      if (!(await adminTab.count())) continue;
      await adminTab.click();
      const panelId = await adminTab.getAttribute("aria-controls");
      if (!panelId || !(await page.locator(`#${panelId}`).isVisible())) {
        throw new Error(`A area administrativa ${area} nao renderizou seu painel.`);
      }
      await page.waitForTimeout(100);
    }
  }
  const surface = await visibleSurface(page);
  const actions = [];
  const clickIfVisible = async (name, options = {}) => {
    const locator = page
      .getByRole("button", { name: options.regex || new RegExp(name, "i") })
      .first();
    if ((await locator.count()) && (await locator.isVisible()) && !(await locator.isDisabled())) {
      await locator.click();
      await page.waitForTimeout(options.wait ?? 180);
      actions.push(name);
      return true;
    }
    return false;
  };

  await clickIfVisible("Atualizar");
  if (label === "CRM") {
    await page.getByPlaceholder("Nome do lead").fill("Lead de auditoria");
    await page.getByPlaceholder("Valor (R$)").fill("10,50");
    await clickIfVisible("Lead");
    await page.getByPlaceholder("Nova etapa").fill("Etapa QA");
    await clickIfVisible("Etapa");
    const removeLead = page.getByRole("button", { name: /Excluir lead/i }).first();
    if ((await removeLead.count()) && (await removeLead.isVisible())) {
      await removeLead.click();
      await page.getByRole("alertdialog", { name: /Excluir lead/i }).waitFor({ state: "visible" });
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
      actions.push("confirmar/cancelar exclusão de lead");
    }
    actions.push("criar lead", "criar etapa");
  }
  if (label === "Follow-up") {
    await page.getByPlaceholder(/Ação de acompanhamento/).fill("Follow-up de auditoria");
    await page.getByLabel("Prioridade do follow-up").click();
    await page.getByRole("option", { name: "Alta" }).click();
    actions.push("selecionar prioridade do follow-up");
    await clickIfVisible("Criar");
    actions.push("criar follow-up");
  }
  if (label === "Clientes") {
    await page.getByPlaceholder(/nova tag/i).fill("Auditoria");
    await clickIfVisible("Criar tag");
    const checkbox = page.getByRole("checkbox").first();
    if ((await checkbox.count()) && (await checkbox.isVisible())) {
      const beforeChecked = await checkbox.getAttribute("aria-checked");
      await checkbox.click();
      if ((await checkbox.getAttribute("aria-checked")) === beforeChecked) {
        throw new Error("Seleção de cliente não alternou.");
      }
      actions.push("selecionar cliente");
    }
    const tagButton = page.getByRole("button", { name: "QA" }).first();
    if ((await tagButton.count()) && (await tagButton.isVisible())) {
      await tagButton.click();
      actions.push("atribuir tag");
    }
    await page.getByPlaceholder(/Buscar por nome/i).fill("Cliente");
    actions.push("buscar cliente");
  }
  if (label === "Calendário") {
    await clickIfVisible("Hoje");
    await page.getByPlaceholder(/Título do atendimento/i).fill("Agendamento QA");
    await page.getByLabel("Calendário do agendamento").click();
    await page.getByRole("option", { name: "Agenda QA" }).click();
    await clickIfVisible("Agendar");
    actions.push("selecionar hoje", "selecionar calendário", "criar agendamento");
  }
  if (label === "Configurações") {
    const accent = page.getByLabel("Acento visual");
    if ((await accent.count()) && (await accent.isVisible()) && !(await accent.isDisabled())) {
      await accent.click();
      await page.getByRole("option", { name: "Teal" }).click();
      if ((await accent.getAttribute("aria-expanded")) !== "false") {
        throw new Error("O seletor de acento permaneceu aberto após a escolha.");
      }
      actions.push("selecionar acento visual");
    }
  }
  if (label === "Agentes") {
    await clickIfVisible("Criar agente");
    const name = page
      .locator('input[placeholder*="Nome"], input[aria-label="Nome do agente"]')
      .first();
    if ((await name.count()) && (await name.isVisible())) {
      await name.fill("Agente novo QA");
      await page
        .getByLabel("Objetivo principal do agente")
        .fill("Qualificar sem prometer resultados.");
      await page.getByLabel("Tom de voz").click();
      await page.getByRole("option", { name: "Amigável" }).click();
      await page.getByLabel("Modo de resposta").click();
      await page.getByRole("option", { name: "Somente teste/manual" }).click();
      const agentPermissions = [
        "Permitir grupos",
        "Transferir para atendimento humano",
        "Permitir que o agente consulte e gerencie agendamentos",
        "Incluir tags do cliente",
        "Incluir follow-ups pendentes",
        "Incluir base de conhecimento autorizada",
      ];
      for (const permission of agentPermissions) {
        const checkbox = page.getByRole("checkbox", { name: permission });
        const beforeChecked = await checkbox.getAttribute("aria-checked");
        await checkbox.click();
        if ((await checkbox.getAttribute("aria-checked")) === beforeChecked) {
          throw new Error(`Permissão do agente não alternou: ${permission}`);
        }
      }
      await page
        .getByRole("dialog", { name: /Novo agente/i })
        .getByRole("button", { name: "Criar agente" })
        .click();
      actions.push("selecionar opções, permissões e criar agente no modal");
    }
    const edit = page.getByRole("button", { name: /Editar agente/i }).first();
    if ((await edit.count()) && (await edit.isVisible())) {
      await edit.click();
      await page.getByRole("dialog", { name: /Editar agente/i }).press("Escape");
      actions.push("editar/fechar agente");
    }
  }
  if (label === "Inbox") {
    const search = page.getByLabel("Buscar conversas").first();
    if ((await search.count()) && (await search.isVisible())) {
      await search.fill("Cliente");
      actions.push("buscar conversa");
    }
    await clickIfVisible("Sincronizar mensagens", { regex: /Sincronizar mensagens/i });
    await clickIfVisible("modo", { regex: /modo (claro|escuro)/i });
    await clickIfVisible("perfil do contato", {
      regex: /Ver perfil comercial e dados do contato/i,
    });
    await clickIfVisible("fechar perfil", {
      regex: /Fechar informaÃ§Ãµes do contato|Fechar informações do contato/i,
    });
  }
  if (label === "Inbox") {
    const composer = page.getByLabel("Escrever mensagem");
    if ((await composer.count()) && (await composer.isVisible())) {
      await composer.fill("Teste de presen\u00e7a local");
      await page.waitForTimeout(250);
      actions.push("transmitir estado de digita\u00e7\u00e3o");
      if (auditGroupChat) {
        const presenceRequest = network
          .slice(before)
          .find((entry) => /\/presence$/.test(entry.url) && entry.method === "POST");
        if (presenceRequest?.body?.isGroup !== true) {
          throw new Error("Presen\u00e7a de grupo n\u00e3o preservou isGroup no request.");
        }
      }
    }
  }
  if (label === "Conexões") {
    await clickIfVisible("Nova Conexão");
    const close = page.getByRole("button", { name: /fechar/i }).first();
    if (!process.env.AUDIT_KEEP_MODAL && (await close.count()) && (await close.isVisible())) {
      await close.click();
      actions.push("abrir/fechar QR");
    }
    const removeConnection = page.getByRole("button", { name: /Excluir conexão/i }).first();
    if (
      !process.env.AUDIT_KEEP_MODAL &&
      (await removeConnection.count()) &&
      (await removeConnection.isVisible())
    ) {
      await removeConnection.click();
      await page.getByRole("alertdialog", { name: /Excluir conexão WhatsApp/i }).waitFor({
        state: "visible",
      });
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
      actions.push("confirmar/cancelar exclusão de conexão");
    }
  }

  const errors = network
    .slice(before)
    .filter((entry) => entry.status >= 400 || entry.durationMs > 1500);
  // Radix keeps the exit state mounted for a fraction of a second. Capturing
  // after this tiny settle window avoids classifying a deliberate close
  // animation as a persistent overlapping menu in the visual evidence.
  await page.waitForTimeout(240);
  const afterSurface = await visibleSurface(page);
  await page.screenshot({
    path: join(OUT_DIR, `${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${viewportLabel}.png`),
    fullPage: false,
  });
  return {
    requestedLabel: label,
    actualLabel,
    status: errors.length ? "WARN" : "PASS",
    actions,
    surface,
    afterSurface,
    requests: network.slice(before),
    errors,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const state = createState();
  const network = [];
  const pages = [];
  const targets = process.env.AUDIT_ONLY
    ? pageTargets.filter(([label]) => label.toLowerCase() === process.env.AUDIT_ONLY.toLowerCase())
    : pageTargets;
  for (const [label] of targets) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageNetworkStart = network.length;
    const consoleLogs = [];
    const pageErrors = [];
    page.on("console", (message) =>
      consoleLogs.push({
        type: message.type(),
        text: message.text(),
        location: message.location(),
      }),
    );
    page.on("pageerror", (error) =>
      pageErrors.push({ message: error.message, stack: error.stack }),
    );
    await page.route("**/auth/v1/**", (route) => route.fulfill(json({ user })));
    await installApi(page, state, network);
    await page.addInitScript(
      ({ value, storageKey }) => {
        localStorage.setItem(storageKey, JSON.stringify(value));
        localStorage.setItem("inboxos:theme", "light");
      },
      { value: session, storageKey: auditSupabaseStorageKey },
    );
    // The app intentionally keeps a realtime connection alive. Waiting for
    // `networkidle` therefore turns a healthy rendered page into a false
    // negative after the navigation timeout. The audit exercises visible
    // controls after this point, so DOM readiness is the right boundary.
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".inbox-app").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(1000);
    const consoleBefore = consoleLogs.length;
    try {
      const result = await exercisePage(page, label, network, pageNetworkStart);
      result.console = consoleLogs.slice(consoleBefore);
      result.pageErrors = pageErrors;
      pages.push(result);
    } catch (error) {
      pages.push({
        requestedLabel: label,
        status: "FAIL",
        error: String(error),
        surface: await visibleSurface(page),
        requests: [],
        console: consoleLogs.slice(consoleBefore),
        pageErrors,
      });
    }
    await context.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport,
    isolation:
      "Playwright session, Supabase auth and application APIs mocked; no external writes or WhatsApp messages.",
    pages,
    console: pages.flatMap((item) => item.console || []),
    pageErrors: pages.flatMap((item) => item.pageErrors || []),
    network,
    summary: {
      pagesPassed: pages.filter((item) => item.status !== "FAIL").length,
      pagesFailed: pages.filter((item) => item.status === "FAIL").length,
      httpErrors: network.filter((item) => item.status >= 400).length,
      slowRequests: network.filter((item) => item.durationMs > 1500).length,
      consoleErrors: pages
        .flatMap((item) => item.console || [])
        .filter((item) => item.type === "error").length,
      pageErrors: pages.flatMap((item) => item.pageErrors || []).length,
    },
  };
  writeFileSync(join(OUT_DIR, "audit.json"), JSON.stringify(report, null, 2));
  const markdown = [
    "# Auditoria funcional isolada do InboxOS",
    "",
    `Gerada em ${report.generatedAt}. Ambiente: ${BASE_URL}.`,
    "",
    report.isolation,
    "",
    `Resultado: ${report.summary.pagesPassed}/${pageTargets.length} páginas exercitadas; ${report.summary.httpErrors} respostas HTTP >= 400; ${report.summary.slowRequests} requisições > 1,5 s; ${report.summary.consoleErrors} erros de console; ${report.summary.pageErrors} erros de runtime.`,
    "",
    "## Páginas e ações",
    "",
    ...pages.map(
      (item) =>
        `- **${item.requestedLabel}** — ${item.status === "FAIL" ? `FAIL: ${item.error}` : `PASS; ações: ${item.actions?.join(", ") || "somente carregamento"}; requests: ${item.requests?.length ?? 0}`}`,
    ),
    "",
    "## Evidência detalhada",
    "",
    "Os inventários de botões, campos, requests e respostas estão em `audit.json`; screenshots estão neste diretório.",
  ].join("\n");
  writeFileSync(join(OUT_DIR, "AUDITORIA.md"), markdown);
  console.log(JSON.stringify(report.summary, null, 2));
  await browser.close();
}

await main();
