# Progresso do AWARE Objective

## Status atual

- **Rota 2 adotada** em 02/10/2026 (D-024): app para os clientes AI; relatório mensal da gestão para os clientes CADM. A documentação foi atualizada para a nova rota; o `docs/SPEC.md` é a fonte única, e `docs/ROTA-2.md` fica como registro da mudança.
- **Fase 0 (fundação e motor, sem servidor): concluída** em 02/10/2026, no commit `b875e27` (último commit de código: `c1006e0`), com a integração contínua verde.
- **Fase 1 (relatório de exemplo, sem servidor): em andamento** desde 04/10/2026, com o plano aprovado por Murilo. Etapas 1 a 5 concluídas (pesos explícitos, sorteios alinhados, referência em Python, passo de 12 meses, plano corrigido pelo IPCA e fechamentos fictícios).
- **Branch:** `claude/bold-pascal-rd6kif`, hoje o branch principal do repositório (D-002, D-026 e D-028). Não há pull request aberto.
- **Próximo passo:** etapa 6 da Fase 1, rentabilidade do mês (`src/report/performance.ts`, teste 20). Ponto de parada B cumprido: `revisor-motor` sem divergências abertas nas etapas 1 a 3b (três rodadas).

### Comandos de teste

```bash
npm install
npm run typecheck     # tsc -b: motor (só ES2023), interface, testes e scripts
npm run lint          # ESLint; barra imports externos e imports sem .ts no motor
npm test              # Vitest: 134 testes, incluindo T01 a T18, as entradas do mês e os fechamentos fictícios (~17 s)
npm run test:engine   # só o motor
npm run reference     # Família Andrade com 50.000 trajetórias contra reference/resultados_referencia.json (~6 a 12 s)
```

## Fases e portões (Rota 2)

| Fase | O quê | Branch | Portão | Status |
|---|---|---|---|---|
| 0 | Fundação e motor, sem servidor | `fase-0-motor` | Testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e `revisor-motor` sem divergências abertas | **Cumprido** (02/10/2026) |
| 1 | Relatório de exemplo, sem servidor | `fase-1-relatorio-exemplo` | Testes do motor e `npm run reference` com os resultados novos; testes da ponte (hashes dos extremos e soma em trajetórias); `revisor-motor` sem divergências; PDF de out/2026 da Andrade aprovado por Murilo e Alex | Em andamento |
| 2 | Ciclo mensal interno, com dados reais | `fase-2-ciclo-mensal` | pgTAP passando; família CADM real anonimizada importada, conferida e com relatório aprovado; textos do relatório aprovados por compliance; rodada de todas as famílias CADM em menos de 20 minutos | Pendente |
| 3 | App dos clientes AI | `fase-3-app-ai` | Tela inicial em 375 px e tema escuro; "E se?" em menos de 1 s num celular intermediário; vazamento do papel cliente_ai bloqueado; uso de ponta a ponta com contas fictícias | Pendente |
| 4 | Piloto e operação | `fase-4-piloto` | Dois fechamentos sem erro de conferência e retorno da gestão e dos clientes do piloto | Pendente |

## Fase 1: andamento

Plano aprovado por Murilo em 04/10/2026. Etapas, uma por commit:

| # | Etapa | Status |
|---|---|---|
| 1 | Motor: pesos explícitos (T15) | Concluída |
| 2 | Motor: sorteios alinhados por trajetória e ano (T16, T17) | Concluída |
| 3a | Referência em Python atualizada (mudança isolada) | Concluída |
| 3b | Motor: passo de 12 meses (T18) | Concluída |
| 4 | Plano corrigido pelo IPCA e entradas do mês (`src/report`) | Concluída |
| 5 | Fechamentos fictícios de set e out/2026 | Concluída |
| 6 | Rentabilidade do mês (T20) | Pendente |
| 7 | Rodada oficial e ponte (T19) | Pendente |
| 8 | Textos, formatação e números congelados | Pendente |
| 9 | PDF de sete páginas | Pendente |
| 10 | Modo apresentação | Pendente |

Pontos de parada combinados: (A) testes antigos que dependem da convenção anual, mostrados antes de alterar; (B) divergências do `revisor-motor`, mostradas antes de corrigir; (C) PDF de out/2026 para Murilo e Alex aprovarem.

### Etapa 1: pesos explícitos

- `weights` no cadastro da família e no cenário (D-029); `Plan.weightsSource` diz a origem e `Plan.profileId` fica null com pesos explícitos.
- Teste 15 (`pesos.test.ts`): com os pesos do perfil, o resultado é idêntico, bit a bit, ao do `profileId` (com e sem gasto flexível), menos o hash das entradas.
- `npm run reference`: as 11 métricas saíram idênticas, bit a bit, às de antes da mudança. A versão do motor segue 0.2.0, porque nenhum número mudou.

### Etapa 2: sorteios alinhados

- `rng.ts` e `returns.ts` (D-030): um gerador por classe (pela chave do código) e um por componente de Q em cada trajetória; o ano t usa o t-ésimo sorteio de cada um. Motor 0.3.0.
- Testes 16 e 17 (`alinhamento.test.ts`): o mesmo mercado com patrimônio e plano diferentes; o ano t igual com outro horizonte; carteiras diferentes combinam os mesmos retornos por classe; os mesmos G e Q com outros retornos, volatilidades e correlações; com ν de 3, 5 ou 7, os mesmos G e as mesmas normais de Q; sem uma classe, com as classes em outra ordem ou com uma classe a mais, cada classe mantém o seu G; um resgate de R$ 1 mil nunca aumenta a chance nem o patrimônio de nenhuma trajetória.
- `bissecoes.test.ts`: o caso de borda do gasto sustentável (k = 3 bate 90% com 2.000 trajetórias e não com 5.000) estava calibrado nos sorteios antigos. Com os novos, as primeiras 2.000 trajetórias da semente 20261002 ficam sempre abaixo das 5.000, então o teste passou a usar a semente 3 com POS de R$ 54.425.000. A lógica testada não mudou.
- Desempenho (T14, Node do ambiente): com o cache quente, de 282 ms para 324 ms; com o cache frio, de cerca de 650 ms para cerca de 780 ms.

Família Andrade, 50.000 trajetórias, semente 20261002 (antes = motor 0.2.0; depois = motor 0.3.0):

| Métrica | Antes | Depois | Referência |
|---|---|---|---|
| Retorno composto líquido | 3,914% | 3,910% | 3,90% |
| Benchmark com legado | 2,981% | 2,981% | 2,98% |
| Benchmark sem legado | 2,770% | 2,770% | 2,77% |
| Folga | 0,933 p.p. | 0,930 p.p. | 0,92 p.p. |
| Probabilidade de sucesso, sem regras | 93,30% | 93,06% | 92,9% |
| Probabilidade do legado, sem regras | 89,32% | 88,91% | 88,6% |
| Patrimônio mediano aos 95, sem regras | R$ 20,87 mi | R$ 20,76 mi | R$ 20,52 mi |
| Probabilidade de sucesso, com regras | 99,26% | 99,31% | 99,3% |
| Chance de corte, trajetória de referência | 34,22% | 34,42% | 34,6% |
| Chance de corte, Guyton-Klinger | 99,60% | 99,59% | 99,6% |
| Gasto sustentável com 90% | R$ 86.677 | R$ 85.691 | R$ 86.698 |

### Etapa 3a: referência em Python (mudança isolada de `reference/`)

- `motor_referencia.py` passou a sortear por trajetória (o ano t na linha t) e a usar o passo de 12 meses a partir de 30/09/2026: 45 passos até ago/2071, o último com 11 meses.
- Na mesma mudança, alinhado ao TypeScript (D-027, aprovado por Murilo): as regras param depois da falha e a trajetória de referência que zera fica em zero.
- `resultados_referencia.json` regenerado com as mesmas tolerâncias. Os números estão na tabela da etapa 3b, coluna "Referência nova".

### Etapa 3b: passo de 12 meses

- `plan.ts` (D-031): data de referência no último dia do mês; o passo t vai do mês seguinte à data de referência mais t anos; o último termina no mês do aniversário da idade-limite do membro mais jovem e pode ter m < 12 meses (`stepMonths`, `stepFrac`). Fluxos e eventos anuais entram pro rata pelos meses; evento único e cada ocorrência de "a cada N anos" entram no seu mês (`events.month`; sem mês, julho); data antes do primeiro mês sai do cálculo com aviso. Aposentado no passo t só se a aposentadoria foi antes do início do passo. O plano guarda o fluxo do primeiro mês (`firstMonthFlow`), para a ponte.
- `simulate.ts`, `requiredReturn.ts` e `guardrails.ts`: o passo curto rende (1 + R)^(m/12) − 1 na simulação, no benchmark e na trajetória de referência. Os "últimos 15 anos" são os últimos 15 passos. Motor 0.4.0.
- Teste 18 (`passo.test.ts`, 7 testes): data de referência no fim do mês; calendário da Andrade (45 passos, só o último com 11 meses, fluxo do primeiro mês); fluxos pro rata; eventos no seu mês, em julho sem mês e fora do cálculo quando já passaram; retorno do passo curto; aposentadoria antes do início do passo; nenhum corte nos últimos 15 passos.
- **Ponto de parada A** (aprovado por Murilo, "Pode aplicar"): 16 testes antigos dependiam da convenção anual e foram ajustados, sem mudar o que cada um testa:
  - `helpers.ts`: a família sintética passou a ter data de referência em 31/12/2026 e aniversário em dezembro, para que o passo t seja exatamente o ano civil 2027 + t; os testes de T01 a T12 que a usam continuam com os mesmos números.
  - `plano.test.ts`: as expectativas por ano civil viraram expectativas por passo, calculadas à mão (ex.: renda do passo 9 = 3 meses de pró-labore e dividendos mais o aluguel).
  - `deterministico.test.ts` e `simulacao.test.ts`: o benchmark da Andrade é comparado com o JSON da referência (3,24% e 3,04%), e não mais com os números antigos escritos no teste; as projeções determinísticas recebem `stepFrac`; o teste de horizonte compara só os passos inteiros comuns aos dois horizontes.
  - `bissecoes.test.ts`: o caso de borda do gasto sustentável foi recalibrado para semente 3 e POS de R$ 55.525.000 (a lógica testada não mudou).
- Desempenho (T14, Node do ambiente): cerca de 300 ms com o cache quente e 780 ms com o cache frio, como antes.

Família Andrade, 50.000 trajetórias, semente 20261002 (antes = motor 0.3.0, convenção anual; depois = motor 0.4.0):

| Métrica | Antes | Depois | Referência antiga | Referência nova |
|---|---|---|---|---|
| Retorno composto líquido | 3,910% | 3,910% | 3,90% | 3,90% |
| Benchmark com legado | 2,981% | 3,244% | 2,98% | 3,244% |
| Benchmark sem legado | 2,770% | 3,044% | 2,77% | 3,044% |
| Folga | 0,930 p.p. | 0,666 p.p. | 0,92 p.p. | 0,656 p.p. |
| Probabilidade de sucesso, sem regras | 93,06% | 86,42% | 92,9% | 86,23% |
| Probabilidade do legado, sem regras | 88,91% | 80,31% | 88,6% | 80,12% |
| Patrimônio mediano aos 95, sem regras | R$ 20,76 mi | R$ 15,23 mi | R$ 20,52 mi | R$ 14,91 mi |
| Probabilidade de sucesso, com regras | 99,31% | 97,76% | 99,3% | 97,72% |
| Chance de corte, trajetória de referência | 34,42% | 35,80% | 34,6% | 35,81% |
| Chance de corte, Guyton-Klinger | 99,59% | 99,87% | 99,6% | 99,90% |
| Gasto sustentável com 90% | R$ 85.691 | R$ 82.301 | R$ 86.698 | R$ 83.285 |

As 11 métricas ficam dentro das tolerâncias da referência nova. A queda da chance vem do calendário, como o SPEC previa: a convenção anual contava de novo os fluxos de jan a set/2026 e encerrava o plano em dez/2070, e não em ago/2071.

### Revisão do `revisor-motor` (etapas 1 a 3b, ponto de parada B)

1ª rodada, em 04/10/2026: o calendário do motor bate com o do Python (45 passos, o último com 11 meses, aposentado a partir do passo 10, fluxos idênticos em todos os passos). Foram 5 divergências, nenhuma bloqueante, mostradas a Murilo antes de corrigir:

| # | Divergência | Decisão de Murilo | Correção |
|---|---|---|---|
| 1 | Só reordenar as classes mudava os retornos (Cholesky na ordem da lista) | Ordem fixa pelos códigos | `returns.ts`: correlação na ordem dos códigos; texto da D-030 corrigido; novo caso no teste 16. Motor 0.5.0 |
| 2 | Gasto mensal do "E se?" comparado com o total do passo 0 (com o essencial a partir de 2027, o mesmo valor do plano subia o gasto em 1/3) | Gasto do primeiro mês simulado | `plan.ts` e `solvers.ts` (D-032); casos no teste 18 |
| 3 | Testes não pegavam o (1 + r)^(m/12) no benchmark nem "a cada N anos" com mês | Sem consulta (só testes) | Teste 18: benchmark com passo curto (r* = 4%, que viraria 3,0% sem a fração), "a cada N anos" com mês e datas passadas |
| 4 | Evento com data passada saía do cálculo, inclusive saídas | Saídas ficam, entradas saem (revista na 2ª rodada, abaixo) | `plan.ts` (D-031, item 3) |
| 5 | Tabela de referência do SPEC com os números da Fase 0 | Atualizar | `docs/SPEC.md`: tabela e frase do Guyton-Klinger com os números novos, mesmas tolerâncias |

2ª rodada, em 04/10/2026: as divergências 1, 2, 3 e 5 foram confirmadas como fechadas, e o índice indireto em `classReturns` não piorou o tempo. A correção da 4 abriu uma divergência nova: levar ao primeiro mês toda saída dos 12 meses anteriores contava de novo, por até 12 fechamentos, uma saída que já aconteceu (na Andrade, a troca de carros de jul/2028 tirava 5,6 p.p. da chance de ago/2028 a jun/2029, e a ponte mostraria um aporte fantasma de R$ 400 mil por mês). Murilo escolheu "só a data incerta volta": a ocorrência sem mês no ano do primeiro mês simulado, com julho já passado, leva a saída ao primeiro mês (a entrada sai), com aviso; qualquer outra data passada sai do cálculo, sem aviso (D-031, item 3). O teste 18 ganhou o caso do ciclo mensal com a Andrade em datas de referência de jun/2028 a jul/2029.

3ª rodada, em 04/10/2026: **sem divergências abertas.** O revisor refez o ciclo mensal da Andrade: a troca de carros sem mês de 2028 só volta ao primeiro mês nos 5 fechamentos de ago a dez/2028, sempre com aviso, e a ponte continua fechando. Duas observações, que não são divergências, ficam em "Pendências".

Também: o teste 11 passou a usar a regra de aposentadoria do motor, comentários de "anos" viraram passos em `types.ts`, e o caso de borda do gasto sustentável foi recalibrado (POS de R$ 55.550.000).

Família Andrade, 50.000 trajetórias, semente 20261002 (antes = motor 0.4.0; depois = motor 0.5.0). Só a divergência 1 muda os números da Andrade (ela não tem eventos com data passada, e o gasto do primeiro mês é igual à média do passo 0):

| Métrica | Antes | Depois | Referência |
|---|---|---|---|
| Retorno composto líquido | 3,910% | 3,911% | 3,90% |
| Benchmark com legado | 3,244% | 3,244% | 3,244% |
| Benchmark sem legado | 3,044% | 3,044% | 3,044% |
| Folga | 0,666 p.p. | 0,667 p.p. | 0,656 p.p. |
| Probabilidade de sucesso, sem regras | 86,42% | 86,53% | 86,23% |
| Probabilidade do legado, sem regras | 80,31% | 80,50% | 80,12% |
| Patrimônio mediano aos 95, sem regras | R$ 15,23 mi | R$ 15,13 mi | R$ 14,91 mi |
| Probabilidade de sucesso, com regras | 97,76% | 97,79% | 97,72% |
| Chance de corte, trajetória de referência | 35,80% | 36,03% | 35,81% |
| Chance de corte, Guyton-Klinger | 99,87% | 99,88% | 99,90% |
| Gasto sustentável com 90% | R$ 82.301 | R$ 83.327 | R$ 83.285 |

### Etapa 4: plano corrigido pelo IPCA e entradas do mês

- `src/report/` (novo, puro como o motor: o projeto `tsconfig.engine.json` e a regra de imports do ESLint passaram a cobrir a pasta):
  - `types.ts`: cadastro da família (`HouseholdRecord`, com canal, origem dos pesos e semente), versão do plano (`PlanVersion`, com o mês-base) e fechamento do mês (`MonthClosing`: posições por classe, PL oficial e aportes e resgates).
  - `inflation.ts`: IPCA acumulado do mês seguinte ao mês-base até o mês de referência (falta de IPCA é erro) e o plano corrigido, em centavos.
  - `monthInputs.ts`: confere o fechamento (último dia do mês e PL com tolerância de 0,01%), corrige o plano, monta os pesos da carteira atual dos clientes AI e devolve as entradas do motor com a semente da família.
  - Decisões em D-033.
- Testes (`src/report/__tests__/entradas.test.ts`, 10 testes): o fator do IPCA e os erros; o VGBL de R$ 1,8 mi vai a R$ 1.807.200 com 0,40%; em setembro (mês-base), as entradas são idênticas às de `andrade.json`, com o mesmo hash e o mesmo resultado; em outubro, o gasto do primeiro mês fica em R$ 85 mil × 1,004 e o legado em R$ 3.012.000, sem aviso; a conferência do PL; a carteira atual com o VGBL nos pesos.
- O motor não mudou (versão 0.5.0): `npm run reference` deu os mesmos números.

### Etapa 5: fechamentos fictícios

- `src/data/andrade-fechamentos.json`: cadastro da família (canal CADM, pesos do perfil, semente 20261002), plano v1 (mês-base set/2026, igual a `andrade.json`) e v2 (mês-base out/2026: v1 × 1,004, com o estilo de vida em R$ 35 mil por mês), IPCA fictício de 0,40% em outubro e os fechamentos:
  - set/2026: posições de `andrade.json`, PL de R$ 12 mi, sem movimentos;
  - out/2026: resgate de R$ 300 mil em 15/10 (do pós-fixado) e PL de R$ 11.450.961,29. Retornos nominais ilustrativos por classe: ações −8%, exterior −5,5%, FII −5%, inflação −3%, prefixado −2,5%, multimercado −2%, crédito +0,6% e pós-fixado +0,8%. O mês fecha em −2,10% nominal e −2,49% real (Dietz modificado). O VGBL vai a R$ 1.807.200, com valor real constante.
- Ajuste da etapa 4: o legado mínimo passou do cadastro para a versão do plano (D-033), porque é valor em reais e precisa do mês-base; `planVersionFor` escolhe a versão em vigor no mês.
- Testes (`fechamentos.test.ts`, 4 testes; e mais um em `entradas.test.ts`): setembro reproduz `andrade.json`; v2 = v1 corrigido com o estilo de vida novo; PL conferido e rentabilidade real entre −2,6% e −2,4%; entradas de outubro sem aviso, com W0 de R$ 13.258.161,29 e legado de R$ 3.012.000.

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

- **Eventos do "E se?" sem mês (para a etapa 4 e o console):** o motor trata aportes e resgates do "E se?" como os eventos do plano. Sem mês, um aporte "em 2026" com julho já passado fica fora do cálculo, e o aviso fala em conferência. O controle do "E se?" deve sempre informar o mês.
- **Virada do ano (D-031, item 3), para o Murilo decidir se quer:** no fechamento de 31/12, a saída sem mês do ano que acabou sai do cálculo sem aviso. Um último aviso nesse fechamento ajudaria a conferência a registrar a saída; não muda nenhum número.
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
