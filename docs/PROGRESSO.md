# Progresso

## Status atual

- **Fase:** 0 (fundação e motor, sem servidor), ainda não iniciada.
- **Feito:** kit montado a partir do PDF do SPEC (ver Histórico).
- **Próximo passo:** `/fase 0`. Plano da Fase 0 apresentado e aguardando aprovação.
- **Comandos de teste:** ainda não existem (o projeto Vite nasce na Fase 0).

## Portões

| Fase | Portão | Status |
|---|---|---|
| 0 | Testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e revisão do `revisor-motor` sem divergências abertas | Pendente |
| 1 | Revisão do Alex com a família de exemplo; tela inicial em 375 px e no tema escuro | Pendente |
| 2 | Teste de vazamento entre famílias; uma família real anonimizada importada e conciliada; textos aprovados por compliance; pentest | Pendente |
| 3 | Piloto com 3 a 5 famílias do Alex | Pendente |

## Pendências do kit

O `gemeo-financeiro.zip` não veio, só o PDF. Itens do kit que não puderam ser reconstruídos:

- `reference/gemeo.html` (protótipo de layout): ausente. Necessário na Fase 1.
- `reference/motor_referencia.py` (motor de referência em Python): ausente. Os números de aceite estão no SPEC e em `reference/resultados_referencia.json`, então a Fase 0 não depende dele para o portão.

## Histórico

### 02/10/2026: kit montado

- `CLAUDE.md`: copiado do SPEC, sem alterações.
- `docs/SPEC.md`: transcrição do PDF, sem as duas seções de uso, com os links recuperados das anotações do PDF.
- `reference/andrade.json`: extraído do SPEC e validado como JSON.
- `reference/resultados_referencia.json`: transcrito da tabela "Resultados de referência" (formato próprio, ver D-003).
- `.claude/skills/fase/SKILL.md` e `.claude/agents/revisor-motor.md`: escritos a partir do roteiro do SPEC.
- Conferência prévia, em script descartável, da convenção de fluxo: o benchmark pessoal da Família Andrade dá IPCA + 2,98% com legado e 2,77% sem legado, e os testes 1 a 3 batem (r* = 3,7366%; saque de R$ 55.605,86). Confirma horizonte de 45 passos (2026 a 2070) e W0 = R$ 13,8 mi.
