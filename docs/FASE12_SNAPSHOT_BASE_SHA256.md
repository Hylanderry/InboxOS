# Fase 12: baseline e rollback do código

- Fonte imutável: `inboxos-fase11-correcoes-offline-2026-10-11.zip`
- SHA256: `aa64996f9c7ff2957e31e0006f4e146ed7b46de4537f3d8bb064ba191ecd7f3d`
- Inspeção ZIP: 439 entradas e `testzip() == None`
- Snapshot isolado de desenvolvimento: extraído em `/mnt/data/inboxos_phase12_work/inboxos-evolution-final-audit`
- Histórico `.git`: ausente na origem (logo, não é lícito inventar commit nem branch)
- G0-02: **PASS pelo método de snapshot**, com HASH verificado. Registro de branch remoto: PENDENTE se o fluxo exigir Git.
- Rollback de código: reextrair **somente** o ZIP Fase 11 para uma pasta nova. NÃO é rollback do schema/banco.
- Escopo desta fase: offline; sem Netlify, Evolution ou Supabase real.
