# AWARE Objective (Aware Investments)

Planejamento patrimonial com dois canais sobre o mesmo motor de simulação (o gêmeo financeiro) e o mesmo ciclo mensal:

- **Clientes de carteira administrada (CADM):** recebem um relatório mensal, preparado, aprovado e apresentado pela gestão, que mostra se o plano continua de pé e o que mudou desde o mês passado.
- **Clientes da assessoria de investimentos (AI):** usam um app, pensado primeiro para celular, com a chance de o plano dar certo, o retorno real que a carteira precisa entregar (benchmark pessoal) e o efeito de hipóteses ("E se?").

Documentos:

- Especificação: [`docs/SPEC.md`](docs/SPEC.md)
- Onde paramos: [`docs/PROGRESSO.md`](docs/PROGRESSO.md)
- Decisões: [`docs/DECISOES.md`](docs/DECISOES.md)
- Mudança de rota (registro): [`docs/ROTA-2.md`](docs/ROTA-2.md)
- Regras para o Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Requisitos

- Node.js 22 LTS (22.18 ou mais novo) e npm
- Python 3 com numpy, só para `reference/motor_referencia.py`

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Todos os testes (Vitest) |
| `npm run test:engine` | Só os testes do motor |
| `npm run typecheck` | Checagem de tipos de todo o projeto |
| `npm run lint` | ESLint |
| `npm run reference` | Roda a Família Andrade no motor e compara com `reference/resultados_referencia.json` |

## Estrutura

- `src/engine/`: motor de simulação (o gêmeo financeiro), em TypeScript puro e sem dependências (também vai rodar nas funções do servidor, em Deno).
- `src/data/`: Família Andrade (fictícia), premissas ilustrativas e cenários de choque.
- `reference/`: referências de aceite. Não editar.
- `scripts/reference.ts`: comparação do motor com os resultados de referência.

Os dados deste repositório são fictícios. Dados reais de clientes nunca entram aqui.
