---
name: fase
description: Inicia uma fase (ou etapa) do plano de entrega do Gêmeo Financeiro. Lê a fase no SPEC, confere o portão anterior, apresenta um plano e só edita depois da aprovação. Use quando o usuário digitar /fase N.
argument-hint: "<fase> [etapa]  (ex.: 0, 1, 2 etapa 1, 3)"
disable-model-invocation: true
---

# /fase $ARGUMENTS

Você vai conduzir a fase **$ARGUMENTS** do Gêmeo Financeiro. Siga este roteiro, nesta ordem.

## 1. Ler antes de propor

1. `CLAUDE.md`, `docs/PROGRESSO.md` e `docs/DECISOES.md`.
2. Em `docs/SPEC.md`:
   - a fase pedida em "Plano de entrega por fases", com o portão de saída;
   - a mensagem pronta da fase em "Mensagens prontas";
   - todas as seções que a fase e a mensagem citam (ex.: Fase 0 → "Motor de simulação", "Benchmark pessoal", "Testes e critérios de aceite", "Stack técnica e arquitetura", "Dados de exemplo: Família Andrade").
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

- Branch da fase (`fase-0-motor`, `fase-1-telas`, `fase-2-servidor`, `fase-3-clientes`), commits pequenos com mensagens em português.
- Uma etapa só está pronta com evidência: rode `npm run typecheck`, `npm run lint`, `npm test` e, se o motor mudou, `npm run reference`. Mostre a saída.
- Registre em `docs/DECISOES.md` toda decisão tomada sem consulta.
- Ao fim de cada etapa, atualize `docs/PROGRESSO.md` (o que foi feito, comandos de teste, próximo passo).
- Peça confirmação antes de criar recursos em nuvem, contratar serviços pagos, rodar comandos destrutivos fora do ambiente local ou apagar arquivos.

## 5. Fechar a fase

1. Se `src/engine` mudou, rode o subagente `revisor-motor` e mostre as divergências antes de corrigir.
2. Rode `/code-review` no restante do diff.
3. Confira o portão de saída da fase, item por item, com evidência.
4. Atualize `docs/PROGRESSO.md` e entregue: o que foi feito, como testar e o que ficou pendente.
5. Lembre o usuário de começar a fase seguinte numa conversa nova (`/clear`).
