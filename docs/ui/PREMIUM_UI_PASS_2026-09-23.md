# Premium UI Pass — 2026-09-23

## Objetivo

Elevar o frontend do Inbox de um painel visualmente próximo ao WhatsApp para uma plataforma premium neutra, preparada para crescer para CRM, follow-up e agentes sem criar módulos fictícios.

## Mudanças aplicadas

- Tema escuro como apresentação padrão, com superfícies neutras e menor dependência de verde.
- Sidebar definitiva do produto:
  - HOME: Dashboard, CRM
  - GESTÃO: Inbox, Follow-up, Conexões
  - AUTOMAÇÕES: Agentes
  - Rodapé: Configurações e Sair
- Inbox e Conexões permanecem funcionais.
- Dashboard, CRM, Follow-up, Agentes e Configurações usam placeholders honestos, sem dados falsos ou chamadas de API.
- Branding provisório `Ackley Inbox` / `WhatsApp Inbox OS` removido das superfícies principais e metadata.
- Idioma raiz alterado para `pt-BR`; estados de erro principais traduzidos.
- Identidade visual da conversa neutralizada:
  - removido o doodle do WhatsApp;
  - removidos bubbles verde `#005c4b` / `#d9fdd3`;
  - bubbles convertidos para superfícies neutras;
  - verde reservado a estados semânticos do WhatsApp, conexão e presença.
- Seleção de conversas, filtros, navegação e ações gerais convertidas para contraste neutro.
- Botão principal de envio e ações de importação/exportação convertidos para CTA monocromático premium.
- Conexões mantêm verde apenas para status do WhatsApp e elementos diretamente ligados ao canal.
- Raios e efeitos reduzidos em várias superfícies para diminuir aparência de template SaaS.
- Foco visual global deixou de usar verde decorativo.

## Contrato de produto

As áreas ainda não implementadas não devem:

- exibir métricas inventadas;
- chamar endpoints inexistentes;
- simular IA ou CRM;
- criar estado persistente.

Elas apenas reservam a arquitetura visual futura.

## Verificação

A verificação deve incluir:

- testes unitários e recovery;
- ESLint nos arquivos alterados;
- `git diff --check`;
- TypeScript, separando erros novos de problemas de baseline do ZIP;
- tentativa de build para registrar qualquer bloqueio de plataforma do `node_modules` original.
