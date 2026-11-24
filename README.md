<div align="center">

# 📬 InboxOS

### Plataforma SaaS Multi-Tenant para Atendimento e Vendas por WhatsApp

<p align="center">
  <img src="https://img.shields.io/badge/license-Proprietary-red.svg" alt="License" />
  <img src="https://img.shields.io/badge/stack-TanStack%20Start-blue.svg" alt="Stack" />
  <img src="https://img.shields.io/badge/database-Supabase-3ECF8E.svg" alt="Database" />
  <img src="https://img.shields.io/badge/deploy-Vercel-black.svg" alt="Deploy" />
  <img src="https://img.shields.io/badge/whatsapp-Evolution%20API%20v2-25D366.svg" alt="WhatsApp" />
</p>

<p align="center">
  <a href="#visão-geral">Visão Geral</a> •
  <a href="#arquitetura">Arquitetura</a> •
  <a href="#instalação-local">Instalação</a> •
  <a href="#licença">Licença</a> •
  <a href="https://botapix.com/s/hylander">☕ Apoiar</a>
</p>

</div>

---

## Visão Geral

InboxOS é uma plataforma SaaS premium que centraliza conversas de WhatsApp, CRM inteligente, follow-up automatizado, agentes de IA e calendário em um único painel multi-tenant. Projetado para times de atendimento e vendas que precisam de escala sem perder a qualidade do relacionamento com o cliente.

### ✨ Destaques

- **Chat Unificado** — Conversas de múltiplas instâncias WhatsApp em uma única interface responsiva
- **CRM com Kanban** — Gestão visual de leads com drag-and-drop e etapas personalizáveis
- **Agentes de IA** — Templates configuráveis para vendas, suporte e agendamento via Groq
- **Dashboard Analítico** — KPIs em tempo real com filtros inteligentes (7d, 10d, 30d, 90d, custom)
- **Calendário Integrado** — Agendamentos sincronizados com WhatsApp e lembretes automáticos
- **Segurança Enterprise** — RLS multi-tenant, rate limiting, HMAC-SHA256, device verification
- **UI Premium** — Design system próprio com glassmorphism sutil, animações GPU-accelerated e tema claro/escuro

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   Vercel Edge                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ TanStack    │  │ Server       │  │ Nitro      │ │
│  │ Router      │  │ Functions    │  │ Preset     │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┘ │
│         │                │                          │
│  ┌──────▼────────────────▼──────────────────────┐   │
│  │           React + Tailwind + shadcn/ui        │   │
│  │     Design System: ux-* tokens + Phosphor     │   │
│  └──────────────────┬───────────────────────────┘   │
└─────────────────────┼───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────▼────┐  ┌─────▼─────┐ ┌────▼─────┐
   │Supabase │  │Evolution  │ │ Resend   │
   │Postgres │  │API v2     │ │ Email    │
   │+ Auth   │  │WhatsApp   │ │ Transac. │
   │+ RLS    │  │Multi-inst │ │          │
   └─────────┘  └───────────┘ └──────────┘
```

### Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19 + TanStack Router/Start + Tailwind CSS v4 + shadcn/ui |
| **Backend** | TanStack Start Server Functions + Nitro |
| **Database** | Supabase PostgreSQL + Row Level Security + Realtime |
| **WhatsApp** | Evolution API v2 (multi-instância) |
| **IA** | Groq (LLM inference) |
| **E-mail** | Resend (transacional) |
| **Deploy** | Vercel (Edge + Serverless) |
| **Tipografia** | Inter + Plus Jakarta Sans (Google Fonts) |
| **Ícones** | Phosphor Icons |

## Instalação Local

### Pré-requisitos

- Node.js 20+
- Conta [Supabase](https://supabase.com) (projeto configurado)
- Instância [Evolution API v2](https://doc.evolution-api.com/)
- Chaves de API: [Groq](https://console.groq.com/) e [Resend](https://resend.com/)

### Setup

```bash
# Clonar repositório
git clone https://github.com/hylanderry/inbox-os.git
cd inbox-os

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# ✏️ Editar .env com suas chaves reais (veja .env.example para referência)

# Iniciar servidor de desenvolvimento
npm run dev
```

O app estará disponível em `http://localhost:3000`.

### Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build de produção otimizado |
| `npm run lint` | Verificação de lint (ESLint) |
| `npm test` | Suíte de testes (`node --test`) |
| `npx tsc --noEmit` | Type-check TypeScript |

## Variáveis de Ambiente

Todas as variáveis necessárias estão documentadas em [`.env.example`](./.env.example).

> ⚠️ **Nunca commite arquivos `.env` com valores reais.** O `.gitignore` já exclui todos os `.env*` exceto `.env.example`.

### Variáveis Críticas

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `AUTH_CRYPTO_SECRET` | Secret mínimo 32 chars para HMAC |
| `EXPECTED_SUPABASE_PROJECT_REF` | Ref de produção (guardrail de deploy) |

## Segurança

Este projeto implementa múltiplas camadas de proteção:

- **RLS Multi-Tenant** — Isolamento completo de dados entre workspaces no PostgreSQL
- **Rate Limiting** — `consume_auth_rate_limit` RPC em todos os endpoints de mutação
- **HMAC-SHA256** — Hashing de tokens/códigos com separação de propósito
- **Device Verification** — Challenge OTP para novos dispositivos
- **Anti-RE Build** — Filenames hashed, console/debugger removidos em produção, minificação agressiva
- **Origin Validation** — `mutationOriginAllowed()` em todos os endpoints sensíveis
- **Password History** — Bloqueio de reutilização das 3 últimas senhas

Para reportar vulnerabilidades, consulte [SECURITY.md](./SECURITY.md).

## Licença

**Todos os direitos reservados © 2024–2026 Hylander / InboxOS.**

Este software é **proprietário e confidencial**. Uso, cópia, modificação, distribuição ou engenharia reversa sem autorização expressa por escrito são estritamente proibidos. Consulte [LICENSE](./LICENSE) para os termos completos.

## Apoie o Projeto

Se este projeto foi útil para você, considere fazer uma doação:

<p align="center">
  <a href="https://botapix.com/s/hylander">
    <img src="https://img.shields.io/badge/☕_Doar-Botapix-FF813F?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Doar via Botapix" height="40" />
  </a>
</p>

<p align="center">Cada contribuição ajuda a manter o desenvolvimento ativo. Obrigado! 💚</p>

---

<div align="center">
  <sub>Construído com ❤️ por <a href="https://github.com/hylanderry">@hylanderry</a></sub>
  <br/>
  <sub>© 2024–2026 InboxOS. Todos os direitos reservados.</sub>
</div>