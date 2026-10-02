# Gêmeo Financeiro (Aware Investments)

App web em que clientes de carteira administrada (CADM) veem a chance de o plano de vida dar certo, o retorno real que a carteira precisa entregar (benchmark pessoal) e o efeito de hipóteses ("E se?").

- Especificação: `docs/SPEC.md`. Antes de cada tarefa, leia a fase atual em "Plano de entrega por fases" e as seções que ela cita.
- Onde paramos: `docs/PROGRESSO.md`. Decisões tomadas sem consulta: `docs/DECISOES.md`.
- Referências, que não devem ser editadas: `reference/` (protótipo `gemeo.html`, `motor_referencia.py`, `andrade.json`, `resultados_referencia.json`).

## Comandos
- `npm run dev`: servidor de desenvolvimento
- `npm test`: todos os testes (Vitest); `npm run test:engine`: só o motor
- `npm run typecheck` e `npm run lint`
- `npm run reference`: compara o motor com `reference/resultados_referencia.json`
- `python3 reference/motor_referencia.py`: motor de referência (requer numpy)
- A partir da Fase 2: `npx supabase start`, `npx supabase db reset`, `npx supabase test db`

## Regras
- O motor fica em `src/engine`: TypeScript puro, sem React, DOM ou dependências externas, com imports relativos terminados em `.ts`. A interface só consome o motor.
- Valores em reais de hoje; retornos reais, acima do IPCA.
- Uma tarefa só está pronta com typecheck, lint e testes passando. Mostre a saída dos comandos.
- Não mude premissas, perfis, tolerâncias ou textos legais do SPEC sem pedir.
- Dados reais de clientes nunca entram no repositório nem nesta conversa. Use a Família Andrade.
- Segredos só em `.env.local`, fora do git; `.env.example` só com os nomes das variáveis.
- No navegador, só a chave publicável do Supabase. A chave secreta e as chaves da ANBIMA, da brapi e do Claude ficam só nas funções do servidor.
- Toda tabela com dados de família tem `household_id`, política de acesso por linha e teste pgTAP.
- Peça confirmação antes de criar recursos em nuvem, contratar serviços pagos, rodar comandos destrutivos fora do ambiente local ou apagar arquivos.
- Textos para o cliente em português do Brasil, simples e sem recomendar produtos, ativos ou alocação.
- Commits pequenos com mensagens em português, um branch por fase (`fase-0-motor`, `fase-1-telas`, `fase-2-servidor`, `fase-3-clientes`). Ao fim de cada etapa, atualize `docs/PROGRESSO.md`.

## Fluxo
- `/fase N` inicia uma fase: plano primeiro, implementação só depois da aprovação.
- Quando o motor mudar, peça a revisão do subagente `revisor-motor`; para o resto do diff, use `/code-review`.
- Ao compactar a conversa, preserve a lista de arquivos alterados, os comandos de teste e o status da fase.
