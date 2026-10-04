# Progresso do AWARE Objective

## Status atual

- **Rota 2 adotada** em 02/10/2026 (D-024): app para os clientes AI; relatório mensal da gestão para os clientes CADM. A documentação foi atualizada para a nova rota; o `docs/SPEC.md` é a fonte única, e `docs/ROTA-2.md` fica como registro da mudança.
- **Fase 0 (fundação e motor, sem servidor): concluída** em 02/10/2026, no commit `b875e27` (último commit de código: `c1006e0`), com a integração contínua verde.
- **Branch:** `claude/bold-pascal-rd6kif`, hoje o branch principal do repositório (D-002 e D-026). Não há pull request aberto.
- **Próximo passo:** Fase 1, relatório de exemplo sem servidor, numa conversa nova (`/clear`, depois `/fase 1`). Ela começa pelas quatro mudanças de "Motor no ciclo mensal"; a dos sorteios alinhados por trajetória já está parcialmente feita (D-020).

### Comandos de teste

```bash
npm install
npm run typecheck     # tsc -b: motor (só ES2023), interface, testes e scripts
npm run lint          # ESLint; barra imports externos e imports sem .ts no motor
npm test              # Vitest: 91 testes, incluindo T01 a T14 (~13 s)
npm run test:engine   # só o motor
npm run reference     # Família Andrade com 50.000 trajetórias contra reference/resultados_referencia.json (~6 a 12 s)
```

## Fases e portões (Rota 2)

| Fase | O quê | Branch | Portão | Status |
|---|---|---|---|---|
| 0 | Fundação e motor, sem servidor | `fase-0-motor` | Testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e `revisor-motor` sem divergências abertas | **Cumprido** (02/10/2026) |
| 1 | Relatório de exemplo, sem servidor | `fase-1-relatorio-exemplo` | Testes do motor e `npm run reference` com os resultados novos; testes da ponte (hashes dos extremos e soma em trajetórias); `revisor-motor` sem divergências; PDF de out/2026 da Andrade aprovado por Murilo e Alex | Próxima |
| 2 | Ciclo mensal interno, com dados reais | `fase-2-ciclo-mensal` | pgTAP passando; família CADM real anonimizada importada, conferida e com relatório aprovado; textos do relatório aprovados por compliance; rodada de todas as famílias CADM em menos de 20 minutos | Pendente |
| 3 | App dos clientes AI | `fase-3-app-ai` | Tela inicial em 375 px e tema escuro; "E se?" em menos de 1 s num celular intermediário; vazamento do papel cliente_ai bloqueado; uso de ponta a ponta com contas fictícias | Pendente |
| 4 | Piloto e operação | `fase-4-piloto` | Dois fechamentos sem erro de conferência e retorno da gestão e dos clientes do piloto | Pendente |

## Fase 0: o que foi feito

### Arquivos

- **Projeto:** `package.json`, `tsconfig*.json` (quatro projetos), `eslint.config.js`, `vitest.config.ts`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (página provisória), `.gitignore`, `.env.example`, `README.md` e `.github/workflows/ci.yml`.
- **Dados:** `src/data/andrade.json` (cópia de `reference/`), `src/data/premissas-ilustrativas-2026-10.json` e `src/data/choques.json`.
- **Motor (`src/engine/`, versão 0.2.0):** `rng.ts`, `linalg.ts`, `returns.ts`, `plan.ts`, `shocks.ts`, `guardrails.ts`, `simulate.ts`, `metrics.ts`, `requiredReturn.ts`, `solvers.ts`, `hash.ts`, `types.ts`, `errors.ts`, `version.ts` e `index.ts` (API pública).
- **Testes (`src/engine/__tests__/`):**
  - `deterministico`: T01 a T03.
  - `simulacao`: T04, T05, T06, T09, T10, T12, mais horizonte e idade de esgotamento.
  - `sorteios`: T07 e T08.
  - `gasto-flexivel`: T11.
  - `andrade`: T13.
  - `desempenho`: T14.
  - `plano`, `bissecoes` e `versao`.
- **Referência:** `scripts/reference.ts` e `scripts/referenceMetrics.ts` (o teste 13 usa o mesmo cálculo).

### O que o motor entrega (`simulate`)

- Probabilidade de sucesso e do legado.
- Percentis P10, P25, P50, P75 e P90 por idade.
- Idade de esgotamento.
- Retorno composto realizado e esperado.
- Benchmark pessoal e folga.
- Com gasto flexível: chance de corte, maior corte mediano e anos com corte.
- Para refazer o cálculo: hash das entradas, versão do motor e das premissas, semente e avisos.

À parte, há `sustainableSpending` ("Quanto posso gastar?"), `earliestRetirement` ("Quando posso parar?"), `requiredReturn` e `probabilityBand` (faixas azul, verde, amarela e vermelha).

### Família Andrade contra a referência (50.000 trajetórias, semente 20261002)

| Métrica | Obtido | Referência | Tolerância |
|---|---|---|---|
| Retorno composto líquido (moderado) | 3,914% | 3,90% | ±0,05 p.p. |
| Benchmark pessoal com legado | 2,981% | 2,98% | ±0,01 p.p. |
| Benchmark pessoal sem legado | 2,770% | 2,77% | ±0,01 p.p. |
| Folga | 0,933 p.p. | 0,92 p.p. | ±0,05 p.p. |
| Probabilidade de sucesso, sem regras | 93,3% | 92,9% | ±2 p.p. |
| Probabilidade do legado, sem regras | 89,3% | 89% | ±2 p.p. |
| Patrimônio mediano aos 95, sem regras | R$ 20,87 mi | R$ 20,5 mi | ±R$ 1,5 mi |
| Probabilidade de sucesso, com regras | 99,3% | 99% | ±1 p.p. |
| Chance de corte, trajetória de referência | 34,2% | 35% | ±5 p.p. |
| Chance de corte, Guyton-Klinger | 99,6% | 99,6% | ±1 p.p. |
| Gasto sustentável com 90% | R$ 86.677/mês | R$ 87 mil | ±R$ 3 mil |

### Desempenho

5.000 trajetórias × 45 anos × 8 classes, no Node do ambiente de desenvolvimento:

- cerca de 280 ms com o cache quente;
- cerca de 700 ms na primeira chamada, que estima ln E[exp(sZ)] com 1 milhão de sorteios.

Na Fase 1, o Web Worker pode aquecer o cache ao abrir o app.

### Revisões

- **`/code-review` no que não é motor:** um achado (testes `.test.tsx` sem checagem de tipos), corrigido.
- **`revisor-motor`, três rodadas:**
  - 1ª rodada: 9 divergências, 2 bloqueantes (horizonte longo sem gastos; gasto sustentável podendo devolver k = 0,3). O Murilo aprovou corrigir todas.
  - 2ª rodada: as 9 confirmadas como fechadas; sobraram 2 menores (estado de módulo no gerador; cobertura do teste 7).
  - 3ª rodada: **sem divergências abertas**.

## Pendências

- **Rota 2, perguntas em aberto:** em vigor os padrões da D-025 (corretora e formato das posições AI, custo AI de 0,80% "a validar", responsável por família, regras da assessoria, preparo e aprovação dos relatórios, piloto e identidade visual).
- **Referências do kit:** recebidas em 04/10/2026 (D-001 resolvida). O motor em Python reproduz o JSON do kit, e o motor em TypeScript fica dentro das tolerâncias em todas as 11 métricas. As diferenças conhecidas entre os dois estão em D-027; Murilo aprovou alinhar duas delas (regras depois da falha e trajetória de referência que zera) na mudança isolada de `reference/` da Fase 1.
- **D-019, para o Murilo confirmar:** com horizonte maior no "E se?", também estendemos rendas e aluguéis que vão até o fim do plano. É a leitura coerente, mas não a mais conservadora (na Andrade com 100 anos, R$ 84 mil por ano a mais durante 5 anos).
- **D-010, para a Fase 1:** o relatório e o app precisam dizer que o gasto sustentável é calculado sem gasto flexível.
- **Demais decisões:** D-006 a D-023, a confirmar com quem está indicado em `docs/DECISOES.md`.
- **Perguntas em aberto do SPEC:** continuam com os padrões da D-004.

## Histórico

### 04/10/2026: referências do kit

- `reference/gemeo.html` e `reference/motor_referencia.py` entraram no repositório; `resultados_referencia.json` foi trocado pelo original do kit (D-003), e `andrade.json` já era igual.
- `python3 reference/motor_referencia.py` (numpy) reproduz exatamente o JSON do kit, em cerca de 2 s.
- `npm run reference` e o teste 13 passaram a ler o formato original; as 11 métricas seguem dentro das tolerâncias.

### 02/10/2026: Rota 2

- Nova rota decidida por Murilo Brito (D-024), registrada em `docs/ROTA-2.md`.
- Documentação atualizada: `docs/SPEC.md`, `CLAUDE.md`, `README.md`, este arquivo, o comando `/fase` e o `revisor-motor`. Nada mudou em `src/engine` nem em `reference/`.
- Conferência antes da mudança: typecheck e lint limpos, 91 testes passando e 11 de 11 métricas da referência dentro das tolerâncias.

### 02/10/2026: Fase 0 concluída

- Doações retiradas do projeto a pedido do Murilo (D-005).
- Projeto base, CI, motor completo, testes 1 a 14 e `npm run reference`.
- Três rodadas do `revisor-motor`; correções com teste próprio para cada divergência.
- CI verde no GitHub (tipos, lint, testes e referência).

### 02/10/2026: kit montado

- `CLAUDE.md`, `docs/SPEC.md` (transcrição do PDF, com os links), `reference/andrade.json`, `reference/resultados_referencia.json` (formato próprio, D-003), comando `/fase` e subagente `revisor-motor`.
