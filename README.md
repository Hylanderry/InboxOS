# InboxOS

Plataforma SaaS multi-tenant para atendimento e vendas por WhatsApp — construída com TanStack Start, React, Supabase e Evolution API.

## Visão geral

InboxOS centraliza conversas de WhatsApp, CRM, follow-up, agentes de IA e calendário em um único painel premium. Projetado para times de atendimento e vendas que precisam de escala sem perder a qualidade.

## Stack

- **Frontend:** React + TanStack Router/Start + Tailwind CSS + shadcn/ui
- **Backend:** TanStack Start (server functions) + Supabase (PostgreSQL + Auth + Realtime)
- **WhatsApp:** Evolution API v2
- **IA:** Groq
- **E-mail transacional:** Resend
- **Deploy:** Vercel

## Requisitos

- Node.js 20+
- Conta Supabase (projeto configurado)
- Instância Evolution API v2
- Chaves de API do Groq e Resend

## Instalação local

```bash
# Clonar repositório
git clone <repo-url>
cd inbox-os

# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com suas chaves reais

# Rodar em desenvolvimento
npm run dev
```

## Scripts disponíveis

| Comando           | Descrição                              |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Servidor de desenvolvimento            |
| `npm run build`   | Build de produção                      |
| `npm run lint`    | Verificação de lint                    |
| `npm test`        | Suíte de testes (`node --test`)        |

## Variáveis de ambiente

Todas as variáveis necessárias estão documentadas em [`.env.example`](./.env.example). Nunca commite arquivos `.env` com valores reais.

## Licença

**Todos os direitos reservados.** Este software é proprietário e confidencial.

Consulte o arquivo [LICENSE](./LICENSE) para os termos completos. Uso, cópia, modificação, distribuição ou engenharia reversa sem autorização expressa por escrito são estritamente proibidos.

## Apoie o projeto

Se este projeto foi útil para você, considere fazer uma doação:

☕ [Contribuir via Botapix](https://botapix.com/s/hylander)

Cada contribuição ajuda a manter o desenvolvimento ativo. Obrigado!

---

© 2024–2026 InboxOS. Todos os direitos reservados.