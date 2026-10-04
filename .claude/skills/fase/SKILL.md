---
name: fase
description: Inicia uma fase (0 a 4) ou etapa do plano de entrega do AWARE Objective. Lê a fase no SPEC, confere o portão anterior, apresenta um plano e só edita depois da aprovação. Use quando o usuário digitar /fase N.
argument-hint: "<fase> [etapa]  (ex.: 1, 2 etapa 1, 3, 4)"
disable-model-invocation: true
---

# /fase $ARGUMENTS

Você vai conduzir a fase **$ARGUMENTS** do AWARE Objective. Siga este roteiro, nesta ordem.

Fases (detalhes em `docs/SPEC.md`, "Plano de entrega por fases"):

| Fase | O quê | Branch |
|---|---|---|
| 0 | Fundação e motor, sem servidor (concluída) | `fase-0-motor` |
| 1 | Relatório de exemplo, sem servidor | `fase-1-relatorio-exemplo` |
| 2 | Ciclo mensal interno, com dados reais (etapas 1 a 4) | `fase-2-ciclo-mensal` |
| 3 | App dos clientes AI | `fase-3-app-ai` |
| 4 | Piloto e operação | `fase-4-piloto` |

## 1. Ler antes de propor

1. `CLAUDE.md`, `docs/PROGRESSO.md` e `docs/DECISOES.md`.
2. Em `docs/SPEC.md`:
   - a fase pedida em "Plano de entrega por fases", com o portão de saída;
   - a mensagem pronta da fase em "Mensagens prontas";
   - todas as seções que a fase e a mensagem citam (ex.: Fase 1 → "Motor no ciclo mensal (a partir da Fase 1)", "Canal 1: relatório mensal dos clientes CADM" e "O que mudou no mês (a ponte)", em Telas e funcionalidades, "Dados mensais por canal", "Fechamentos fictícios", "Testes e critérios de aceite", "Design e linguagem" e "Stack técnica e arquitetura").
3. Os arquivos de `reference/` que a fase usa. Não os edite.

## 2. Conferir o portão anterior

- Se a fase anterior não cumpriu o portão segundo `docs/PROGRESSO.md`, pare e diga exatamente o que falta. Não comece a fase sem o portão cumprido, a menos que o usuário autorize por escrito.

## 3. Apresentar o plano e esperar a aprovação

Não edite nenhum arquivo nesta etapa. Mostre:

- **Etapas**, na ordem, cada uma pequena o bastante para um commit.
- **Arquivos** que vai criar ou alterar.
- **Comandos** que vai rodar.
- **Como vai provar que funcionou**: quais testes, quais saídas, quais números do SPEC.
- **Ambiguidades** encontradas e a escolha conservadora para cada uma (vão para `docs/DECISOES.md`).
- **Perguntas** só quando a decisão afetar dados de clientes, segurança, compliance ou custos.

Espere a aprovação explícita antes de implementar.

## 4. Implementar

- Branch da fase (tabela acima), commits pequenos com mensagens em português. Se o ambiente só permitir push num branch designado, use-o e registre em `docs/DECISOES.md` (como D-002 e D-026).
- Uma etapa só está pronta com evidência: rode `npm run typecheck`, `npm run lint`, `npm test` e, se o motor mudou, `npm run reference`. Mostre a saída. Se o motor mudou, mostre os números antes e depois.
- Registre em `docs/DECISOES.md` toda decisão tomada sem consulta.
- Ao fim de cada etapa, atualize `docs/PROGRESSO.md` (o que foi feito, comandos de teste, próximo passo).
- Peça confirmação antes de criar recursos em nuvem, contratar serviços pagos, rodar comandos destrutivos fora do ambiente local ou apagar arquivos.
- `reference/` não se edita, exceto na mudança isolada da Fase 1 aprovada por Murilo.

## 5. Fechar a fase

1. Se `src/engine` mudou, rode o subagente `revisor-motor` e mostre as divergências antes de corrigir.
2. Rode `/code-review` no restante do diff.
3. Confira o portão de saída da fase, item por item, com evidência.
4. Atualize `docs/PROGRESSO.md` e entregue: o que foi feito, como testar e o que ficou pendente.
5. Lembre o usuário de começar a fase seguinte numa conversa nova (`/clear`).
