---
trigger: always_on
description: "Regras de consistência visual e acessibilidade do InboxOS para qualquer alteração em telas, componentes, layouts ou CSS."
---
# Padrão UI/UX InboxOS (regra de workspace)
- Use e siga a skill `.agents/skills/inboxos-premium-uiux/SKILL.md` ao alterar `src/styles.css`, `src/components/`, `src/features/` ou rotas de autenticação.
- Preserve o produto multi-tenant, comportamento dos formulários, identidade visual Trax (neutros premium, vidro sutil, contraste adequado), icones Phosphor e conteúdo em português BR.
- Não alterar APIs, auth, RLS, banco, cookies, Evolution, billing ou contratos do backend por uma demanda puramente visual.
- Toda alteração deve ter objetivo, mudança mínima, potencial regressão, evidência local e teste de interação (mouse/teclado/touch).
- Não declarar UI/UX '100% validada' sem screenshots reais no navegador nas larguras da skill e sem inspeção de console/network.
- Não adicionar uma segunda família de ícones nem cores saturadas novas. Não esconder erros de formulário, indicadores de carregamento ou ações indisponíveis.
- Se build/dependências estiverem bloqueados: executar as verificações offline e registrar `BLOCKED` para QA visual. Não forjar evidências.


### F16 — Invariantes adicionais
- Citações e mensagens não podem vazar entre chats se um request terminar depois da navegação.
- Estado de histórico com erro nunca deve ser apresentado como conversa vazia.
- Preservar preferência de tema no StrictMode sem sobrescrever a leitura inicial.
- Menus precisam de saída via Escape e clique fora; nunca `onMouseLeave` como única forma de fechar.
- Modal de perfil comercial também exige gerenciamento de foco e teclado.
- Evitar CSS global destrutivo; mudanças de 44px só nos alvos declarados.
- Em telas ADM e Settings, auditar contrastes nos dois temas e rótulos de inputs, sem expor segredos.
