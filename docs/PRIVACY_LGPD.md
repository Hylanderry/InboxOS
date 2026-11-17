# LGPD e privacidade no white-label

Este documento descreve controles técnicos do InboxOS. Ele não substitui uma
política de privacidade, um DPA ou aconselhamento jurídico. Cada operador deve
definir sua base legal, prazos de retenção, responsáveis e canal para titulares
antes de atender clientes reais.

## Fronteiras de dados

- Toda leitura e escrita de produto exige `workspace_id` autenticado.
- Dados do WhatsApp também exigem `instance_id`; o mesmo telefone ou grupo em
  duas instâncias nunca compartilha conversa, presença, mídia ou recibos.
- Instâncias desconectadas deixam de aparecer no produto e o ciclo de limpeza
  é limitado à instância afetada.
- O sincronizador não importa histórico anterior ao início da conexão.
- Buckets de conversas são privados; o navegador recebe apenas URLs assinadas
  e temporárias.

## Direitos e retenção

O painel de privacidade expõe exportação, correção e exclusão programada por
workspace. A fila de retenção é limitada, auditável e não retorna segredos,
tokens ou chaves de integração. O operador deve revisar a solicitação antes da
exclusão quando a legislação ou uma obrigação contratual exigir preservação.

Defina os prazos em `workspace_privacy_settings` e documente-os para cada
workspace. Não use retenção indefinida por conveniência operacional.

## IA e provedores

- A IA começa desativada quando a política de privacidade do workspace não está
  disponível.
- O prompt remove identificadores diretos e limita histórico, follow-ups,
  clientes, agenda e base de conhecimento ao contexto autorizado.
- O handoff humano suspende respostas automáticas até resolução.
- Chaves Groq, Resend, Evolution e Supabase service-role ficam somente no
  servidor; nunca use prefixo `VITE_` para segredos.

## Auditoria mínima antes de produção

1. Aplicar migrations em um Supabase de staging isolado.
2. Testar dois usuários, dois workspaces e duas instâncias com tentativas IDOR.
3. Confirmar RLS, políticas de Storage, logs sem PII e limites de rate.
4. Validar exportação, correção, exclusão, revogação de sessão e consentimento.
5. Definir política de incidentes, subcontratados, suporte e atendimento ao
   titular.

O projeto fornece controles e testes; a conformidade final depende da
configuração, dos contratos e da operação de cada fork.
