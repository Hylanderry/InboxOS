# Auditoria funcional isolada do InboxOS

Gerada em 2026-10-23T09:11:49.588Z. Ambiente: http://127.0.0.1:4173.

Playwright session, Supabase auth and application APIs mocked; no external writes or WhatsApp messages.

Resultado: 1/10 páginas exercitadas; 0 respostas HTTP >= 400; 0 requisições > 1,5 s; 0 erros de console; 0 erros de runtime.

## Páginas e ações

- **Conexões** — PASS; ações: Atualizar, Nova Conexão, abrir/fechar QR, confirmar/cancelar exclusão de conexão; requests: 16

## Evidência detalhada

Os inventários de botões, campos, requests e respostas estão em `audit.json`; screenshots estão neste diretório.