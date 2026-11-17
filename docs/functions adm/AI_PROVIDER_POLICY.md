# Política de provedores e modelos de IA

## O que já está implementado

- Somente System Admin acessa as integrações e os segredos de Groq e OpenRouter.
- Segredos ficam cifrados no cofre server-side; a interface recebe apenas metadados e modelos liberados.
- O catálogo por provedor usa `system_integrations.config.allowed_models`.
- Um agente só pode ser salvo com provedor/modelo presente nesse catálogo.
- Antes de cada resposta automática ou teste, o runtime revalida o modelo. Remover um modelo no ADM interrompe novos usos dele imediatamente.
- A chave de cache da resposta inclui agente, provedor e modelo, para que uma mudança de modelo não reutilize resposta recente de outro modelo.
- Groq continua disponível como provedor controlado para testes internos; OpenRouter só aparece ao workspace quando está habilitado, possui segredo e contém uma allowlist explícita.

## Configuração no ADM

No registro da integração use uma configuração JSON como:

```json
{
  "allowed_models": ["provider/modelo-1", "provider/modelo-2"]
}
```

Para Groq, a lista é opcional e o fallback controlado pelo ambiente só é usado quando o provedor está configurado. Para OpenRouter, uma lista explícita é obrigatória: nenhum modelo é exposto ou aceito por padrão.

## Setores: situação real e próximo passo

Hoje a allowlist é global por provedor. Ainda **não existe** uma coluna de setor vinculada a `automation_agents`, portanto não é correto afirmar que modelos já são atribuídos por setor.

Para implementar sem abrir uma brecha de autorização, a próxima migration deve criar uma política por workspace/área com:

- setor canônico (`atendimento`, `suporte`, `vendas`, `sucesso_cliente`, por exemplo);
- provedor e modelo aprovados pelo System Admin;
- data de revisão, responsável e estado ativo;
- restrição única por workspace + setor;
- RLS somente service-role e rotas administrativas auditadas.

O backend deve resolver essa política antes de salvar e antes de rodar o agente; a UI de workspace pode apenas escolher entre opções devolvidas pelo servidor. Não usar cargo, texto livre ou valor enviado pelo navegador como autorização.

## Invariantes

1. Nenhuma API key pode chegar ao browser, a logs ou a prompts.
2. Desabilitar um provedor ou remover um modelo deve falhar fechado.
3. Respostas automáticas exigem política de privacidade ativa e redação de PII quando configurada.
4. Qualquer mudança de integração, catálogo ou setor deve produzir evento de auditoria.
5. Antes de produção: validar em staging com dois workspaces e catálogos diferentes.
