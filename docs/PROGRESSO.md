# Progresso

## Status atual

- **Fase:** 0 (fundação e motor, sem servidor), implementada. Falta fechar o portão com a revisão do `revisor-motor`.
- **Branch:** `claude/bold-pascal-rd6kif` (D-002).
- **Próximo passo:** tratar as divergências do `revisor-motor` (se houver) com a aprovação do Murilo; depois, Fase 1 numa conversa nova (`/fase 1`).

### Comandos de teste

```bash
npm install
npm run typecheck     # tsc -b: motor (só ES2023), interface, testes e scripts
npm run lint          # ESLint; barra imports externos e imports sem .ts no motor
npm test              # Vitest: 80 testes, incluindo T01 a T14 (~10 s)
npm run test:engine   # só o motor
npm run reference     # Família Andrade com 50.000 trajetórias contra reference/resultados_referencia.json (~6 a 11 s)
```

## Portões

| Fase | Portão | Status |
|---|---|---|
| 0 | Testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e revisão do `revisor-motor` sem divergências abertas | Testes e referência ok; revisão em andamento |
| 1 | Revisão do Alex com a família de exemplo; tela inicial em 375 px e no tema escuro | Pendente |
| 2 | Teste de vazamento entre famílias; uma família real anonimizada importada e conciliada; textos aprovados por compliance; pentest | Pendente |
| 3 | Piloto com 3 a 5 famílias do Alex | Pendente |

## Fase 0: o que foi feito

### Arquivos

- Projeto: `package.json`, `tsconfig*.json` (quatro projetos), `eslint.config.js`, `vitest.config.ts`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (página provisória), `.gitignore`, `.env.example`, `README.md`, `.github/workflows/ci.yml`.
- Dados: `src/data/andrade.json` (cópia de `reference/`), `src/data/premissas-ilustrativas-2026-10.json`, `src/data/choques.json`.
- Motor (`src/engine/`): `rng.ts`, `linalg.ts`, `returns.ts`, `plan.ts`, `shocks.ts`, `guardrails.ts`, `simulate.ts`, `metrics.ts`, `requiredReturn.ts`, `solvers.ts`, `hash.ts`, `types.ts`, `errors.ts`, `version.ts`, `index.ts`.
- Testes (`src/engine/__tests__/`): `deterministico` (T01–T03), `simulacao` (T04, T05, T06, T09, T10, T12), `sorteios` (T07, T08), `gasto-flexivel` (T11), `andrade` (T13), `desempenho` (T14), `plano`, `bissecoes`, `versao`.
- Referência: `scripts/reference.ts` e `scripts/referenceMetrics.ts` (o teste 13 usa o mesmo cálculo).

### Família Andrade contra a referência (50.000 trajetórias, semente 20261002)

| Métrica | Obtido | Referência | Tolerância |
|---|---|---|---|
| Retorno composto líquido (moderado) | 3,913% | 3,90% | ±0,05 p.p. |
| Benchmark pessoal com legado | 2,981% | 2,98% | ±0,01 p.p. |
| Benchmark pessoal sem legado | 2,770% | 2,77% | ±0,01 p.p. |
| Folga | 0,932 p.p. | 0,92 p.p. | ±0,05 p.p. |
| Probabilidade de sucesso, sem regras | 93,4% | 92,9% | ±2 p.p. |
| Probabilidade do legado, sem regras | 89,3% | 89% | ±2 p.p. |
| Patrimônio mediano aos 95, sem regras | R$ 20,66 mi | R$ 20,5 mi | ±R$ 1,5 mi |
| Probabilidade de sucesso, com regras | 99,3% | 99% | ±1 p.p. |
| Chance de corte, trajetória de referência | 34,7% | 35% | ±5 p.p. |
| Chance de corte, Guyton-Klinger | 99,5% | 99,6% | ±1 p.p. |
| Gasto sustentável com 90% | R$ 87.126/mês | R$ 87 mil | ±R$ 3 mil |

### Desempenho

5.000 trajetórias × 45 anos × 8 classes: ~280 ms com o cache quente e ~720 ms na primeira chamada (que estima ln E[exp(sZ)] com 1 milhão de sorteios), no Node do ambiente de desenvolvimento. Na Fase 1, o Web Worker pode aquecer o cache ao abrir o app.

### Revisões

- `/code-review` no que não é motor: um achado (testes `.test.tsx` sem checagem de tipos), corrigido.
- `revisor-motor`: em andamento.

## Pendências

- `reference/gemeo.html` e `reference/motor_referencia.py` não vieram (D-001). O protótipo é necessário na Fase 1.
- Decisões D-006 a D-018 a confirmar com quem está indicado em `docs/DECISOES.md`.

## Histórico

### 02/10/2026: Fase 0

- Doações retiradas do projeto a pedido do Murilo (D-005).
- Projeto base, CI, motor completo, testes 1 a 14 e `npm run reference`.
- CI verde no GitHub (tipos, lint, 80 testes e referência).

### 02/10/2026: kit montado

- `CLAUDE.md`, `docs/SPEC.md` (transcrição do PDF, com os links), `reference/andrade.json`, `reference/resultados_referencia.json` (formato próprio, D-003), comando `/fase` e subagente `revisor-motor`.
