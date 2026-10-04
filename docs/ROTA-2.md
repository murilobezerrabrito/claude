# Prompt do AWARE Objective: nova rota

> Transcrição em Markdown do documento "Prompt do AWARE Objective: nova rota" (02/10/2026, @Murilo). Os diagramas do original aparecem como descrição em texto. Registro da mudança de rota: a partir do commit da primeira tarefa, o `docs/SPEC.md` volta a ser a única fonte.

## Como usar

Este documento muda a rota do AWARE Objective a partir da Fase 1; a Fase 0 (motor e testes) fica como está e continua sendo a base.

1. Confirme que a Fase 0 está no branch principal, com a integração contínua verde.
2. Salve este documento como `docs/ROTA-2.md` no repositório (exportação em Markdown).
3. Abra uma conversa nova no Claude Code, ligue o modo de planejamento e cole a mensagem da seção "Mensagem de abertura".
4. Essa primeira conversa só atualiza a documentação do repositório. Depois, cada fase começa numa conversa nova com `/fase N`, sempre com plano aprovado antes de editar.

A primeira tarefa copia para o `docs/SPEC.md` tudo o que este documento define. A partir do commit dela, o SPEC volta a ser a única fonte, e este arquivo fica como registro da mudança; até lá, onde os dois discordarem, vale este documento.

## O que mudou

O AWARE Objective passa a ter dois canais sobre o mesmo motor: os clientes AI usam o app, e os clientes CADM não acessam sistema nenhum e recebem um relatório mensal que a gestão prepara e apresenta. Clientes AI são os da assessoria de investimentos da Aware, com conta na corretora a que a assessoria é vinculada.

> Diagrama "Um motor e um ciclo mensal alimentam os dois canais" (um motor, dois canais). Três entradas: **Posições e movimentos** (CADM: controle da gestão; AI: posições da corretora), **Plano da família** (renda, gastos e metas) e **Premissas do comitê** (retorno, risco e correlação). Elas alimentam o **Ciclo mensal**: importar e conferir → rodar o motor → ponte: o que mudou. O ciclo alimenta dois canais: **Relatório mensal CADM** (gestão prepara, aprova e apresenta ao cliente) e **App dos clientes AI** (o cliente vê o mês e simula no celular).

O relatório CADM e o app AI leem os mesmos números do mês; muda só quem os vê e como chegam ao cliente.

| Tema | Rota anterior | Nova rota |
|---|---|---|
| Quem usa o app | Clientes CADM do Alex | Clientes AI |
| Clientes CADM | Usariam o app | Recebem relatório mensal, preparado, aprovado e apresentado pela gestão |
| Quem opera o mês | Banker importava as posições | Gestão: importa, confere, roda o mês e aprova os relatórios |
| Posições | Controle interno da CADM | CADM: o mesmo controle do reporte à ANBIMA. AI: posições da corretora (formato a confirmar) |
| Carteira no motor | Pesos-alvo do perfil, rebalanceados todo ano | CADM: igual. AI: pesos da carteira atual por classe |
| Custo na simulação | Taxa de gestão de 0,80% | CADM: taxa do contrato. AI: custo anual por cliente, padrão de 0,80% até o comitê definir |
| Variação do mês | Atribuição só na v2 | "O que mudou no mês" é o centro do relatório CADM e aparece em uma linha no app AI |
| Ordem das fases | Telas, servidor, clientes | Relatório de exemplo, ciclo mensal interno, app AI, piloto |

Continuam iguais: o motor da Fase 0 (com as mudanças da Fase 1) e seus testes, as premissas versionadas pelo comitê, os princípios do SPEC (simulação não é recomendação, reprodutível, incerteza à vista, privado por padrão) e a stack. O nome do produto passa a ser AWARE Objective em toda a documentação; "gêmeo financeiro" segue como nome do motor.

## Primeira tarefa: atualizar a documentação

Antes de qualquer código, o Claude Code confirma que a Fase 0 está verde e reescreve a documentação do repositório para a nova rota. Nada em `src/engine` muda nesta etapa.

1. Ler `CLAUDE.md`, `docs/SPEC.md`, `docs/PROGRESSO.md`, `docs/DECISOES.md`, `docs/ROTA-2.md`, a pasta `.claude/`, o código de `src/engine` e os testes.
2. Rodar `npm run typecheck`, `npm run lint`, `npm test` e `npm run reference` e mostrar a saída. Se algo falhar, parar e relatar.
3. Registrar em `docs/DECISOES.md`: "02/10/2026, Rota 2: app para os clientes AI; relatório mensal da gestão para os clientes CADM. Decisão de Murilo Brito."
4. Propor as mudanças em `docs/SPEC.md` e mostrar o diff antes de gravar. O SPEC precisa ficar completo sozinho, porque o comando `/fase` só lê o SPEC e o PROGRESSO.
   1. Linha 3: a fonte do SPEC passa a ser o próprio repositório; a Rota 2 fica registrada em `docs/ROTA-2.md`.
   2. Reescrever Papel e missão, Contexto do negócio, Visão do produto, Usuários e permissões e Telas e funcionalidades com os dois canais.
   3. Em Motor de simulação e Família Andrade: as mudanças da seção "Motor no ciclo mensal", marcadas "a partir da Fase 1".
   4. Em Benchmark pessoal: trocar "v2, atribuição da variação" pela ponte desta rota e "após cada importação" por "na rodada oficial do mês fechado".
   5. Em Dados e integrações: aportes e resgates, posições dos clientes AI, plano corrigido pelo IPCA e as tabelas novas.
   6. Atualizar Segurança, LGPD e compliance, Stack técnica, Testes e critérios de aceite, Design e linguagem (os exemplos que citam o Alex), Plano de entrega por fases, Mensagens prontas, Fora de escopo e Perguntas em aberto.
   7. Manter os números de Resultados de referência: a Fase 1 os atualiza junto com `reference/`.
5. Atualizar `CLAUDE.md`: a primeira linha (o produto e os dois canais), os branches das fases (`fase-1-relatorio-exemplo`, `fase-2-ciclo-mensal`, `fase-3-app-ai`, `fase-4-piloto`), a regra de textos, que passa a valer para o relatório e para o app, e a exceção "`reference/` não se edita, exceto na mudança isolada da Fase 1 aprovada por Murilo". Manter o arquivo curto.
6. Atualizar `.claude/skills/fase/SKILL.md` (fases de 0 a 4 e o nome AWARE Objective) e `.claude/agents/revisor-motor.md` (pesos explícitos, sorteios alinhados por trajetória e passo de 12 meses).
7. Trocar o nome do produto para AWARE Objective em `CLAUDE.md`, `README.md` e `docs/SPEC.md`.
8. Atualizar `docs/PROGRESSO.md`: Fase 0 concluída, com data e commit, e a tabela das novas fases com seus portões.
9. Fazer o commit no branch `rota-2-docs` e parar.

## Canal 1: relatório mensal dos clientes CADM

Todo mês, cada família CADM recebe um relatório que responde duas perguntas: o plano continua de pé, e o que mudou desde o mês passado. A gestão prepara, revisa, aprova e apresenta; o cliente não acessa sistema nenhum.

> Diagrama "O relatório só sai conferido e aprovado por uma segunda pessoa" (fluxo do relatório CADM, 8 passos): 1. Importar (posições e fluxos) → 2. Conferir (PL bate com extrato) → 3. Rodar o mês (motor e ponte) → 4. Rascunho (números congelados) → 5. Revisão (comentário e E se?) → 6. Aprovação (outra pessoa aprova) → 7. Apresentar (reunião ou PDF) → 8. Arquivar (PDF e números). Volta "PL não bate": de 2 para 1. Volta "número estranho": de 5 para 2.

Duas voltas seguram o relatório: PL que não bate com o extrato volta para a importação, e número estranho na revisão volta para a conferência.

### Fluxo do mês

1. **Importar** as posições e os aportes e resgates do mês (seção "Dados mensais").
2. **Conferir**, família por família: o PL bate com o extrato (tolerância de 0,01%), todo ativo tem classe e o plano foi revisado nos últimos 12 meses (se não, aviso, sem bloquear). Família reprovada fica fora do fechamento, com aviso, sem segurar as outras.
3. **Rodar o mês**: rodada oficial e ponte "o que mudou", só com o IPCA oficial do mês, gravadas com semente, versão do motor, versão das premissas e hash das entradas.
4. **Rascunho**: o sistema monta o relatório com os números congelados da rodada.
5. **Revisão**: quem prepara escreve o comentário da gestão e escolhe até três cenários "E se?" para a conversa. Número estranho volta para a conferência.
6. **Aprovação**: outra pessoa da gestão aprova (quatro olhos). Aprovado, vira PDF; números, PDF e comentário não mudam mais, e corrigir = nova versão com motivo.
7. **Apresentar**: na reunião, em modo apresentação e com o "E se?" ao vivo no console, ou por PDF enviado pela gestão. O sistema registra data e forma.
8. **Arquivar**: PDF e números congelados ficam guardados pelo prazo que compliance definir.

### Conteúdo do relatório

Sete páginas em A4 paisagem. "A chance" é sempre a probabilidade de sucesso do plano sem gasto flexível; com as regras de gasto flexível ligadas, a chance com ajustes em anos ruins aparece ao lado, como informação secundária.

| Página | Pergunta | Conteúdo |
|---|---|---|
| 1. Capa | De quem e de quando? | Família, mês ("set/2026"), data das posições, versão das premissas, gestor responsável |
| 2. Resumo | O plano continua de pé? | Chance do plano com selo de faixa e variação no mês; benchmark pessoal, retorno esperado da carteira e folga; frase de leitura |
| 3. O que mudou | Por que a chance mudou? | Ponte em cascata da chance do mês anterior até a atual, por fator, com uma frase automática |
| 4. Carteira | A carteira entrega o que o plano exige? | Rentabilidade real no mês, no ano, em 12 meses e desde o início, contra o benchmark pessoal acumulado no mesmo período (CDI como referência secundária); patrimônio por classe contra o perfil |
| 5. Trajetória | Onde a família está e para onde vai? | Patrimônio realizado desde o início do acompanhamento, seguido do leque projetado (cenário ruim, do meio e bom), por idade |
| 6. Conversa do mês | O que discutir? | Até três cenários "E se?" escolhidos pela gestão, com chance e benchmark; comentário da gestão; dados do plano a atualizar |
| 7. Notas | Como ler os números? | Premissas vigentes, metodologia em linguagem simples e aviso legal |

### O que mudou no mês

A variação da chance é separada trocando um grupo de entradas por vez, nesta ordem fixa e com os mesmos sorteios. Cada entrada pertence a um único passo, o estado inicial é a rodada oficial do mês anterior e o final é a rodada oficial do mês; por isso, a soma dos passos é exatamente a variação total.

1. **Passagem do tempo**: nova data de referência; patrimônio e plano corrigidos pelo IPCA do mês; o fluxo líquido que o plano previa para o mês entra no patrimônio.
2. **Mercado**: igual ao passo 1, com a rentabilidade nominal do mês (Dietz) no lugar do IPCA.
3. **Aportes e resgates fora do plano**: patrimônio do fechamento.
4. **Carteira**: pesos por classe e custo (`fee_rate`). Na CADM, só muda se o perfil ou a taxa mudarem.
5. **Plano**: versão do plano, horizonte, legado, regras de gasto flexível e bens declarados.
6. **Premissas**: versão das premissas vigente no fechamento.

Regras da ponte:

- Sorteios alinhados por trajetória e semente fixa por família, a mesma todos os meses (seção "Motor no ciclo mensal"). Rodada oficial com 10.000 trajetórias (configurável).
- A ponte parte do número publicado no mês anterior. Se o motor atual recalcular outro valor, a primeira barra é "Atualização do método".
- As barras são contadas em trajetórias, números inteiros, para a soma fechar sem erro de arredondamento. Testes: o estado inicial tem o hash de entradas da rodada oficial anterior, e o final, o da rodada oficial do mês.
- Na página 3, tudo em pontos percentuais com uma casa, inclusive os dois extremos; o resíduo de arredondamento vai para a maior barra. Efeito menor que 0,05 p.p. aparece como "sem efeito".
- A frase automática cita o maior fator e só fala de aportes e resgates fora do plano. Exemplo ilustrativo, não valor esperado de teste: "A chance foi de 92,6% para 91,4% em outubro, principalmente pelo resgate de R$ 300 mil fora do plano (−0,9 p.p.). O plano continua na faixa verde."
- A mesma ordem decompõe a variação do benchmark pessoal, citada em uma frase quando passar de 0,1 p.p.
- Primeiro mês da família: sem ponte, com a frase "primeiro mês do acompanhamento".
- O módulo da ponte é puro (`src/report/attribution.ts`) e só chama o motor.

### Regras do relatório

- Texto automático nunca recomenda produto, ativo ou alocação. O comentário da gestão é o único texto livre e passa por quem aprova.
- Quem prepara não aprova o mesmo relatório.
- Toda página com número mostra a data das posições e a versão das premissas.
- PDF em A4 paisagem, legível na tela e impresso.
- Um único componente de layout gera o PDF a partir dos números congelados. Padrão: @react-pdf/renderer no navegador do console, sem servidor de PDF, com os gráficos desenhados nos componentes `<Svg>` dele (o Recharts não roda no react-pdf). Outra opção entra no plano da Fase 1 e vai para `docs/DECISOES.md`.
- O modo apresentação mostra o próprio PDF em tela cheia; o "E se?" ao vivo usa a tela do console.
- O envio ao cliente fica fora do sistema na primeira versão: a gestão baixa o PDF e envia pelos canais de hoje.

## Canal 2: app dos clientes AI

Os clientes AI usam as telas de cliente do SPEC (1 a 7), com os ajustes abaixo: veem os números oficiais do mês e simulam no próprio celular. Familiar convidado e "Pergunte ao plano" com IA ficam para depois do piloto.

| Tela | Para o cliente AI |
|---|---|
| Entrar | Convite do responsável pelo cliente (assessor ou banker); e-mail, senha e segundo fator; sessão de 30 minutos |
| Visão geral | Como no SPEC, mais a variação do mês com o maior fator da ponte ("−2 p.p. em setembro, principalmente mercado") |
| E se? | Como no SPEC. Perfil simulável: só "carteira atual", até compliance aprovar perfis-modelo para clientes AI (nova coluna `households.suitability`) |
| Patrimônio | Carteira na corretora por classe, em % e R$, e outros bens declarados; rentabilidade real realizada contra o benchmark pessoal. Sem alocação-alvo |
| Plano | Como no SPEC: o cliente sugere mudanças e o responsável confirma |
| Como calculamos | Como no SPEC, mais duas frases: a simulação usa a carteira atual por classe, rebalanceada uma vez por ano; e o custo considerado, se houver |
| Histórico | Série mensal da chance e do benchmark pessoal, com a rentabilidade real realizada |

Regras do canal:

- **Pesos no motor:** a carteira atual por classe, sobre todo o patrimônio simulado (posições na corretora mais bens financeiros declarados). Os pesos explícitos são uma das mudanças do motor na Fase 1.
- **Custo:** `fee_rate` por cliente. Padrão nos clientes AI: 0,80% ao ano, o mesmo da CADM, marcado "a validar" até o comitê definir, porque as premissas são de índices e não descontam o custo dos produtos.
- **Números do mês:** vêm da mesma rodada oficial do ciclo mensal usada no relatório CADM. O "E se?" mostra a chance oficial e a diferença calculada no aparelho: cenário menos plano oficial, os dois com 5.000 trajetórias e os mesmos sorteios.
- **Sem recomendação:** o app nunca sugere produto, ativo ou alocação. Para decisões, a frase padrão manda falar com o assessor.
- **Identidade:** marca da Aware e, se compliance exigir, a do intermediário (ver "Segurança, LGPD e comunicação").
- **Celular primeiro:** tela inicial em 375 px, temas claro e escuro, como no SPEC.

## Dados mensais

O ciclo mensal recebe duas planilhas por canal, posições por ativo e aportes e resgates do mês, e só libera a rodada quando o PL de cada família bate com o extrato.

| Dado | CADM | AI |
|---|---|---|
| Posições por ativo | Controle interno da gestão, a mesma base do reporte à ANBIMA | Posições na corretora: exportação do portal do assessor ou extrato mensal (formato a confirmar) |
| Aportes e resgates | Mesmas regras do reporte CADM à ANBIMA | Movimentações da conta na corretora, com as mesmas regras |
| PL para conferência | Extrato oficial de cada custodiante | Extrato da corretora |
| Plano da família | Gestão cadastra antes do primeiro relatório | Responsável cadastra antes do convite |

As posições seguem o modelo de colunas do SPEC (Importação mensal das posições). Aportes e resgates usam este modelo (linhas fictícias):

```csv
data_referencia,codigo_cliente,custodiante,data_movimento,tipo,valor,moeda,descricao
2026-10-31,AND001,Custodiante A,2026-10-15,resgate,300000.00,BRL,Resgate para reforma
```

- `tipo` é aporte ou resgate, sempre com valor positivo.
- Transferências entre contas da mesma família se anulam. Taxas, impostos e pagamentos à Aware não são aporte nem resgate: são as regras que a gestão já usa no reporte CADM à ANBIMA.
- Rentabilidade do mês por Dietz modificado com as datas dos movimentos, deflacionada pelo IPCA, como no Termômetro mensal do SPEC. Sem data do movimento, assumir o meio do mês e marcar "datas aproximadas".
- Conferência: o PL oficial é informado por família e mês, e a soma do valor líquido das posições precisa bater com ele, com tolerância de 0,01%. Diferença maior bloqueia só aquela família.
- Plausibilidade: rentabilidade real do mês fora da faixa de −10% a +10% pede confirmação de quem importou.
- Ativo sem classe, moeda estrangeira e reimportação seguem o SPEC: fila do comitê, dólar de venda do Banco Central e substituição do mês com registro na auditoria.
- Status por família e mês (importado, conferido, bloqueado, rodado, fechado) e por canal (aberto, fechado). Só família fechada alimenta relatório e app; família bloqueada fica de fora, com aviso.
- Meses anteriores podem ser importados, se houver, para formar a rentabilidade desde o início.

## Motor no ciclo mensal

Quatro mudanças evitam que o sorteio ou o calendário, e não a família, movam a chance de um mês para o outro: três no motor e uma na montagem das entradas. Cada uma é um commit separado, e as do motor passam pelo `revisor-motor`.

1. **Pesos explícitos.** O motor aceita pesos por classe, além do `profileId`. Com os pesos do perfil, o resultado é idêntico, bit a bit.
2. **Sorteios alinhados por trajetória.** Hoje um único gerador corre todas as trajetórias, e a trajetória que falha para de sortear; qualquer mudança nas entradas desloca os sorteios das seguintes. Novo: a trajetória i usa um gerador próprio, semeado com a semente da família e i, e o ano t usa sempre o t-ésimo sorteio dele. Mudar patrimônio, plano, pesos, premissas ou horizonte nunca muda os sorteios. Testes: entradas diferentes com a mesma semente geram os mesmos sorteios, e um resgate de R$ 1 mil nunca aumenta a chance.
3. **Passo de 12 meses.** Hoje o passo 0 aplica o fluxo do ano civil inteiro, mesmo com a data de referência em setembro, e conta de novo o que já aconteceu no ano. Novo:
   - data de referência = último dia do mês de competência;
   - o passo t cobre os 12 meses seguintes à data de referência mais t anos; o último termina no mês em que o membro mais jovem atinge a idade-limite e pode ter m < 12 meses, com retorno (1 + R)^(m/12) − 1;
   - fluxos e eventos anuais entram pro rata, pelos meses do seu ano civil que caem no passo;
   - evento único e cada ocorrência de "a cada N anos" entram no seu mês (nova coluna `events.month`; sem mês, julho); evento sem mês com julho já passado gera aviso na conferência;
   - aposentado no passo t = aposentadoria antes do início do passo; os "últimos 15 anos" do gasto flexível passam a ser os últimos 15 passos.
4. **Plano corrigido pelo IPCA**, fora de `src/engine`, na montagem das entradas em `src/report`. Cada versão do plano guarda o mês-base dos valores; a rodada aplica o IPCA acumulado do mês seguinte ao mês-base até o mês de referência. Sem isso, o gasto encolheria em termos reais todo mês. O patrimônio realizado da página 5 também vai para reais da data de referência.

O motor de referência em Python e `reference/resultados_referencia.json` são atualizados com os itens 2 e 3, numa mudança isolada aprovada por Murilo; é a única exceção à regra de não editar `reference/`. Os números da Família Andrade mudam: o benchmark pessoal sai de IPCA + 2,98% para cerca de IPCA + 3,25% (sem legado, de 2,77% para cerca de 3,05%), e a chance cai junto, porque a convenção antiga contava de novo os fluxos de janeiro a setembro de 2026 e encerrava o plano em dezembro de 2070, não em agosto de 2071. Os testes 1 a 12 e 14 devem continuar passando; se algum depender da convenção antiga, mostrar antes de alterar.

## Arquitetura e modelo de dados

Os dois canais dividem banco, motor e ciclo mensal. Muda quem enxerga o quê: a gestão opera tudo pelo console interno, e o cliente AI só lê a própria família no app.

### Componentes

- **Console interno** (gestão, comitê, compliance, bankers e responsáveis): cadastros, plano, importação, fechamento do mês, rodada oficial, relatórios, premissas e modo apresentação.
- **App do cliente AI**: as rotas do cliente, celular primeiro.
- Os dois saem do mesmo projeto Vite, com dois pontos de entrada; o código do console não entra no pacote do app do cliente.
- **Motor** em `src/engine`: num Web Worker no navegador e, nas Edge Functions, a mesma cópia levada por `npm run sync:engine`.
- **Supabase**: Postgres com políticas de acesso por linha, Auth com segundo fator, Storage privado (planilhas e PDFs) e Edge Functions para importação, dados de mercado e rodada oficial.
- **Onde roda a rodada oficial**: numa Edge Function, uma requisição por rodada (cada passo da ponte é uma rodada), o que também serve ao recálculo de todas as famílias quando o comitê publica premissas. As Edge Functions têm limite de 2 s de CPU por requisição ([limites do Supabase](https://supabase.com/docs/guides/functions/limits)); uma rodada de 10.000 trajetórias deve caber, e isso é medido na Fase 2, etapa 3. Se não couber: a rodada roda no console, quem aprova refaz no próprio navegador, e o servidor só grava se a versão do motor for a publicada e o hash dos resultados bater.

### Papéis

| Papel | Vê | Pode | Não pode |
|---|---|---|---|
| Gestão | Todas as famílias, CADM e AI | Importar, conferir, rodar o mês, editar planos, preparar e aprovar relatórios (não o próprio) | Mudar premissas sem o comitê; mudar números de relatório aprovado |
| Comitê (admin) | Todas as famílias | Criar e aprovar versões de premissas, perfis e mapeamento de ativos; gerenciar usuários | Apagar a auditoria |
| Compliance | Tudo, só leitura, mais a auditoria | Aprovar textos e o modelo do relatório | Editar dados de clientes |
| Banker da CADM (Alex e outros) | As suas famílias CADM e os relatórios delas | Comentar o rascunho e acompanhar a apresentação | Aprovar relatório ou mudar números |
| Responsável pelo cliente AI | Só as suas famílias AI | Convidar, editar o plano, confirmar sugestões | Ver famílias de outros responsáveis ou relatórios CADM |
| Cliente AI | Só a própria família | Usar o "E se?", salvar cenários pessoais, sugerir mudanças no plano | Ver relatórios, auditoria, premissas editáveis ou outras famílias |

O cliente CADM não tem conta: recebe o relatório da gestão.

### Mudanças no modelo de dados

| Tabela | Mudança | Para quê |
|---|---|---|
| `households` | Colunas `channel` (cadm, ai), `owner_id`, `intermediary`, `weights_source` (perfil, carteira_atual), `suitability` e `seed` | Canal, responsável e regras do motor por família |
| `user_roles` | Papéis gestao, comite, compliance, banker, responsavel e cliente_ai | Acesso por papel e por família |
| `events` | Coluna `month` (1 a 12, opcional) | Passo de 12 meses |
| `plan_versions` | Coluna `base_month` (mês-base dos valores) | Correção do plano pelo IPCA |
| `flows` (nova) | household_id, batch_id, ref_date, custodian, flow_date, kind (aporte, resgate), amount, currency, description | Rentabilidade e ponte |
| `household_months` (nova) | household_id, ref_date, official_pl, status (importado, conferido, bloqueado, rodado, fechado), note | Conferência e status por família |
| `month_closings` (nova) | ref_date, channel, status (aberto, fechado), opened_by, closed_by, closed_at | Fechamento do canal |
| `monthly_snapshots` | Colunas `run_id`, `realized_return_real` e `attribution` (jsonb com os passos da ponte) | Termômetro e ponte |
| `reports` (nova) | household_id, ref_date, version, status (rascunho, em_revisao, aprovado, apresentado, substituido), prepared_by, approved_by, approved_at, presented_at, presented_how, snapshot (jsonb), pdf_path, comment, scenarios (jsonb), supersedes_id, reason | Relatório com números travados depois de aprovado |

- Depois de aprovado, o relatório só aceita mudança de status (apresentado, substituído) e dos campos de apresentação; números, PDF e comentário ficam travados por gatilho, e delete é negado. Teste pgTAP.
- O papel cliente_ai não lê `reports`, `audit_log`, famílias CADM nem dados de outra família, com teste pgTAP de vazamento para esse papel.
- PDF baixado por link assinado de curta duração, com registro na auditoria.

## Novo roteiro de fases

Quatro fases depois da Fase 0, cada uma com portão de saída: primeiro o relatório com dados de exemplo, depois o ciclo mensal interno com dados reais, depois o app AI e, por fim, o piloto. O relatório vem antes do app porque é de uso interno e não depende de login de cliente.

> Diagrama "O relatório chega aos clientes CADM antes de o app chegar aos clientes AI" (roteiro: 5 fases e portões):
> - **Fase 0 · Fundação e motor** (concluída): motor, testes 1 a 14 e resultados de referência da Família Andrade. Portão cumprido: testes do motor e referência dentro das tolerâncias.
> - **Fase 1 · Relatório de exemplo, sem servidor** (próxima): ajustes do motor, dois fechamentos da Andrade, ponte, PDF e modo apresentação. Portão: ponte com soma exata e PDF de out/2026 aprovado por Murilo e Alex.
> - **Fase 2 · Ciclo mensal interno, com dados reais**: Supabase, importação e conferência, rodada do mês e relatórios com quatro olhos. Portão: pgTAP, família CADM real anonimizada conferida, relatório e textos aprovados.
> - **Fase 3 · App dos clientes AI**: telas do cliente, convite, segundo fator e acesso só à própria família. Portão: 375 px e tema escuro, E se? em menos de 1 s, vazamento do cliente AI bloqueado.
> - **Fase 4 · Piloto e operação**: teste de invasão, textos aprovados e piloto com 3 a 5 famílias por canal. Portão: dois fechamentos sem erro e retorno do piloto antes de ampliar.

Cada fase só começa com o portão da anterior cumprido; a próxima é a Fase 1.

### Fase 1: relatório de exemplo, sem servidor

Branch `fase-1-relatorio-exemplo`.

- As quatro mudanças da seção "Motor no ciclo mensal", nesta ordem e em commits separados: pesos explícitos; sorteios alinhados por trajetória; passo de 12 meses, com o motor de referência e os resultados atualizados; plano corrigido pelo IPCA em `src/report`.
- Família Andrade em dois fechamentos fictícios, em `src/data/`: setembro/2026, como está, e outubro/2026, com patrimônio por classe no fechamento coerente com rentabilidade real de cerca de −2,5% no mês (IPCA fictício de 0,40%), resgate de R$ 300 mil em 15/10, VGBL com valor real constante e nova versão do plano, com mês-base outubro, subindo o estilo de vida de R$ 30 mil para R$ 35 mil por mês.
- Rentabilidade do mês (Dietz modificado e IPCA) e ponte "o que mudou" em `src/report`, como módulos puros com testes.
- As sete páginas do relatório, o PDF e o modo apresentação, com os textos automáticos.
- **Portão:** testes do motor e `npm run reference` passando com os resultados novos; testes da ponte (hashes dos extremos e soma em trajetórias); `revisor-motor` sem divergências; PDF de outubro/2026 da Andrade aprovado por Murilo e Alex.

### Fase 2: ciclo mensal interno, com dados reais

Branch `fase-2-ciclo-mensal`. O projeto na nuvem (região São Paulo) só nasce com autorização de Murilo.

1. Supabase local: migrações (SPEC mais as mudanças desta rota), políticas por linha, segundo fator para usuários internos e testes pgTAP (vazamento entre famílias e relatório aprovado imutável).
2. Importação de posições e de aportes e resgates, conferência, mapeamento de ativos e fechamento do mês.
3. Console: famílias por canal, editor do plano, rodada oficial do mês em lote, uma Edge Function por rodada, com o tempo de CPU medido; rotinas de CDI, IPCA e dólar.
4. Relatórios no banco: rascunho, revisão, aprovação com quatro olhos, PDF no Storage, registro da apresentação e trilha de auditoria.

**Portão:** pgTAP passando; uma família CADM real, anonimizada, importada, conferida e com relatório aprovado; textos do relatório aprovados por compliance; rodada do mês de todas as famílias CADM em menos de 20 minutos num computador da gestão.

### Fase 3: app dos clientes AI

Branch `fase-3-app-ai`.

- Telas do cliente (Entrar, Visão geral, E se?, Patrimônio, Plano, Como calculamos e Histórico), primeiro com a Família Andrade e depois ligadas ao banco.
- Convite pelo responsável, segundo fator do cliente e políticas por linha para o papel cliente_ai.
- Ajustes do canal: carteira atual no motor, custo por cliente, linha da ponte na Visão geral e identidade conforme compliance.
- **Portão:** tela inicial em 375 px e no tema escuro; "E se?" em menos de 1 s num celular intermediário; teste de vazamento do papel cliente_ai passando; uso de ponta a ponta com contas fictícias.

### Fase 4: piloto e operação

Branch `fase-4-piloto`.

- Teste de invasão independente antes de carregar dados reais na nuvem, inclusive as famílias CADM do piloto; termos de uso e política de privacidade; textos aprovados pela compliance da Aware e, se exigido, pela corretora.
- Piloto por dois fechamentos: relatório para 3 a 5 famílias CADM e app para 3 a 5 clientes AI.
- E-mail mensal ao cliente AI avisando que os números do mês saíram, sem valores no corpo.
- **Portão:** dois fechamentos sem erro de conferência e retorno da gestão e dos clientes do piloto. Depois do piloto: familiar convidado, "Pergunte ao plano", longevidade e impostos.

## Perguntas em aberto

Enquanto não houver resposta, o Claude Code usa o padrão indicado e registra em `docs/DECISOES.md`.

- [ ] Clientes AI: qual corretora e como sai a posição mensal (exportação, extrato ou API)? Padrão: planilha no modelo do SPEC.
- [ ] Custo anual dos clientes AI na simulação. Padrão: 0,80% ao ano, marcado "a validar".
- [ ] Quem é o responsável pelo cliente AI no sistema: o assessor, o banker ou os dois? Padrão: um responsável por família.
- [ ] O app conta como material do assessor e precisa da marca ou da aprovação da corretora? Padrão: tratar como material do assessor.
- [ ] Perfis-modelo do comitê podem aparecer no "E se?" do cliente AI? Padrão: não, só a carteira atual.
- [ ] Quem na gestão prepara e quem aprova os relatórios, e qual o papel do banker da CADM? Padrão: duas pessoas diferentes da gestão; o banker vê e comenta.
- [ ] Todas as famílias CADM recebem o relatório todo mês, ou só as que têm reunião? Padrão: todas, todo mês.
- [ ] Quais famílias entram no piloto, CADM e AI? Padrão: só a Família Andrade.
- [ ] Logotipo, cores e modelo visual do relatório. Padrão: as cores do protótipo.

## Segurança, LGPD e comunicação

Valem todas as regras do SPEC. Esta rota acrescenta três: relatório aprovado é imutável, o cliente AI só enxerga a própria família, e o material para clientes AI segue também as regras da assessoria.

- **Relatório CADM:** quatro olhos, imutável depois de aprovado, PDF em bucket privado e download registrado. Nenhum dado sai do console além do PDF que a gestão envia.
- **Cliente AI:** convite do responsável, segundo fator obrigatório e sessão de 30 minutos. Nunca acessa relatórios CADM, auditoria ou outra família.
- **LGPD:** base legal, minimização (código interno, sem CPF), direitos do titular e retenção como no SPEC. A retenção passa a incluir os PDFs e os números congelados. Para clientes AI, a base legal precisa ser confirmada com o encarregado, porque não há contrato de gestão.
- **Assessoria de investimento:** pela Resolução CVM 178, o assessor atua como preposto e sob a responsabilidade do intermediário que o contrata. Segundo a área técnica da CVM, o material de divulgação do assessor deve mostrar de forma nítida o intermediário, com as logomarcas em destaque ([CVM, interpretações da Resolução 178](https://www.gov.br/cvm/pt-br/assuntos/noticias/2024/area-tecnica-da-cvm-divulga-interpretacoes-relacionadas-a-resolucao-178-marco-regulatorio-dos-assessores-de-investimento)). Essa interpretação não trata de aplicativos; compliance decide, antes da Fase 3, se o app entra nela.
- **Desenvolvimento:** dados reais nunca entram no repositório nem nas conversas com o Claude Code.

### Textos novos (rascunhos para compliance aprovar)

- **Rodapé do relatório:** "Relatório de acompanhamento do plano, preparado pela gestão da Aware Investments com as posições de [mês] e as premissas [versão]. Simulação ilustrativa; não é promessa de rentabilidade nem recomendação de investimento."
- **Página "O que mudou":** "A variação foi separada trocando um fator de cada vez. A ordem dos fatores muda a divisão entre eles, não o total."
- **Primeiro relatório:** "Este é o primeiro mês do acompanhamento. A partir do próximo, mostramos o que mudou de um mês para o outro."
- **Rodapé do app AI:** "Simulação com base na sua carteira atual. Não é recomendação de investimento; para decisões, fale com seu assessor."

## Mensagem de abertura

Cole numa conversa nova do Claude Code, com o modo de planejamento ligado, depois de salvar este documento em `docs/ROTA-2.md`:

> Leia CLAUDE.md, docs/SPEC.md, docs/PROGRESSO.md, docs/DECISOES.md, docs/ROTA-2.md e a pasta .claude/. A Fase 0 está concluída e o projeto mudou de rota: o app passa a ser dos clientes AI, e os clientes CADM recebem um relatório mensal preparado e apresentado pela gestão. Nesta conversa, faça só a "Primeira tarefa: atualizar a documentação" da ROTA-2: rode typecheck, lint, testes e npm run reference e me mostre a saída; registre a decisão em docs/DECISOES.md; proponha as mudanças em docs/SPEC.md, CLAUDE.md, README.md, docs/PROGRESSO.md, .claude/skills/fase/SKILL.md e .claude/agents/revisor-motor.md e me mostre o diff antes de gravar. Não mude nada em src/engine nem em reference/. No fim, faça o commit no branch rota-2-docs e pare.

Depois, cada fase começa com `/fase N` numa conversa nova. Sem o comando, use estas mensagens:

- **Fase 1:** "Fase 1 da ROTA-2: relatório de exemplo, sem servidor. Comece pelas quatro mudanças de Motor no ciclo mensal, em commits separados e nesta ordem: pesos explícitos, sorteios alinhados por trajetória, passo de 12 meses (com o motor de referência e os resultados de referência atualizados numa mudança isolada) e plano corrigido pelo IPCA. Me mostre os números antes e depois de cada mudança no motor e peça a revisão do revisor-motor. Depois crie os dois fechamentos fictícios da Família Andrade, a rentabilidade do mês e a ponte em src/report, com testes, e por fim as sete páginas, o PDF e o modo apresentação. Me mostre o plano antes de editar."
- **Fase 2, etapa 1:** "Fase 2, etapa 1: Supabase local com as migrações do SPEC e da ROTA-2, políticas por linha, segundo fator para usuários internos e testes pgTAP, incluindo vazamento entre famílias e relatório aprovado imutável. Vou deixar o Docker aberto. Nada na nuvem."
- **Fase 2, etapa 2:** "Fase 2, etapa 2: importação de posições e de aportes e resgates, conferência, mapeamento de ativos e fechamento do mês."
- **Fase 2, etapa 3:** "Fase 2, etapa 3: console com famílias por canal, editor do plano, rodada oficial do mês em lote, uma Edge Function por rodada, medindo o tempo de CPU, e rotinas de CDI, IPCA e dólar."
- **Fase 2, etapa 4:** "Fase 2, etapa 4: relatórios no banco, com rascunho, revisão, aprovação por quatro olhos, PDF no Storage, registro da apresentação e auditoria."
- **Fase 3:** "Fase 3 da ROTA-2: app dos clientes AI. Primeiro as telas com a Família Andrade, depois ligadas ao banco, com convite, segundo fator e políticas para o papel cliente_ai. A tela inicial precisa funcionar em 375 px e no tema escuro."
- **Fase 4:** "Fase 4 da ROTA-2: prepare o piloto com termos de uso, e-mail mensal sem valores e os checklists do teste de invasão e do fechamento mensal. Nada vai para clientes sem minha autorização."

## Fontes

Consultadas em 02/10/2026.

- [Supabase: limites das Edge Functions](https://supabase.com/docs/guides/functions/limits): 2 s de CPU por requisição, 256 MB de memória.
- [CVM: interpretações da Resolução 178](https://www.gov.br/cvm/pt-br/assuntos/noticias/2024/area-tecnica-da-cvm-divulga-interpretacoes-relacionadas-a-resolucao-178-marco-regulatorio-dos-assessores-de-investimento): assessor como preposto do intermediário e material que mostra o intermediário de forma nítida.
