# AWARE Objective: especificação

> Fonte única da especificação do AWARE Objective, mantida neste repositório. Ela nasceu do documento "Prompt do Gêmeo Financeiro" (02/10/2026, @Murilo) e foi atualizada pela Rota 2 (02/10/2026, D-024), registrada em `docs/ROTA-2.md`. As doações saíram do projeto (D-005). "Gêmeo financeiro" segue como nome do motor. Os diagramas aparecem como descrição em texto.

## Papel e missão

Você é um engenheiro full-stack sênior com experiência em produtos financeiros e em modelagem quantitativa de planejamento patrimonial. Sua missão é construir o **AWARE Objective**, da Aware Investments: um produto com dois canais sobre o mesmo motor de simulação (o gêmeo financeiro) e o mesmo ciclo mensal.

- **Canal 1, relatório mensal dos clientes CADM.** Todo mês, a gestão prepara, aprova e apresenta a cada família de carteira administrada um relatório que mostra se o plano continua de pé e o que mudou desde o mês passado. O cliente CADM não acessa sistema nenhum.
- **Canal 2, app dos clientes AI.** Um app web, responsivo e pensado primeiro para celular, em que o cliente da assessoria de investimentos vê a chance de manter o padrão de vida até o fim do horizonte, o retorno real que a carteira precisa entregar e o efeito de decisões hipotéticas.

A gestão opera o ciclo mensal e os relatórios por um console interno. Você trabalha neste repositório pelo Claude Code: lê e edita arquivos, roda comandos e testes e faz commits.

Como trabalhar:

1. Antes de cada fase, leia em `docs/SPEC.md` a fase em "Plano de entrega por fases" e as seções que ela cita. Apresente um plano (etapas, arquivos, comandos e como vai provar que funcionou) e só implemente depois da aprovação.
2. O motor de simulação é o coração do produto. Ele é um módulo TypeScript puro em `src/engine`, sem dependência de interface, com testes unitários. O relatório, o console e o app só consomem o motor; a montagem das entradas do mês e a ponte ficam em `src/report`, também puros.
3. Uma etapa só está pronta com evidência: checagem de tipos, lint e testes passando, com a saída dos comandos. O motor também precisa bater com `reference/resultados_referencia.json`.
4. Quando algo estiver ambíguo, escolha a opção mais conservadora, registre a decisão em `docs/DECISOES.md` e siga. Pergunte só quando a decisão afetar dados de clientes, segurança, compliance ou custos.
5. Peça confirmação antes de criar recursos em nuvem, contratar serviços pagos, rodar comandos destrutivos fora do ambiente local ou apagar arquivos.
6. Nunca invente dados de mercado nem parâmetros tributários. Use os valores desta especificação, sempre configuráveis, ou deixe o campo editável com o aviso "a validar".
7. Todo texto voltado ao cliente, no relatório e no app, é em português do Brasil, em linguagem simples.
8. Faça commits pequenos, com mensagens em português, num branch por fase. Ao fim de cada etapa, atualize `docs/PROGRESSO.md` com o que foi feito e o próximo passo, para que uma conversa nova retome sem perder o fio.
9. Ao fim de cada fase, entregue: o que foi feito, como testar e o que ficou pendente.

## Contexto do negócio

A Aware Investments é um multi-family office (MFO) brasileiro. O AWARE Objective atende dois grupos de clientes:

- **Clientes de carteira administrada (CADM)**, como os do banker Alex. Para eles a Aware tem mandato formal de gestão e posições organizadas todo mês, as mesmas que alimentam o reporte das carteiras administradas à ANBIMA. Recebem o relatório mensal.
- **Clientes da assessoria de investimentos (AI)** da Aware, com conta na corretora a que a assessoria é vinculada. Usam o app.

**Problema.** O cliente recebe relatórios de rentabilidade contra o CDI, mas não sabe se está no caminho dos seus objetivos de vida. Em anos ruins isso gera ansiedade, pedidos de resgate na hora errada e conversas presas à rentabilidade de curto prazo.

**Objetivo.** Trocar a pergunta "bati o CDI?" por "meu plano de vida continua de pé?". Sinais de sucesso:

- A gestão apresenta o relatório nas reuniões com cada família CADM, e a conversa parte dele.
- Clientes AI abrem o app sozinhos pelo menos uma vez por mês.
- Em quedas de mercado, as conversas passam a girar em torno da probabilidade do plano, e não do resultado do mês.

**Inspirações.**

- [Map My Money](https://apps.apple.com/us/app/map-my-money/id6758605068): app de iOS que se apresenta como um "GPS financeiro". Projeta o patrimônio ao longo dos anos, acompanha metas, simula cenários "e se" e eventos de vida, e mostra o custo de oportunidade de uma compra. Queremos a mesma clareza de trajetória, só que com carteira gerida e premissas institucionais.
- [Post no r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1serdlo/i_built_a_personal_finance_dashboard_using_claude/) sobre um dashboard de finanças pessoais feito com Claude. Serve de referência de que um painel completo é viável com IA; o conteúdo do post não foi conferido nesta especificação.

**O que já existe.**

- Um protótipo em HTML (`reference/gemeo.html`) com um cliente fictício: Monte Carlo com 2.000 cenários, um único retorno por perfil com distribuição normal, controles de "E se?", probabilidade de sucesso, benchmark pessoal e gráfico em faixa. Serve de referência de layout e comportamento; ainda traz "Doação anual", que saiu do projeto (D-005).
- O motor da Fase 0 em `src/engine` (classes de ativo correlacionadas, caudas grossas e gasto flexível), com os testes 1 a 14 e os resultados de referência da Família Andrade. Portão cumprido em 02/10/2026.
- Um motor de referência em Python (`reference/motor_referencia.py`) segue esta especificação e gera os números de aceite em `reference/resultados_referencia.json` (diferenças conhecidas em D-027).

**Custódia.** As carteiras ficam em custodiantes diferentes, no Brasil e no exterior. A v1 não se conecta a custodiantes nem à corretora: as posições e os aportes e resgates entram por importação mensal (ver "Dados e integrações"). Na CADM, vêm do controle interno da gestão, a mesma base do reporte à ANBIMA; na AI, das posições na corretora (formato a confirmar).

## Visão do produto

O produto tem três camadas: o **gêmeo financeiro** é o motor, o **benchmark pessoal** é a métrica e o **"E se?"** é a interface. Um **ciclo mensal** roda o motor com os dados do mês e alimenta dois canais.

> Diagrama "O motor calcula, a métrica resume e o E se? pergunta" (três camadas do produto: 3 entradas, 1 motor, 3 resultados). Três entradas alimentam o motor: **Carteira** (posições mensais importadas), **Plano da família** (renda, gastos e eventos) e **Premissas do comitê** (retorno, risco e correlação). O **Gêmeo financeiro** roda milhares de trajetórias simuladas até o horizonte, com classes correlacionadas. Saem três resultados: **Probabilidade** (chance de o plano durar), **Benchmark pessoal** (retorno real necessário) e **Trajetória** (faixas P10, P50 e P90). O **E se?** altera as hipóteses e o motor recalcula na hora.

> Diagrama "Um motor e um ciclo mensal alimentam os dois canais" (um motor, dois canais). Três entradas: **Posições e movimentos** (CADM: controle da gestão; AI: posições da corretora), **Plano da família** (renda, gastos e metas) e **Premissas do comitê** (retorno, risco e correlação). Elas alimentam o **Ciclo mensal**: importar e conferir → rodar o motor → ponte: o que mudou. O ciclo alimenta o **Relatório mensal CADM** (a gestão prepara, aprova e apresenta ao cliente) e o **App dos clientes AI** (o cliente vê o mês e simula no celular).

O relatório CADM e o app AI leem os mesmos números do mês, da mesma rodada oficial; muda só quem os vê e como chegam ao cliente.

- **Gêmeo financeiro (motor).** Um modelo da vida financeira da família, projetado até o fim do horizonte. Recebe a carteira, o plano da família e as premissas do comitê, e roda milhares de cenários de mercado.
- **Benchmark pessoal (métrica).** O retorno real (acima do IPCA) que a carteira precisa entregar para o plano dar certo. Substitui o CDI como régua principal. Vem acompanhado da probabilidade de sucesso e da trajetória em faixas.
- **"E se?" (interface).** O cliente AI no app, ou a gestão no console e na reunião, muda uma hipótese (aposentar antes, vender um imóvel, uma crise no 1º ano) e vê o efeito na hora. No relatório CADM, a gestão escolhe até três cenários para a conversa do mês.
- **Ciclo mensal.** Importar e conferir as posições e os movimentos do mês, rodar o motor (rodada oficial) e explicar o que mudou desde o mês anterior (a ponte).

| Tema | Canal 1: relatório CADM | Canal 2: app AI |
|---|---|---|
| Quem vê | O cliente recebe o relatório; a gestão apresenta | O próprio cliente, no celular |
| Quem opera o mês | Gestão: importa, confere, roda o mês e aprova os relatórios | Gestão, no mesmo ciclo mensal |
| Posições | Controle interno da gestão, a mesma base do reporte à ANBIMA | Posições na corretora (formato a confirmar) |
| Carteira no motor | Pesos-alvo do perfil, rebalanceados todo ano | Pesos da carteira atual por classe, rebalanceados todo ano |
| Custo na simulação | Taxa do contrato | Custo anual por cliente; padrão de 0,80%, "a validar" até o comitê definir |
| Variação do mês | "O que mudou no mês" é o centro do relatório | Uma linha na Visão geral |

Princípios que valem para todo o produto:

1. **Simulação não é recomendação.** O relatório e o app mostram consequências de hipóteses. Eles nunca dizem "compre", "venda" ou "mude sua alocação". Mudanças de carteira passam pela gestão (CADM) ou pelo assessor (AI).
2. **Premissas oficiais e versionadas.** Só o comitê altera retorno, risco e correlação. O cliente nunca mexe nelas. Toda versão tem data de vigência e aprovador.
3. **Reprodutível.** Qualquer número mostrado a um cliente pode ser recalculado igual: mesmas entradas, mesma versão de premissas, mesma semente aleatória.
4. **Incerteza à vista.** Mostrar faixas e probabilidades, nunca um único número como certeza.
5. **Conservador na dúvida.** Entre duas premissas razoáveis, use a pior para o cliente.
6. **Simples na superfície.** O resumo do relatório e a tela principal do app mostram três coisas: probabilidade, benchmark pessoal e trajetória. A mecânica fica em "Notas" (relatório) e "Como calculamos" (app).
7. **Privado por padrão.** Cada família vê só os próprios dados, e o sistema guarda o mínimo necessário.
8. **Celular primeiro no app; relatório legível na tela e impresso.** A maioria dos clientes AI vai abrir no telefone; o relatório sai em A4 paisagem.
9. **Quatro olhos.** O relatório só sai conferido e aprovado por uma segunda pessoa da gestão; aprovado, não muda mais.

## Usuários e permissões

Seis papéis, com acesso restrito por família no banco de dados (row level security), não só na interface. O cliente CADM não tem conta: recebe o relatório da gestão.

| Papel | Quem é | Vê | Pode | Não pode |
|---|---|---|---|---|
| Gestão | Equipe de gestão da Aware | Todas as famílias, CADM e AI | Importar, conferir, rodar o mês, editar planos, preparar e aprovar relatórios (não o próprio) | Mudar premissas sem o comitê; mudar números de relatório aprovado |
| Comitê (admin) | Gestão da Aware no comitê de investimentos | Todas as famílias | Criar e aprovar versões de premissas, perfis e mapeamento de ativos; gerenciar usuários | Apagar a trilha de auditoria |
| Compliance | Área de compliance | Tudo, só leitura, mais a trilha de auditoria | Aprovar os textos, o modelo do relatório e as versões de premissas | Editar dados de clientes |
| Banker da CADM | Alex e outros bankers | As suas famílias CADM e os relatórios delas | Comentar o rascunho e acompanhar a apresentação | Aprovar relatório ou mudar números |
| Responsável pelo cliente AI | Assessor ou banker (um por família; D-025) | Só as suas famílias AI | Convidar, editar o plano, confirmar sugestões | Ver famílias de outros responsáveis ou relatórios CADM |
| Cliente AI | Titular da família na assessoria | Só a própria família | Usar o "E se?", salvar cenários pessoais, sugerir mudanças no plano | Ver relatórios, auditoria, premissas editáveis ou outras famílias |

Depois do piloto entra o **familiar convidado**: cônjuge ou herdeiro convidado pelo cliente AI, que vê o que o titular liberar (com ou sem valores em reais) e usa o "E se?" sem salvar.

Regras de acesso:

- Toda tabela com dado de cliente tem `household_id` e política de acesso no banco. Testes automatizados: logado como cliente da família A, ler a família B precisa falhar; o papel cliente_ai não lê `reports`, `audit_log` nem famílias CADM.
- Todo acesso de gestão, comitê, compliance, banker ou responsável a dados de uma família é registrado (quem, quando, o quê).
- Toda tela do app e toda página do relatório com números mostram a data das posições e a versão das premissas.

## Telas e funcionalidades

Três frentes: o relatório mensal dos clientes CADM (canal 1), as sete telas do app dos clientes AI (canal 2) e o console interno, onde a gestão opera o ciclo mensal.

### Canal 1: relatório mensal dos clientes CADM

Todo mês, cada família CADM recebe um relatório que responde duas perguntas: o plano continua de pé, e o que mudou desde o mês passado. A gestão prepara, revisa, aprova e apresenta; o cliente não acessa sistema nenhum.

> Diagrama "O relatório só sai conferido e aprovado por uma segunda pessoa" (fluxo do relatório CADM, 8 passos): 1. Importar (posições e fluxos) → 2. Conferir (PL bate com extrato) → 3. Rodar o mês (motor e ponte) → 4. Rascunho (números congelados) → 5. Revisão (comentário e E se?) → 6. Aprovação (outra pessoa aprova) → 7. Apresentar (reunião ou PDF) → 8. Arquivar (PDF e números). Volta "PL não bate": de 2 para 1. Volta "número estranho": de 5 para 2.

Duas voltas seguram o relatório: PL que não bate com o extrato volta para a importação, e número estranho na revisão volta para a conferência.

#### Fluxo do mês

1. **Importar** as posições e os aportes e resgates do mês (seção "Dados mensais por canal").
2. **Conferir**, família por família: o PL bate com o extrato (tolerância de 0,01%), todo ativo tem classe e o plano foi revisado nos últimos 12 meses (se não, aviso, sem bloquear). Família reprovada fica fora do fechamento, com aviso, sem segurar as outras.
3. **Rodar o mês**: rodada oficial e ponte "o que mudou", só com o IPCA oficial do mês, gravadas com semente, versão do motor, versão das premissas e hash das entradas.
4. **Rascunho**: o sistema monta o relatório com os números congelados da rodada.
5. **Revisão**: quem prepara escreve o comentário da gestão e escolhe até três cenários "E se?" para a conversa. Número estranho volta para a conferência.
6. **Aprovação**: outra pessoa da gestão aprova (quatro olhos). Aprovado, vira PDF; números, PDF e comentário não mudam mais, e corrigir = nova versão com motivo.
7. **Apresentar**: na reunião, em modo apresentação e com o "E se?" ao vivo no console, ou por PDF enviado pela gestão. O sistema registra data e forma.
8. **Arquivar**: PDF e números congelados ficam guardados pelo prazo que compliance definir.

#### Conteúdo do relatório

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

#### O que mudou no mês (a ponte)

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

#### Regras do relatório

- Texto automático nunca recomenda produto, ativo ou alocação. O comentário da gestão é o único texto livre e passa por quem aprova.
- Quem prepara não aprova o mesmo relatório.
- Toda página com número mostra a data das posições e a versão das premissas.
- PDF em A4 paisagem, legível na tela e impresso.
- Um único componente de layout gera o PDF a partir dos números congelados. Padrão: @react-pdf/renderer no navegador do console, sem servidor de PDF, com os gráficos desenhados nos componentes `<Svg>` dele (o Recharts não roda no react-pdf). Outra opção entra no plano da Fase 1 e vai para `docs/DECISOES.md`.
- O modo apresentação mostra o próprio PDF em tela cheia; o "E se?" ao vivo usa a tela do console.
- O envio ao cliente fica fora do sistema na primeira versão: a gestão baixa o PDF e envia pelos canais de hoje.

### Canal 2: app dos clientes AI

Os clientes AI veem os números oficiais do mês e simulam no próprio celular, nas sete telas abaixo. Familiar convidado e "Pergunte ao plano" com IA ficam para depois do piloto.

Regras do canal:

- **Pesos no motor:** a carteira atual por classe, sobre todo o patrimônio simulado (posições na corretora mais bens financeiros declarados). Os pesos explícitos são uma das mudanças do motor na Fase 1.
- **Custo:** `fee_rate` por cliente. Padrão nos clientes AI: 0,80% ao ano, o mesmo da CADM, marcado "a validar" até o comitê definir, porque as premissas são de índices e não descontam o custo dos produtos.
- **Números do mês:** vêm da mesma rodada oficial do ciclo mensal usada no relatório CADM. O "E se?" mostra a chance oficial e a diferença calculada no aparelho: cenário menos plano oficial, os dois com 5.000 trajetórias e os mesmos sorteios.
- **Sem recomendação:** o app nunca sugere produto, ativo ou alocação. Para decisões, a frase padrão manda falar com o assessor.
- **Identidade:** marca da Aware e, se compliance exigir, a do intermediário (ver "Segurança, LGPD e compliance").
- **Celular primeiro:** tela inicial em 375 px, temas claro e escuro.

#### 1. Entrar

- Convite do responsável pelo cliente (assessor ou banker); sem cadastro aberto. E-mail, senha e segundo fator (app autenticador).
- A sessão expira após 30 minutos sem uso.

#### 2. Visão geral (tela inicial)

Responde em cinco segundos à pergunta "meu plano continua de pé?".

- **Probabilidade de sucesso** em destaque (ex.: 87%), com selo de faixa e a variação do mês com o maior fator da ponte ("−2 p.p. em setembro, principalmente mercado").
- **Benchmark pessoal**: "Sua carteira precisa render IPCA + 3,8% ao ano". Ao lado, o retorno esperado da carteira atual e a folga em pontos percentuais.
- **Trajetória** do patrimônio financeiro por idade: faixa P10 a P90, linha P50, linha P10 destacada e marcos (aposentadoria, eventos).
- **Uma frase de leitura** gerada a partir dos números: "No cenário mediano, vocês chegam aos 95 anos com R$ 9,8 mi em valores de hoje. No cenário ruim, o patrimônio dura até os 88."
- Rodapé: data das posições, versão das premissas e aviso legal curto (rodapé do app AI), com link para o completo.

#### 3. E se?

- Controles: idade de aposentadoria, gasto essencial, gasto de estilo de vida, renda, aporte ou resgate pontual, venda de imóvel (valor e ano), choque de mercado no 1º ano e horizonte. Perfil simulável: só "carteira atual", até compliance aprovar perfis-modelo para clientes AI (coluna `households.suitability`).
- Cenários prontos em botões: aposentar 3 anos antes, vender um imóvel, crise como a de 2008 no 1º ano, inflação alta por 5 anos, gastar 10% a mais.
- Recalcula ao soltar o controle (espera de 250 ms), com indicador de cálculo. Mostra sempre a diferença para o plano oficial ("87% → 71%"): a chance oficial vem da rodada oficial do mês, e a diferença é calculada no aparelho, cenário menos plano oficial, os dois com 5.000 trajetórias e os mesmos sorteios.
- Compara até três cenários lado a lado: probabilidade, benchmark pessoal, patrimônio mediano aos 80 anos e no fim, e idade em que o dinheiro acaba no cenário ruim.
- **Gasto sustentável**, calculado sob demanda: "Com 85% de chance, vocês podem gastar até R$ X por mês."
- Salvar cenário com nome; o cenário do cliente é pessoal.
- Botão "Voltar ao plano oficial".

#### 4. Patrimônio

- Carteira na corretora por classe de ativo (barras horizontais com % e R$) e outros bens declarados (imóveis, empresa, previdência, conta no exterior). Sem alocação-alvo.
- Rentabilidade real realizada no ano e em 12 meses, contra o benchmark pessoal. O CDI aparece como referência secundária.
- Data de referência das posições.

#### 5. Plano

- Linha do tempo da família: idades, aposentadoria, eventos e metas.
- Fluxos: renda por fonte e prazo, gastos essenciais e de estilo de vida, eventos com valor, ano e recorrência.
- Metas: manter o padrão de vida até certa idade e legado mínimo.
- O cliente sugere mudanças; elas entram numa fila para o responsável confirmar.

#### 6. Como calculamos

- Explica em linguagem simples o que é a simulação, o que significa "87%", o que é o benchmark pessoal, quais premissas estão em vigor (tabela de retorno e risco por classe) e quais são as limitações.
- Duas frases do canal: a simulação usa a carteira atual por classe, rebalanceada uma vez por ano; e o custo considerado, se houver.
- Aviso legal completo.

#### 7. Histórico

- Série mensal da probabilidade de sucesso e do benchmark pessoal, com a rentabilidade real realizada.
- Marcadores de eventos: mudança no plano, nova versão de premissas, choque de mercado.

### Console interno

Usado por gestão, comitê, compliance, bankers da CADM e responsáveis pelos clientes AI, cada um com as permissões do seu papel. Substitui as antigas áreas do banker e do comitê.

- **Famílias por canal:** lista com chance atual, variação no mês, folga, selo de faixa, data das posições e status do mês. Ordenável. Filtro "precisam de atenção": chance abaixo de 70%, queda de mais de 5 p.p. no mês, ou de 99% ou mais (talvez conservador demais).
- **Cadastro e plano:** cadastro da família (canal, responsável, intermediário, origem dos pesos, suitability e semente) e editor do plano, com versões; fila de sugestões dos clientes AI para o responsável confirmar.
- **Mês:** importação de posições e de aportes e resgates (CSV ou XLSX) com prévia, conferência e status por família; rodada oficial em lote; fechamento do canal (seção "Dados mensais por canal").
- **Relatórios:** rascunho, revisão (comentário e até três cenários), aprovação por outra pessoa, PDF, registro da apresentação e arquivo.
- **Modo apresentação:** o PDF do relatório em tela cheia e o "E se?" ao vivo, sem menus.
- **Premissas (comitê):** editor de versões com retorno real esperado, volatilidade e graus de liberdade por classe, mais a matriz de correlação. Validação automática (simétrica, diagonal 1, positiva definida). Fluxo rascunho → aprovada → vigente, com data de vigência e aprovador. Ao publicar, recalcular todas as famílias e guardar o antes e depois.
- **Perfis de alocação (comitê):** pesos-alvo por classe para cada perfil.
- **Mapeamento de ativos (comitê):** cada ativo importado (por código, ISIN ou CNPJ) recebe uma classe. Ativo sem classe bloqueia o cálculo da família e entra numa fila.
- **Usuários, convites e trilha de auditoria** (leitura para compliance).

## Motor de simulação

O motor é uma simulação de Monte Carlo anual, em valores reais, com retornos correlacionados por classe de ativo, caudas grossas e regras de gasto flexível. Ele é uma função pura: mesmas entradas e mesma semente geram exatamente o mesmo resultado. As mudanças marcadas "a partir da Fase 1" estão detalhadas em "Motor no ciclo mensal", no fim desta seção.

### Convenções

- **Unidade:** tudo em reais de hoje (descontado o IPCA). Retornos são reais, acima do IPCA. A interface sempre diz "em valores de hoje".
- **Passo:** anual. O ano 0 é a data de referência das posições. A partir da Fase 1, o passo t cobre os 12 meses seguintes à data de referência mais t anos.
- **Horizonte:** até o membro mais jovem do casal completar a idade-limite (padrão 95 anos). A partir da Fase 1, o último passo termina no mês em que ele atinge a idade-limite. Longevidade estocástica fica para depois do piloto.
- **Patrimônio simulado:** só o financeiro (carteira CADM ou posições na corretora, mais investimentos líquidos declarados). Imóveis e participações em empresas entram apenas como fluxos: aluguel, dividendos, venda.
- **Ordem no ano (conservadora):** déficits saem no início do ano; superávits entram no fim.
- **Trajetórias:** 5.000 por cálculo (configurável, mínimo 1.000); a rodada oficial do mês usa 10.000.
- **Números aleatórios comuns:** cenários comparados usam a mesma semente, para que a diferença reflita a hipótese e não o ruído do sorteio. Cada trajetória tem sua própria sequência do gerador (D-020). A partir da Fase 1, a semente é fixa por família, a mesma todos os meses, e nenhuma entrada muda os sorteios.

### Entradas

| Entrada | Origem | Exemplo |
|---|---|---|
| Patrimônio financeiro por classe | Importação mensal (CADM: controle da gestão; AI: corretora) mais declarados | R$ 12 mi |
| Pessoas: nascimento e sexo | Gestão (CADM) ou responsável (AI) | Casal de 52 e 50 anos |
| Renda por fonte: valor real anual, início, fim | Gestão ou responsável | Pró-labore até os 62 |
| Gasto essencial e de estilo de vida, por fase | Gestão ou responsável | R$ 55 mil e R$ 30 mil por mês |
| Eventos: valor, ano, mês (a partir da Fase 1), recorrência, entrada ou saída | Gestão, responsável ou cliente AI | Faculdade de 2027 a 2031 |
| Metas: idade-limite e legado mínimo | Gestão ou responsável | Até 95 anos, legado de R$ 3 mi |
| Carteira: pesos-alvo do perfil (CADM) ou, a partir da Fase 1, pesos explícitos da carteira atual por classe (AI) | Comitê (perfis) ou importação mensal (carteira atual) | Moderado |
| Custo anual (`fee_rate`, % ao ano) | CADM: contrato do cliente; AI: padrão de 0,80%, "a validar" | 0,80% |
| Premissas (versão vigente) | Comitê | Versão 2026-10 |
| Regras de gasto flexível | Gestão ou responsável | Ligadas |
| Choques do cenário | "E se?" | Crise no 1º ano |

### Classes de ativo e premissas

Os números abaixo são ilustrativos, para desenvolvimento e testes. O comitê substitui pelos oficiais antes de qualquer uso com clientes. Na v1 as premissas já vêm líquidas de impostos; o motor desconta só a taxa de gestão.

| Código | Classe | Referência | Retorno real esperado (a.a.) | Volatilidade (a.a.) |
|---|---|---|---|---|
| POS | Pós-fixado | CDI | 4,0% | 1,5% |
| INF | Inflação | IMA-B | 5,0% | 8,0% |
| PRE | Prefixado | IRF-M | 4,5% | 5,0% |
| CRED | Crédito privado | IDA (ANBIMA) | 4,8% | 3,0% |
| MM | Multimercado | IHFA | 4,8% | 6,0% |
| ACOES | Ações Brasil | Ibovespa | 6,5% | 24,0% |
| FII | Imobiliário listado | IFIX | 5,0% | 14,0% |
| INTL | Internacional, em reais | Ações globais em BRL | 5,5% | 16,0% |

Retorno esperado = média aritmética anual. Graus de liberdade da distribuição t: ν = 5, comum a todas as classes, para que as crises atinjam tudo ao mesmo tempo.

Correlações ilustrativas (a classe internacional em reais tende a subir quando os ativos locais caem, por causa do câmbio):

| | POS | INF | PRE | CRED | MM | ACOES | FII | INTL |
|---|---|---|---|---|---|---|---|---|
| POS | 1 | 0,10 | 0,20 | 0,50 | 0,30 | −0,05 | 0,00 | −0,10 |
| INF | 0,10 | 1 | 0,70 | 0,30 | 0,30 | 0,45 | 0,50 | −0,20 |
| PRE | 0,20 | 0,70 | 1 | 0,30 | 0,30 | 0,40 | 0,40 | −0,25 |
| CRED | 0,50 | 0,30 | 0,30 | 1 | 0,35 | 0,30 | 0,30 | −0,10 |
| MM | 0,30 | 0,30 | 0,30 | 0,35 | 1 | 0,45 | 0,30 | 0,10 |
| ACOES | −0,05 | 0,45 | 0,40 | 0,30 | 0,45 | 1 | 0,60 | −0,10 |
| FII | 0,00 | 0,50 | 0,40 | 0,30 | 0,30 | 0,60 | 1 | −0,10 |
| INTL | −0,10 | −0,20 | −0,25 | −0,10 | 0,10 | −0,10 | −0,10 | 1 |

Esta matriz foi conferida: é simétrica e positiva definida (menor autovalor ≈ 0,27). O editor do comitê repete essa checagem e recusa matrizes inválidas.

Perfis de alocação ilustrativos (pesos-alvo em %) e o que resulta deles com as premissas acima:

| Classe | Conservador | Moderado | Arrojado |
|---|---|---|---|
| POS | 40 | 25 | 10 |
| INF | 20 | 25 | 20 |
| PRE | 5 | 5 | 5 |
| CRED | 20 | 15 | 10 |
| MM | 10 | 10 | 10 |
| ACOES | 0 | 8 | 20 |
| FII | 0 | 4 | 7 |
| INTL | 5 | 8 | 18 |
| Retorno real aritmético | 4,54% | 4,84% | 5,23% |
| Volatilidade | 2,57% | 4,42% | 7,14% |

No perfil moderado, o retorno real composto simulado fica em ≈ 4,73% ao ano antes da taxa de gestão e ≈ 3,90% depois de 0,80% de taxa. É esse retorno composto, líquido de taxa, que se compara ao benchmark pessoal.

### Geração dos retornos

1. Calcule o fator de Cholesky L da matriz de correlação C. Se a decomposição falhar, o cálculo para com erro claro para o comitê.
2. A cada ano de cada trajetória, sorteie um vetor t-Student multivariado padronizado (variância 1). Um único Q por vetor faz as caudas virem juntas:

```latex
Z = \sqrt{\frac{\nu-2}{\nu}}\;\frac{L\,G}{\sqrt{Q/\nu}}, \qquad G \sim N(0, I_K),\quad Q \sim \chi^2_\nu,\quad L L^{\top} = C
```

3. Converta cada componente em retorno lognormal, calibrado para que a média aritmética bata com a premissa:

```latex
s_k = \sqrt{\ln\left(1 + \frac{\sigma_k^2}{(1+\mu_k)^2}\right)} \qquad m_k = \ln(1+\mu_k) - \ln \mathbb{E}\left[e^{s_k Z}\right]
```

```latex
r_k = \exp\big(m_k + s_k \cdot \min(\max(Z_k, -6), 6)\big) - 1 + \delta_{t,k}
```

4. O termo ln E[exp(s·Z)] é estimado uma vez por classe com 1 milhão de sorteios de semente fixa e guardado em cache. Com distribuição normal ele vale s²/2.
5. O corte em ±6 evita retornos absurdos e afeta cerca de 0,06% dos sorteios com ν = 5.
6. δ é o choque do cenário para a classe k no ano t (zero quando não há choque).
7. Q com ν inteiro = soma de ν normais ao quadrado. Exija ν inteiro entre 3 e 30.

### Retorno da carteira

Rebalanceamento anual para os pesos da família (os pesos-alvo do perfil ou, a partir da Fase 1, os pesos explícitos da carteira atual), com o custo anual f (`fee_rate`) descontado sobre o patrimônio:

```latex
R_t = (1 - f)\Big(1 + \sum_k w_{k} \, r_k\Big) - 1
```

Opcional na v1: pesos diferentes antes e depois da aposentadoria (dois conjuntos de pesos por perfil).

### Fluxos de caixa

O fluxo líquido do ano é F = renda + aluguéis + dividendos + entradas de eventos − gasto essencial − gasto de estilo de vida − saídas de eventos. O patrimônio evolui assim:

```latex
W_{t+1} = \begin{cases} W_t\,(1 + R_t) + F_t & \text{se } F_t \ge 0 \\ (W_t + F_t)\,(1 + R_t) & \text{se } F_t < 0 \end{cases}
```

- Se o patrimônio não cobre o déficit do ano (W + F < 0), a trajetória **falha** naquela idade. Daí em diante o patrimônio fica em zero.
- Eventos têm valor real, ano de início, ano de fim e recorrência: única, anual ou a cada N anos.
- Venda de imóvel: entrada única no ano escolhido, pelo valor líquido de custos e impostos informado pela gestão ou pelo responsável; sem esse valor, a venda é recusada (D-015). O aluguel daquele imóvel para a partir do ano da venda.
- Previdência (PGBL/VGBL), na v1, entra no patrimônio financeiro com a classe do fundo. Depois do piloto, com o módulo de impostos, ganha tratamento próprio de imposto e sucessão.

### Gasto flexível

O gasto essencial nunca é cortado. As regras ajustam só o gasto de estilo de vida, a partir da aposentadoria. A régua padrão é uma **trajetória de referência**: o patrimônio projetado sem sorteio, com o retorno composto esperado do perfil e o plano completo. Se, num ano, o patrimônio de uma trajetória simulada fica abaixo de 80% da referência, o estilo de vida é cortado; acima de 120%, é aumentado.

| Regra | Gatilho | Ação | Padrão |
|---|---|---|---|
| Corte | Patrimônio abaixo de 80% da trajetória de referência | Corta 10% do estilo de vida | Ligada; desligada nos últimos 15 anos do horizonte (a partir da Fase 1, nos últimos 15 passos) |
| Aumento | Patrimônio acima de 120% da trajetória de referência | Aumenta 10% do estilo de vida | Ligada |
| Piso | Sempre | Estilo de vida nunca abaixo de 50% do inicial | 50% |
| Teto | Sempre | Estilo de vida nunca acima de 130% do inicial | 130% |
| Alternativa Guyton-Klinger | Taxa de saque acima de 120% ou abaixo de 80% da inicial | Corta ou aumenta 10% | Desligada; disponível como opção |

Por que a régua padrão não é a de Guyton e Klinger (2006): num plano que consome o patrimônio de propósito, a taxa de saque sobe naturalmente com o tempo, e as regras cortam o gasto em quase todos os cenários. Na família de exemplo, a regra original cortou o estilo de vida em 99,6% das trajetórias; a régua pela trajetória de referência cortou em cerca de 35%. Taxa de saque = déficit do ano ÷ patrimônio no início do ano. Todos os gatilhos, ajustes, piso e teto são parâmetros. O motor conta, por trajetória, se houve corte, o maior corte e quantos anos com corte.

### Choques e testes de estresse

Choques somam pontos percentuais ao retorno real sorteado de cada classe nos anos indicados. Os valores abaixo são ilustrativos; o comitê calibra com as séries históricas.

| Cenário pronto | Anos | POS | INF | PRE | CRED | MM | ACOES | FII | INTL |
|---|---|---|---|---|---|---|---|---|---|
| Crise como a de 2008 | 1 | 0 | −5 | −3 | −6 | −8 | −35 | −20 | +5 |
| Inflação alta | 1 a 5 | 0 | −1 | −4 | −1 | −1 | −3 | −2 | +1 |
| Década perdida | 1 a 10 | 0 | −0,5 | 0 | −0,5 | −1 | −3 | −2 | 0 |

Na tela "E se?", o choque genérico do 1º ano (controle deslizante de 0% a −30%) se aplica a todas as classes de risco na proporção da volatilidade de cada uma.

### Longevidade

- **v1:** horizonte fixo pela idade-limite.
- **Depois do piloto:** em cada trajetória, sorteie a idade de morte de cada pessoa a partir de uma tábua de mortalidade por idade e sexo. O plano termina quando morre o último. Após a primeira morte, o gasto cai para um percentual do gasto do casal (padrão 70%, configurável). Para clientes de alta renda, a tábua BR-EMS da SUSEP é mais adequada do que a da população geral do IBGE.

### Impostos

- **v1:** premissas líquidas de impostos, informadas pelo comitê.
- **Depois do piloto:** módulo de impostos com parâmetros editáveis por vigência. Regras a modelar, todas a validar com o tributário antes de entrar em produção:

| Item | Regra a parametrizar |
|---|---|
| Renda fixa tributada | Tabela regressiva: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima |
| Fundos abertos e exclusivos | Come-cotas em maio e novembro; exclusivos com come-cotas desde 2024 (Lei 14.754/2023) |
| Isentos para pessoa física | LCI, LCA, CRI, CRA, debêntures incentivadas e rendimentos de FII (com condições) |
| Ações | 15% sobre o ganho líquido; vendas de até R$ 20 mil por mês isentas |
| Dividendos | Retenção de 10% acima de R$ 50 mil por mês por empresa desde 2026, mais imposto mínimo para rendas acima de R$ 600 mil por ano, progressivo até 10% (Lei 15.270/2025) |
| Exterior | 15% ao ano sobre rendimentos de aplicações financeiras no exterior (Lei 14.754/2023) |
| Previdência PGBL/VGBL | Tabela regressiva de 35% a 10% (10% após 10 anos) ou progressiva; no VGBL só o rendimento é tributado |
| Herança e doação | ITCMD estadual, progressivo após a reforma tributária; alíquotas do estado de residência |

### Saídas e métricas

| Métrica | Definição | Onde aparece |
|---|---|---|
| Probabilidade de sucesso ("a chance") | % das trajetórias que nunca falham até o fim do horizonte | Relatório (resumo), Visão geral, E se?, console |
| Probabilidade do legado | % das trajetórias que terminam com patrimônio ≥ legado mínimo | Relatório e Visão geral, se houver meta de legado |
| Benchmark pessoal | Menor retorno real constante que sustenta o plano (seção seguinte) | Relatório e Visão geral |
| Folga | Retorno composto líquido da carteira − benchmark pessoal, em p.p. | Relatório e Visão geral |
| Trajetória | Percentis P10, P25, P50, P75 e P90 do patrimônio por idade | Relatório (página 5) e gráfico principal do app |
| Idade de esgotamento | Idade do ano em que o P10 deixa de cobrir o déficit (ou "não esgota") | Frase de leitura |
| Gasto sustentável | Maior gasto total com probabilidade ≥ alvo (padrão 90%) | E se? |
| Chance de corte | % das trajetórias com algum corte no estilo de vida | E se?, com regras ligadas |
| Maior corte mediano | Mediana do maior corte, em % do estilo de vida inicial | E se?, com regras ligadas |

Gasto sustentável: bisseção sobre um multiplicador k do gasto total (essencial + estilo de vida), entre 0,3 e 3, com a mesma semente em todas as rodadas. Use 2.000 trajetórias na busca e confirme o resultado final com 5.000.

### Desempenho e reprodutibilidade

- O motor roda num Web Worker no navegador (console e app) e nas Edge Functions (rodada oficial). Meta: 5.000 trajetórias × 45 anos × 8 classes em menos de 1 segundo num celular intermediário.
- Gerador de números aleatórios com semente: xoshiro128** (ou equivalente documentado). Normais por Box-Muller.
- Use Float64Array e evite criar objetos dentro do laço.
- Cada cálculo mostrado a um cliente grava: hash das entradas, versão das premissas, semente, versão do motor e resumo dos resultados. Com isso, qualquer número pode ser refeito.

### Pseudocódigo

Pseudocódigo da Fase 0. Diferença já adotada (D-009): o mercado é sorteado antes dos fluxos e a trajetória que falha não interrompe os sorteios. A partir da Fase 1, entram as mudanças de "Motor no ciclo mensal".

```ts
export function simulate(inp: SimInput, cma: Cma, opt: SimOptions): SimResult {
  const K = cma.classes.length;
  const L = cholesky(cma.correlation);                 // erro se não for positiva definida
  const s = cma.classes.map(c => Math.sqrt(Math.log(1 + (c.vol / (1 + c.mu)) ** 2)));
  const m = cma.classes.map((c, k) => Math.log(1 + c.mu) - logMgfT(s[k], cma.nu)); // em cache
  const rng = xoshiro128ss(opt.seed);
  const T = horizonYears(inp);
  const refPath = referencePath(inp, expectedCompositeReturn(cma, inp)); // régua do gasto flexível
  const wealth = new Float64Array(opt.paths * (T + 1));

  for (let i = 0; i < opt.paths; i++) {
    let W = inp.financialWealth;
    let lifestyle = inp.lifestyleSpending;             // valor real anual
    let wr0 = NaN;                                     // taxa de saque inicial
    wealth[i * (T + 1)] = W;

    for (let t = 0; t < T; t++) {
      const z = studentTVector(L, cma.nu, rng);        // K valores, já cortados em ±6
      const w = targetWeights(inp, t);                 // pesos do perfil ou da fase
      let gross = 0;
      for (let k = 0; k < K; k++) {
        gross += w[k] * (Math.exp(m[k] + s[k] * z[k]) - 1 + shock(inp, t, k));
      }
      const R = (1 - inp.fee) * (1 + gross) - 1;

      if (isRetired(inp, t)) lifestyle = applyGuardrails(inp.rules, { W, ref: refPath[t], wr0, lifestyle, t, T });
      const F = income(inp, t) + inflows(inp, t)
              - essential(inp, t) - lifestyle - outflows(inp, t);
      if (isRetired(inp, t) && Number.isNaN(wr0)) wr0 = Math.max(0, -F) / W;

      if (F >= 0) W = W * (1 + R) + F;
      else if (W + F < 0) { markFailure(i, t); W = 0; }
      else W = (W + F) * (1 + R);

      wealth[i * (T + 1) + t + 1] = W;
      if (W === 0) break;                              // demais anos ficam em zero
    }
  }
  return summarize(wealth, opt);
}
```

### Motor no ciclo mensal (a partir da Fase 1)

Quatro mudanças evitam que o sorteio ou o calendário, e não a família, movam a chance de um mês para o outro: três no motor e uma na montagem das entradas. Cada uma é um commit separado, e as do motor passam pelo `revisor-motor`.

1. **Pesos explícitos.** O motor aceita pesos por classe, além do `profileId`. Com os pesos do perfil, o resultado é idêntico, bit a bit. Na AI, os pesos são a carteira atual por classe (`households.weights_source = carteira_atual`); na CADM, os pesos-alvo do perfil.
2. **Sorteios alinhados por trajetória.** A trajetória i usa um gerador próprio, semeado com a semente da família (`households.seed`, a mesma todos os meses) e i, e o ano t usa sempre o t-ésimo sorteio dele. Mudar patrimônio, plano, pesos, premissas ou horizonte nunca muda os sorteios. Testes: entradas diferentes com a mesma semente geram os mesmos sorteios, e um resgate de R$ 1 mil nunca aumenta a chance.
   - Já feito na Fase 0: cada trajetória tem sua própria sequência do gerador e o ano t não depende do horizonte (D-020); a trajetória que falha não interrompe os sorteios (D-009).
   - Falta na Fase 1: a semente por família e a independência das premissas. Hoje um ν ou um número de classes diferente muda quantos sorteios cada ano consome.
3. **Passo de 12 meses.** Na convenção da Fase 0, o passo 0 aplica o fluxo do ano civil inteiro, mesmo com a data de referência em setembro, e conta de novo o que já aconteceu no ano. Novo:
   - data de referência = último dia do mês de competência;
   - o passo t cobre os 12 meses seguintes à data de referência mais t anos; o último termina no mês em que o membro mais jovem atinge a idade-limite e pode ter m < 12 meses, com retorno (1 + R)^(m/12) − 1;
   - fluxos e eventos anuais entram pro rata, pelos meses do seu ano civil que caem no passo;
   - evento único e cada ocorrência de "a cada N anos" entram no seu mês (nova coluna `events.month`; sem mês, julho); evento sem mês com julho já passado gera aviso na conferência;
   - aposentado no passo t = aposentadoria antes do início do passo; os "últimos 15 anos" do gasto flexível passam a ser os últimos 15 passos.
4. **Plano corrigido pelo IPCA**, fora de `src/engine`, na montagem das entradas em `src/report`. Cada versão do plano guarda o mês-base dos valores (`plan_versions.base_month`); a rodada aplica o IPCA acumulado do mês seguinte ao mês-base até o mês de referência. Sem isso, o gasto encolheria em termos reais todo mês. O patrimônio realizado da página 5 do relatório também vai para reais da data de referência.

O motor de referência em Python e `reference/resultados_referencia.json` são atualizados com os itens 2 e 3, numa mudança isolada aprovada por Murilo; é a única exceção à regra de não editar `reference/`. Os números da Família Andrade mudam: o benchmark pessoal sai de IPCA + 2,98% para cerca de IPCA + 3,25% (sem legado, de 2,77% para cerca de 3,05%), e a chance cai junto, porque a convenção antiga contava de novo os fluxos de janeiro a setembro de 2026 e encerrava o plano em dezembro de 2070, não em agosto de 2071. Os testes 1 a 12 e 14 devem continuar passando; se algum depender da convenção antiga, mostrar antes de alterar.

## Benchmark pessoal

O benchmark pessoal é o menor retorno real constante que sustenta o plano inteiro. Ele substitui o CDI como régua principal do cliente: "sua carteira precisa render IPCA + 3,8% ao ano".

### Cálculo

- Determinístico, sem sorteio: aplica o mesmo retorno real r todo ano aos fluxos do plano oficial, com gastos completos, sem regras de gasto flexível e com a mesma convenção de fluxo do motor.
- Bisseção entre −5% e +20% ao ano, com precisão de 0,01 p.p.:

```latex
r^{*} = \min \{\, r : W_t(r) + \min(F_t, 0) \ge 0 \;\; \forall t < T \;\text{e }\; W_T(r) \ge \text{legado} \,\}
```

- Se o plano funciona até com −5%: mostrar "Folga total: o plano se sustenta mesmo com retorno real negativo".
- Se nem 20% basta: mostrar "Plano inviável sem ajustes" e levar o cliente ao "E se?".
- **Folga** = retorno composto esperado da carteira (perfil ou carteira atual), líquido do custo anual, menos r*. O retorno composto vem da própria simulação: exp(média de ln(1 + R)) − 1, sobre todos os anos e trajetórias. Nunca compare r* com a média aritmética, que superestima o crescimento.

### Faixas da probabilidade

Alvo padrão de 90%. As faixas seguem a lógica dos guardrails por risco (limite inferior de 70% e superior de 99% nos exemplos da Kitces), com uma faixa intermediária de atenção.

| Faixa | Probabilidade | Cor do selo | O que a gestão ou o responsável vê |
|---|---|---|---|
| Folga grande | 99% ou mais | Azul | Sugestão de conversa: dá para gastar mais ou antecipar planos |
| No caminho | De 85% a 99% | Verde | Nada a fazer |
| Atenção | De 70% a 85% | Amarelo | Revisar na próxima reunião |
| Plano em risco | Abaixo de 70% | Vermelho | Contato proativo, com o gasto sustentável já calculado |

Os limites das faixas e o alvo são parâmetros do comitê.

### Termômetro mensal

- Na rodada oficial do mês fechado, recalcule probabilidade, r* e folga com o patrimônio do fechamento e o plano vigente. Grave um registro mensal: data, probabilidade, r*, folga, patrimônio, rentabilidade real realizada, versão das premissas, versão do plano, rodada (`run_id`) e os passos da ponte.
- Rentabilidade realizada da carteira (CADM ou AI): retorno mensal por Dietz modificado com os aportes e resgates do mês, encadeado no tempo e deflacionado pelo IPCA. A página 4 do relatório e o Histórico do app comparam essa linha com o benchmark pessoal acumulado no mesmo período.
- Texto automático do mês, por exemplo: "A probabilidade passou de 87% para 84% em setembro. O plano continua na faixa verde."
- **Ponte, o que mudou no mês:** a variação da chance e do benchmark pessoal é separada em seis passos, trocando um grupo de entradas por vez com os mesmos sorteios (ver "O que mudou no mês (a ponte)", em Telas e funcionalidades). É o centro da página 3 do relatório CADM e aparece em uma linha na Visão geral do app AI.

## "E se?" e linguagem natural

O "E se?" altera hipóteses numa cópia do plano oficial. Nada volta para o plano oficial sem confirmação da gestão (CADM) ou do responsável (AI). Ele aparece no app AI, no console (ao vivo na reunião) e, como até três cenários escolhidos pela gestão, na página 6 do relatório CADM.

### Controles

| Controle | Campo do motor | Faixa | Passo |
|---|---|---|---|
| Idade de aposentadoria | `retirementAge` | Idade atual a 75 | 1 ano |
| Gasto essencial | `essentialMonthly` | 20% a 200% do atual | R$ 1 mil por mês |
| Gasto de estilo de vida | `lifestyleMonthly` | 0 a 300% do atual | R$ 1 mil por mês |
| Renda até aposentar | `incomes[].amount` | 0 a 200% da atual | R$ 5 mil por mês |
| Aporte ou resgate pontual | `events[]` | −50% a +100% do patrimônio | R$ 50 mil |
| Venda de imóvel | `propertySales[]` | Imóveis declarados, ano | 1 ano |
| Perfil de alocação | `profileId` ou, a partir da Fase 1, pesos explícitos | Perfis aprovados; no app AI, só "carteira atual" até compliance aprovar perfis-modelo | — |
| Choque no 1º ano | `firstYearShock` | 0% a −30% | 5 p.p. |
| Horizonte | `horizonAge` | 85 a 105 anos | 1 ano |
| Gasto flexível | `rules.enabled` | Ligado ou desligado | — |

Além dos controles, duas perguntas que o motor resolve por bisseção, sempre com a probabilidade-alvo (padrão 90%):

- **Quanto posso gastar?** Maior gasto mensal total.
- **Quando posso parar?** Menor idade de aposentadoria.

### Comparação

- Até três cenários lado a lado, todos com a mesma semente.
- Tabela de diferenças contra o plano oficial e gráfico com a mediana de cada cenário sobreposta à faixa do plano oficial.

### Linguagem natural (depois do piloto)

Uma caixa "Pergunte ao seu plano" recebe perguntas como "e se eu me aposentar aos 58 e vender a casa de praia em 2030?". A IA só traduz a pergunta em parâmetros; quem calcula é sempre o motor.

1. Uma função no servidor chama a API do Claude com uso de ferramentas (tool use). A única ferramenta, `propor_cenario`, tem um JSON Schema com exatamente os campos do "E se?" e seus limites.
2. O app mostra os parâmetros propostos em português simples ("Aposentadoria: 62 → 58 anos; venda da casa de praia em 2030") e o cliente confirma.
3. O motor calcula no navegador, como em qualquer cenário.
4. A resposta em texto pode ser redigida pela IA, mas só a partir dos números do motor, passados como dados. Instruções fixas: não recomendar produtos nem alocação, não prometer rentabilidade, dizer que é uma simulação, no máximo três frases.
5. Pergunta fora do escopo ("devo comprar dólar?") recebe resposta padrão: "Não posso recomendar investimentos. Posso simular o efeito de uma hipótese no seu plano; para decisões, fale com seu assessor."
6. Para a IA vão só parâmetros e resultados agregados: nada de nome, CPF ou identificadores. Toda chamada fica na trilha de auditoria. Compliance valida antes de ligar.

Esboço da ferramenta:

```json
{
  "name": "propor_cenario",
  "description": "Propõe hipóteses para simular no plano do cliente. Nunca recomenda investimentos.",
  "input_schema": {
    "type": "object",
    "properties": {
      "retirementAge": { "type": "integer", "minimum": 45, "maximum": 75 },
      "essentialMonthly": { "type": "number", "minimum": 0 },
      "lifestyleMonthly": { "type": "number", "minimum": 0 },
      "profileId": { "type": "string", "enum": ["conservador", "moderado", "arrojado"] },
      "propertySales": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": { "propertyId": { "type": "string" }, "year": { "type": "integer" } },
          "required": ["propertyId", "year"]
        }
      },
      "firstYearShock": { "type": "number", "minimum": -0.5, "maximum": 0 },
      "solve": { "type": "string", "enum": ["none", "maxSpending", "earliestRetirement"] },
      "clarifyingQuestion": { "type": "string", "description": "Use quando a pergunta for ambígua." }
    }
  }
}
```

Exemplos de tradução esperada:

| Pergunta do cliente | Parâmetros propostos |
|---|---|
| E se eu parar de trabalhar 3 anos antes? | `{"retirementAge": 59}` |
| E se a bolsa cair 30% e eu vender a casa de praia em 2028? | `{"firstYearShock": -0.30, "propertySales": [{"propertyId": "casa-praia", "year": 2028}]}` |
| E se a gente gastar mais? | `{"clarifyingQuestion": "Quanto a mais por mês, e em quais anos?"}` |

## Dados e integrações

Posições e aportes e resgates vêm por importação mensal: na CADM, do controle interno da gestão; na AI, da corretora. Dados de mercado vêm de fontes públicas por rotinas agendadas. A v1 não se conecta a custodiantes nem à corretora.

### Modelo de dados

Postgres. Toda tabela com dado de família tem `household_id` e política de acesso por linha. Valores monetários em `numeric(18,2)`, taxas em `numeric(10,6)`.

| Tabela | Colunas principais | Observação |
|---|---|---|
| `households` | id, name, channel (cadm, ai), owner_id, intermediary, banker_id, profile_id, weights_source (perfil, carteira_atual), suitability, fee_rate, horizon_age, legacy_min, seed, status | Uma família por contrato CADM ou conta AI; canal, responsável e regras do motor por família |
| `people` | id, household_id, name, birth_date, sex, role | role: titular, cônjuge, filho |
| `user_roles` | user_id, household_id, role, can_see_amounts | role: gestao, comite, compliance, banker, responsavel, cliente_ai; household_id vazio para papéis internos |
| `assets` | id, asset_code, isin, cnpj, name, class_code, currency | Mapeamento ativo → classe |
| `import_batches` | id, ref_date, file_name, uploaded_by, row_count, total_value, official_total, status | Uma importação por mês |
| `positions` | id, household_id, batch_id, ref_date, custodian, asset_id, quantity, unit_price, gross_value, net_value, currency | Uma linha por ativo por mês |
| `other_assets` | id, household_id, kind, name, value, annual_income, can_be_sold | kind: imóvel, empresa, previdência, exterior |
| `cash_flows` | id, household_id, kind, annual_amount_real, start_year, end_year, other_asset_id | kind: renda, gasto essencial, gasto de estilo de vida, aluguel, dividendos |
| `events` | id, household_id, name, direction, amount_real, year, month, recurrence, every_n, end_year | Entradas e saídas pontuais ou recorrentes; month (1 a 12, opcional) para o passo de 12 meses |
| `goals` | id, household_id, kind, target_age, amount | kind: padrão de vida, legado |
| `plan_versions` | id, household_id, created_by, snapshot (jsonb), base_month, created_at | Cada mudança no plano gera uma versão; base_month é o mês-base dos valores (correção pelo IPCA) |
| `plan_change_requests` | id, household_id, requested_by, payload (jsonb), status, reviewed_by | Sugestões do cliente |
| `cma_versions` | id, label, effective_date, status, nu, approved_by, approved_at | status: rascunho, aprovada, vigente, arquivada |
| `cma_classes` | cma_version_id, class_code, name, benchmark, mu_real, vol | |
| `cma_correlations` | cma_version_id, class_a, class_b, rho | Só o triângulo superior |
| `profiles` | id, name, weights_pre (jsonb), weights_post (jsonb) | Pesos por classe |
| `scenarios` | id, household_id, owner_id, name, params (jsonb), for_meeting | |
| `simulation_runs` | id, household_id, scenario_id, inputs_hash, inputs (jsonb), cma_version_id, seed, engine_version, paths, summary (jsonb), created_by, created_at | Garante a reprodutibilidade |
| `monthly_snapshots` | household_id, ref_date, probability, required_return, slack, wealth, realized_return_real, cma_version_id, plan_version_id, run_id, attribution (jsonb) | Termômetro mensal e ponte (passos em attribution) |
| `flows` | household_id, batch_id, ref_date, custodian, flow_date, kind (aporte, resgate), amount, currency, description | Aportes e resgates: rentabilidade e ponte |
| `household_months` | household_id, ref_date, official_pl, status (importado, conferido, bloqueado, rodado, fechado), note | Conferência e status por família |
| `month_closings` | ref_date, channel, status (aberto, fechado), opened_by, closed_by, closed_at | Fechamento do canal |
| `reports` | household_id, ref_date, version, status (rascunho, em_revisao, aprovado, apresentado, substituido), prepared_by, approved_by, approved_at, presented_at, presented_how, snapshot (jsonb), pdf_path, comment, scenarios (jsonb), supersedes_id, reason | Relatório com números travados depois de aprovado |
| `market_series` | series_code, date, value, source | CDI, IPCA, dólar |
| `audit_log` | id, actor_id, action, target_table, target_id, household_id, details (jsonb), at | Só inserção, sem update nem delete |

- Depois de aprovado, o relatório só aceita mudança de status (apresentado, substituído) e dos campos de apresentação; números, PDF e comentário ficam travados por gatilho, e delete é negado. Teste pgTAP.
- O papel cliente_ai não lê `reports`, `audit_log`, famílias CADM nem dados de outra família, com teste pgTAP de vazamento para esse papel.
- PDF baixado por link assinado de curta duração, com registro na auditoria.

### Importação mensal das posições

Arquivo CSV ou XLSX, com todas as famílias ou uma por vez, para os dois canais. Modelo de colunas (linhas fictícias):

```csv
data_referencia,codigo_cliente,custodiante,codigo_ativo,isin,cnpj,nome_ativo,quantidade,preco_unitario,valor_bruto,valor_liquido,moeda
2026-09-30,AND001,Custodiante A,NTNB-2035,,,Tesouro IPCA+ 2035,120,4380.55,525666.00,512020.00,BRL
2026-09-30,AND001,Custodiante A,CDB-BANCOX-2028,,,CDB Banco X 2028,1,850000.00,850000.00,838500.00,BRL
2026-09-30,AND001,Custodiante B,FUNDO-MM-Y,,00.000.000/0001-00,Fundo Multimercado Y,152340.12,6.5642,999990.00,991250.00,BRL
2026-09-30,AND001,Custodiante C,ETF-GLOBAL-Z,,,ETF Global Z,1800,105.20,189360.00,189360.00,USD
```

Regras:

- Colunas obrigatórias, datas no formato AAAA-MM-DD e números com ponto decimal (aceitar vírgula e converter).
- **Conferência:** o PL oficial é informado por família e mês (extrato do custodiante na CADM, extrato da corretora na AI), e a soma de `valor_liquido` das posições precisa bater com ele, com tolerância de 0,01%. Diferença maior bloqueia só aquela família, que fica fora do fechamento, com aviso.
- Ativo sem classe vai para a fila de mapeamento do comitê, e a família fica bloqueada até ser resolvido.
- Prévia antes de confirmar; importação tudo ou nada. Reimportar o mesmo mês substitui a anterior e fica registrado na auditoria.
- Moeda estrangeira: converter pelo dólar de venda do Banco Central (série 1) na data de referência.
- Patrimônio por classe = soma de `valor_liquido` por `class_code`.

### Dados mensais por canal

O ciclo mensal recebe duas planilhas por canal, posições por ativo e aportes e resgates do mês, e só libera a rodada quando o PL de cada família bate com o extrato.

| Dado | CADM | AI |
|---|---|---|
| Posições por ativo | Controle interno da gestão, a mesma base do reporte à ANBIMA | Posições na corretora: exportação do portal do assessor ou extrato mensal (formato a confirmar) |
| Aportes e resgates | Mesmas regras do reporte CADM à ANBIMA | Movimentações da conta na corretora, com as mesmas regras |
| PL para conferência | Extrato oficial de cada custodiante | Extrato da corretora |
| Plano da família | Gestão cadastra antes do primeiro relatório | Responsável cadastra antes do convite |

- Status por família e mês (importado, conferido, bloqueado, rodado, fechado) e por canal (aberto, fechado). Só família fechada alimenta relatório e app; família bloqueada fica de fora, com aviso.
- Plausibilidade: rentabilidade real do mês fora da faixa de −10% a +10% pede confirmação de quem importou.
- Meses anteriores podem ser importados, se houver, para formar a rentabilidade desde o início.

### Aportes e resgates

Modelo de colunas (linhas fictícias):

```csv
data_referencia,codigo_cliente,custodiante,data_movimento,tipo,valor,moeda,descricao
2026-10-31,AND001,Custodiante A,2026-10-15,resgate,300000.00,BRL,Resgate para reforma
```

- `tipo` é aporte ou resgate, sempre com valor positivo.
- Transferências entre contas da mesma família se anulam. Taxas, impostos e pagamentos à Aware não são aporte nem resgate: são as regras que a gestão já usa no reporte CADM à ANBIMA.
- Rentabilidade do mês por Dietz modificado com as datas dos movimentos, deflacionada pelo IPCA (ver "Termômetro mensal"). Sem data do movimento, assumir o meio do mês e marcar "datas aproximadas".
- Moeda estrangeira e reimportação seguem as regras das posições.

### Plano corrigido pelo IPCA (a partir da Fase 1)

Cada versão do plano guarda o mês-base dos seus valores (`plan_versions.base_month`). A rodada oficial aplica o IPCA acumulado do mês seguinte ao mês-base até o mês de referência, na montagem das entradas em `src/report`, fora do motor (ver "Motor no ciclo mensal", item 4).

### Dados de mercado

| Fonte | O que usar | Como acessar | Frequência |
|---|---|---|---|
| Banco Central (SGS) | CDI diário (série 12), IPCA mensal (433), Selic meta (432), dólar de venda (1) | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa` | Diária; IPCA mensal |
| Banco Central (Focus, API Olinda) | Expectativas de IPCA e Selic, como contexto para o comitê calibrar premissas | API OData Olinda, recurso Expectativas | Semanal |
| CVM Dados Abertos | Cota diária e patrimônio dos fundos (informe diário), cadastro, classes e subclasses | Arquivos mensais no portal; conferir o dicionário de dados, que mudou em 2025 com as classes e subclasses da Resolução 175 | Diária, em arquivo mensal |
| Tesouro Transparente | Preços e taxas dos títulos do Tesouro Direto | CSV `precotaxatesourodireto.csv` no portal CKAN | Diária |
| ANBIMA Feed | Taxas indicativas e PU de títulos públicos e debêntures; índices IMA-B, IRF-M, IDA, IHFA | `GET https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/mercado-secundario-TPF`, com cadastro no ANBIMA Developers | Diária; acesso a contratar |
| brapi | Cotações, histórico e dividendos de ações, FIIs, BDRs e ETFs | `GET https://brapi.dev/api/quote/{tickers}` com token no cabeçalho Authorization | Diária |

Armadilhas conhecidas do SGS: séries diárias recusam janelas acima de 10 anos (HTTP 406), então busque em janelas de até 3 anos; o atalho `/ultimos/N` aceita no máximo 20 registros; consultas sem `dataFinal` falham.

Uso por fase:

- **v1:** só CDI, IPCA e dólar, para a rentabilidade real, a conversão de moeda e a correção do plano. A rodada oficial usa só o IPCA oficial do mês.
- **v2:** cotas da CVM e preços para estimar o patrimônio entre importações, sempre com o aviso "estimado; o oficial é o relatório mensal".

Rotinas: uma função agendada no servidor busca as séries todo dia útil à noite, grava em `market_series` com inserção idempotente (upsert) e avisa o comitê se uma série ficar mais de 3 dias úteis sem dado novo.

## Segurança, LGPD e compliance

São dados patrimoniais de famílias de alta renda: segurança e LGPD entram na Fase 2, antes do primeiro dado real, e não no fim. A Rota 2 acrescenta três regras: relatório aprovado é imutável, o cliente AI só enxerga a própria família, e o material para clientes AI segue também as regras da assessoria.

### Segurança

- Segundo fator obrigatório (app autenticador) para todos os usuários. Bloqueio após 5 tentativas erradas; sessão de 30 minutos.
- Banco e funções do servidor hospedados de preferência na região de São Paulo.
- Criptografia em trânsito e em repouso. Chaves de API (ANBIMA, brapi, Claude) e a chave secreta do Supabase só no servidor, nunca no navegador nem no repositório. No navegador, só a chave publicável do Supabase.
- Política de acesso por linha em todas as tabelas, mais o teste automatizado de vazamento entre famílias.
- Trilha de auditoria só de inserção para todo acesso e alteração feitos por usuários internos.
- Backups diários com retenção de 30 dias e teste de restauração a cada trimestre.
- Uploads: aceitar só CSV e XLSX até 10 MB, sem executar macros.
- **Relatório CADM:** quatro olhos, imutável depois de aprovado, PDF em bucket privado e download registrado. Nenhum dado sai do console além do PDF que a gestão envia.
- **Cliente AI:** convite do responsável, segundo fator obrigatório e sessão de 30 minutos. Nunca acessa relatórios CADM, auditoria ou outra família.
- Teste de invasão (pentest) independente antes de carregar dados reais na nuvem, inclusive as famílias CADM do piloto (Fase 4).

### LGPD (Lei 13.709/2018)

- Base legal a confirmar com o encarregado de dados: na CADM, execução do contrato de gestão; na AI, precisa ser confirmada, porque não há contrato de gestão. Depois do piloto, consentimento específico para convidar familiares e para usar a IA.
- Minimização: identificar o cliente por código interno. Não guardar CPF nem dados bancários no sistema. Dados reais nunca entram no repositório nem nas conversas com o Claude Code; para testes, use dados anonimizados.
- Direitos do titular: exportar e excluir os dados a pedido, com o pedido registrado.
- Prazos de retenção definidos com compliance, inclusive para os registros de simulação, os PDFs dos relatórios e os números congelados.
- Contratos de tratamento de dados com cada fornecedor (banco de dados, hospedagem e, depois do piloto, o provedor de IA).
- Política de privacidade e termos de uso aceitos no primeiro acesso, com o aceite registrado.

### Compliance

- O relatório e o app são ferramentas de planejamento e simulação. Nenhuma página ou tela sugere produto, ativo ou mudança de alocação.
- **Perfil de investidor:** o cliente AI simula só a carteira atual até compliance aprovar perfis-modelo para clientes AI; depois, só perfis compatíveis com o seu suitability (`households.suitability`). A gestão pode simular qualquer perfil no console, com aviso na tela.
- **Relatório:** quem prepara não aprova o mesmo relatório; o texto automático nunca recomenda; o comentário da gestão é o único texto livre e passa por quem aprova.
- Premissas aprovadas, versionadas e com trilha de quem aprovou.
- Textos legais guardados em tabela com versão. Mudança de texto exige nova aprovação de compliance.
- Referências: Resolução CVM 21 (administração de carteiras), Resolução CVM 30 (dever de verificar a adequação ao perfil do cliente), Resolução CVM 178 (assessores de investimento) e Código ANBIMA de Administração de Recursos de Terceiros.

### Assessoria de investimento

Pela Resolução CVM 178, o assessor atua como preposto e sob a responsabilidade do intermediário que o contrata. Segundo a área técnica da CVM, o material de divulgação do assessor deve mostrar de forma nítida o intermediário, com as logomarcas em destaque ([CVM, interpretações da Resolução 178](https://www.gov.br/cvm/pt-br/assuntos/noticias/2024/area-tecnica-da-cvm-divulga-interpretacoes-relacionadas-a-resolucao-178-marco-regulatorio-dos-assessores-de-investimento)). Essa interpretação não trata de aplicativos; compliance decide, antes da Fase 3, se o app entra nela.

### Textos de aviso (rascunhos para compliance aprovar)

- **Rodapé do relatório:** "Relatório de acompanhamento do plano, preparado pela gestão da Aware Investments com as posições de [mês] e as premissas [versão]. Simulação ilustrativa; não é promessa de rentabilidade nem recomendação de investimento."
- **Rodapé do app AI:** "Simulação com base na sua carteira atual. Não é recomendação de investimento; para decisões, fale com seu assessor."
- **Página "O que mudou":** "A variação foi separada trocando um fator de cada vez. A ordem dos fatores muda a divisão entre eles, não o total."
- **Primeiro relatório:** "Este é o primeiro mês do acompanhamento. A partir do próximo, mostramos o que mudou de um mês para o outro."
- **Aviso completo, nas Notas do relatório e em Como calculamos:** "As projeções deste relatório e deste aplicativo são simulações estatísticas. Elas usam premissas de retorno, risco e correlação definidas pelo comitê de investimentos da Aware Investments e as informações do seu plano. Não garantem resultados futuros, não constituem recomendação de investimento e não substituem a análise da gestão ou do seu assessor. Rentabilidade obtida no passado não representa garantia de rentabilidade futura. Os valores estão em reais de hoje, corrigidos pela inflação. Quando as premissas ou o seu plano mudam, os resultados mudam junto."
- **Respostas da IA (depois do piloto):** "Resposta gerada por inteligência artificial a partir de uma simulação. Confira os parâmetros e fale com seu assessor antes de qualquer decisão."
- **Perfil acima do suitability (visão da gestão):** "Este perfil está acima do perfil de investidor do cliente. Use apenas como ilustração."

## Stack técnica e arquitetura

React em TypeScript, com dois pontos de entrada no mesmo projeto Vite: o console interno (gestão, comitê, compliance, bankers e responsáveis) e o app do cliente AI, celular primeiro. O código do console não entra no pacote do app do cliente. O motor roda num Web Worker no navegador e, nas Edge Functions, a mesma cópia levada por `npm run sync:engine`. Supabase para banco, autenticação, arquivos e funções do servidor a partir da Fase 2. Tudo em TypeScript, para que o motor seja testado sem servidor e reaproveitado nas funções do servidor.

> Diagrama "O motor roda no navegador; o servidor guarda dados e busca o mercado" (arquitetura: navegador, servidor e fontes externas; a mesma biblioteca do motor também roda no recálculo mensal do servidor). **Navegador:** console interno (ciclo mensal, relatórios, PDF e modo apresentação) e app do cliente AI (telas e gráficos, celular primeiro), os dois enviando hipóteses ao Motor (Web Worker: simulações e bisseções, mesmo código do servidor). **Supabase (servidor):** Auth com MFA (convites e papéis), Postgres com RLS (dados, relatórios e auditoria), Storage privado (planilhas e PDFs) e Funções do servidor (importação, dados de mercado, rodada oficial e, depois do piloto, Pergunte ao plano). **Fontes externas:** Banco Central SGS (CDI, IPCA e dólar), CVM, Tesouro, ANBIMA (cotas e preços, v2), brapi (ações, FIIs e ETFs, v2) e API do Claude (perguntas, depois do piloto).

O navegador conversa com o Postgres sempre sob as políticas de acesso por linha. As funções do servidor importam as planilhas, buscam dados de mercado, fazem a rodada oficial (com a mesma biblioteca do motor) e, depois do piloto, chamam a API do Claude.

**Onde roda a rodada oficial:** numa Edge Function, uma requisição por rodada (cada passo da ponte é uma rodada), o que também serve ao recálculo de todas as famílias quando o comitê publica premissas. As Edge Functions têm limite de 2 s de CPU por requisição ([limites do Supabase](https://supabase.com/docs/guides/functions/limits)); uma rodada de 10.000 trajetórias deve caber, e isso é medido na Fase 2, etapa 3. Se não couber: a rodada roda no console, quem aprova refaz no próprio navegador, e o servidor só grava se a versão do motor for a publicada e o hash dos resultados bater.

| Camada | Escolha |
|---|---|
| Interface | React, TypeScript, Vite, Tailwind CSS e shadcn/ui |
| Gráficos | Recharts nas telas; D3 só se a faixa P10 a P90 exigir. No PDF, os componentes `<Svg>` do @react-pdf/renderer |
| PDF do relatório | @react-pdf/renderer no navegador do console, sem servidor de PDF, a partir dos números congelados (outra opção entra no plano da Fase 1 e vai para `docs/DECISOES.md`) |
| Formulários | React Hook Form com Zod (os mesmos schemas validam as entradas do motor) |
| Motor | TypeScript puro em `src/engine`, sem dependências, rodando num Web Worker |
| Testes | Vitest para o motor e a interface; Playwright para os fluxos principais; pgTAP para o banco |
| Banco e login | Supabase: Postgres, Auth com MFA, políticas de acesso por linha, Storage (Fase 2) |
| Servidor | Supabase Edge Functions (Deno), com agendamento para as rotinas |
| Desenvolvimento local | Supabase CLI como dependência do projeto (`npx supabase`) e Docker |
| Planilhas | Papa Parse para CSV e SheetJS para XLSX |
| Números e datas | `Intl.NumberFormat('pt-BR')` e date-fns |
| Integração contínua | GitHub Actions: checagem de tipos, lint e testes a cada push |
| Hospedagem do front-end | A definir com TI (Vercel, Netlify ou Cloudflare Pages); na Fase 1, a revisão do relatório é local |

Estrutura do repositório (o kit já traz `CLAUDE.md`, `.claude/`, `docs/` e `reference/`):

```text
CLAUDE.md                     # regras para o Claude Code
README.md
.claude/
  skills/fase/SKILL.md        # comando /fase N
  agents/revisor-motor.md     # subagente que revisa o motor
docs/
  SPEC.md  PROGRESSO.md  DECISOES.md  ROTA-2.md
reference/                    # não editar
  gemeo.html  motor_referencia.py  andrade.json  resultados_referencia.json
src/
  engine/                     # simulate, requiredReturn, solvers, cholesky, rng, guardrails
    __tests__/
  report/                     # entradas do mês, plano corrigido pelo IPCA, rentabilidade, ponte (attribution.ts) e páginas do relatório
    __tests__/
  workers/engine.worker.ts
  data/                       # andrade.json, fechamentos fictícios, premissas e choques
  console/                    # ponto de entrada do console interno: famílias, plano, mês, relatórios, comitê, usuários
  app/                        # ponto de entrada do app do cliente AI: as sete telas
  lib/
    supabase.ts  format.ts
scripts/
  reference.ts  sync-engine.ts
supabase/                     # a partir da Fase 2
  migrations/  seed.sql  tests/
  functions/
    _shared/engine/  import-positions/  market-sync/  official-run/  ask-plan/ (depois do piloto)
.github/workflows/ci.yml
.env.example
```

### Scripts do projeto

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Todos os testes (Vitest) |
| `npm run test:engine` | Só os testes do motor |
| `npm run typecheck` | Checagem de tipos de todo o projeto |
| `npm run lint` | ESLint |
| `npm run reference` | Roda a Família Andrade no motor e imprime, por métrica, o valor obtido, o de referência, a tolerância e se passou; termina com erro se alguma falhar |
| `npm run sync:engine` | Copia `src/engine` para `supabase/functions/_shared/engine` (Fase 2) |

### Ambiente local

- Node.js 22 LTS (o Vite exige 20.19+ ou 22.12+), npm e Git.
- Python 3 com numpy, só para `reference/motor_referencia.py`.
- A partir da Fase 2: Docker Desktop (ou OrbStack, Rancher Desktop, Podman) e o Supabase CLI como dependência do projeto, usado com `npx supabase`.
- Variáveis em `.env.local`, fora do git: URL e chave publicável do Supabase, com prefixo `VITE_` para o navegador. A chave secreta do Supabase e as chaves da ANBIMA, da brapi e do Claude vão só nos segredos das funções do servidor.
- O motor também roda nas funções do servidor (Deno). Por isso não tem dependências e usa imports relativos terminados em `.ts`, que o Deno exige; o TypeScript aceita esses imports com a opção `allowImportingTsExtensions`.
- SheetJS vem da CDN oficial (cdn.sheetjs.com); a versão do registro npm parou na 0.18.5.

## Design e linguagem

Visual sóbrio de family office: espaço generoso, números grandes e cor usada só para dar significado.

### Identidade

- Cores e logotipo da Aware: a receber. Até lá, use um verde-escuro institucional como cor principal e cinzas levemente esverdeados, como no protótipo. No app AI, a marca do intermediário entra se compliance exigir.
- Tipografia: uma serifada para títulos e números de destaque (ex.: Fraunces) e uma sem serifa para o texto (ex.: IBM Plex Sans). Algarismos tabulares em tabelas.
- Temas claro e escuro no app e no console.
- Cores de estado só nas faixas (azul, verde, amarelo, vermelho), sempre acompanhadas de texto.

### Relatório

- A4 paisagem, legível na tela e impresso; sete páginas (ver "Conteúdo do relatório").
- Toda página com número mostra a data das posições e a versão das premissas, no rodapé do relatório.
- Gráficos desenhados nos componentes `<Svg>` do @react-pdf/renderer, com as mesmas cores e convenções do app.
- O modo apresentação mostra o próprio PDF em tela cheia.

### Gráfico de trajetória

- Eixo horizontal em idade, não em ano. Linhas verticais tracejadas marcam a aposentadoria e os eventos.
- Faixa P10 a P90 em tom claro, faixa P25 a P75 mais escura, mediana em linha grossa, P10 em linha fina vermelha.
- Eixo vertical em "R$ mi de hoje", começando em zero.
- No relatório (página 5), o patrimônio realizado desde o início do acompanhamento, em reais da data de referência, seguido do leque projetado.
- Ao tocar: idade, ano e valores do cenário ruim, do meio e bom.
- Em comparações, a mediana de cada cenário com legenda pelo nome.
- No celular: largura total e cerca de 260 px de altura.

### Linguagem

Português do Brasil, frases curtas, sem jargão. Termos técnicos ganham uma explicação ao tocar. Na tela, use as traduções abaixo:

| Termo técnico | Como aparece na tela |
|---|---|
| Probabilidade de sucesso | Chance de o plano dar certo ("87 de cada 100 cenários") |
| Benchmark pessoal | Retorno que o seu plano precisa |
| P10, P50, P90 | Cenário ruim, cenário do meio, cenário bom |
| Volatilidade | Oscilação |
| Monte Carlo | Simulação de milhares de cenários |
| Retorno real | Rendimento acima da inflação |
| Guardrails | Ajustes de gasto em anos ruins |
| Folga | Margem de segurança |

Mostre a probabilidade também como frequência ("87 de cada 100 cenários"): é mais fácil de entender do que um percentual sozinho.

### Formatação de números

- Moeda: "R$ 12,4 mi", "R$ 850 mil", "R$ 85 mil por mês". Em tabelas detalhadas, o valor exato: "R$ 12.400.000,00".
- Percentuais: probabilidade sem casas decimais ("87%"), retornos com uma casa ("IPCA + 3,8% a.a."), variações em pontos percentuais ("−2 p.p.").
- Datas: "set/2026" e "30/09/2026". Idades: "aos 62 anos".
- Todo patrimônio projetado leva "em valores de hoje".

### Acessibilidade

- Contraste AA, foco visível e controles operáveis pelo teclado.
- Todo controle deslizante tem um campo numérico ao lado.
- Todo gráfico tem um resumo em texto (a frase de leitura).
- Respeitar a preferência por movimento reduzido.

### Exemplos de texto

- Sem números do mês (app AI): "Ainda não temos os números de setembro. Assim que a gestão fechar o mês, eles aparecem aqui."
- Erro na conferência (console): "A soma da planilha (R$ 12.380.000) não bate com o relatório oficial (R$ 12.400.000). Confira as linhas do Custodiante B antes de publicar."
- Frase de leitura em faixa amarela: "Em 78 de cada 100 cenários o dinheiro dura até os 95. No cenário ruim, ele acaba aos 89." No app, completa com "Vale revisar o plano com seu assessor."; no relatório, com "Vale revisar o plano na conversa do mês."
- Frase automática da ponte (exemplo ilustrativo): "A chance foi de 92,6% para 91,4% em outubro, principalmente pelo resgate de R$ 300 mil fora do plano (−0,9 p.p.). O plano continua na faixa verde."

## Dados de exemplo: Família Andrade

Família fictícia para desenvolvimento, testes e demonstração. O mesmo JSON está em `reference/andrade.json`; na Fase 0, ele foi copiado para `src/data/andrade.json`, a fonte única dos testes, do relatório de exemplo da Fase 1, das telas do app e da semente do banco na Fase 2. Convenções: o ano civil do passo t é o ano da data de referência + t; anos de início e fim são inclusivos; valores em reais de hoje.

```json
{
  "household": {
    "id": "andrade",
    "name": "Família Andrade (fictícia)",
    "bankerId": "alex",
    "referenceDate": "2026-09-30",
    "profileId": "moderado",
    "suitability": "moderado",
    "feeRate": 0.008,
    "horizonAge": 95,
    "legacyMin": 3000000
  },
  "people": [
    { "id": "ricardo", "name": "Ricardo Andrade", "birthDate": "1974-03-15", "sex": "M", "role": "titular", "retirementAge": 62 },
    { "id": "helena", "name": "Helena Andrade", "birthDate": "1976-08-02", "sex": "F", "role": "conjuge" },
    { "id": "pedro", "name": "Pedro Andrade", "birthDate": "2009-05-10", "sex": "M", "role": "filho" },
    { "id": "laura", "name": "Laura Andrade", "birthDate": "2012-11-21", "sex": "F", "role": "filho" }
  ],
  "cadmPositionsByClass": {
    "POS": 3000000, "INF": 3000000, "PRE": 600000, "CRED": 1800000,
    "MM": 1200000, "ACOES": 960000, "FII": 480000, "INTL": 960000
  },
  "otherAssets": [
    { "id": "vgbl", "kind": "previdencia", "name": "VGBL", "value": 1800000, "classCode": "POS", "inSimulation": true },
    { "id": "apto", "kind": "imovel", "name": "Apartamento (residência)", "value": 4500000, "canBeSold": false },
    { "id": "casa-praia", "kind": "imovel", "name": "Casa de praia", "value": 3500000, "canBeSold": true, "netSaleValue": 3200000 },
    { "id": "sala", "kind": "imovel", "name": "Sala comercial", "value": 1200000, "canBeSold": true, "annualIncome": 84000 },
    { "id": "empresa", "kind": "empresa", "name": "Participação na empresa da família", "value": 6000000, "canBeSold": false }
  ],
  "cashFlows": [
    { "kind": "renda", "name": "Pró-labore do Ricardo", "annualAmountReal": 1200000, "startYear": 2026, "endYear": 2035 },
    { "kind": "dividendos", "name": "Dividendos da empresa", "annualAmountReal": 480000, "startYear": 2026, "endYear": 2035, "otherAssetId": "empresa" },
    { "kind": "aluguel", "name": "Aluguel da sala", "annualAmountReal": 84000, "startYear": 2026, "endYear": 2071, "otherAssetId": "sala" },
    { "kind": "gasto_essencial", "name": "Gasto essencial", "annualAmountReal": 660000, "startYear": 2026, "endYear": 2071 },
    { "kind": "gasto_estilo", "name": "Estilo de vida", "annualAmountReal": 360000, "startYear": 2026, "endYear": 2071 }
  ],
  "events": [
    { "name": "Faculdade do Pedro", "direction": "saida", "amountReal": 180000, "year": 2027, "recurrence": "anual", "endYear": 2031 },
    { "name": "Faculdade da Laura", "direction": "saida", "amountReal": 180000, "year": 2031, "recurrence": "anual", "endYear": 2035 },
    { "name": "Troca de carros", "direction": "saida", "amountReal": 400000, "year": 2028, "recurrence": "a_cada_n", "everyN": 5, "endYear": 2058 },
    { "name": "Entrada do apartamento do Pedro", "direction": "saida", "amountReal": 800000, "year": 2035, "recurrence": "unica" }
  ],
  "goals": [
    { "kind": "padrao_de_vida", "personId": "helena", "targetAge": 95 },
    { "kind": "legado", "amount": 3000000 }
  ],
  "rules": {
    "enabled": true, "mode": "trajetoria_referencia",
    "lower": 0.8, "upper": 1.2, "cut": 0.1, "raise": 0.1,
    "floor": 0.5, "cap": 1.3, "noCutLastYears": 15
  }
}
```

O patrimônio simulado começa em R$ 13,8 mi (CADM de R$ 12 mi mais o VGBL). O horizonte é de 45 anos, até a Helena completar 95. O Ricardo se aposenta em 2036, aos 62 anos, quando param o pró-labore e os dividendos.

### Fechamentos fictícios (a partir da Fase 1)

Dois fechamentos da Família Andrade em `src/data/`, base do relatório de exemplo e dos testes da ponte:

- **Setembro/2026:** os dados acima, como estão.
- **Outubro/2026:** patrimônio por classe no fechamento coerente com rentabilidade real de cerca de −2,5% no mês (IPCA fictício de 0,40%), resgate de R$ 300 mil em 15/10, VGBL com valor real constante e nova versão do plano, com mês-base outubro, subindo o estilo de vida de R$ 30 mil para R$ 35 mil por mês.

### Resultados de referência

Calculados com `reference/motor_referencia.py`, que segue esta especificação, com as premissas ilustrativas e 50.000 trajetórias, para reduzir o ruído do sorteio. Os valores e as tolerâncias também estão em `reference/resultados_referencia.json`, lido pelo teste 13 e por `npm run reference`. O gerador aleatório do TypeScript é diferente do NumPy, então as métricas sorteadas não batem exatamente: precisam cair dentro das tolerâncias. As métricas sem sorteio (benchmark pessoal) precisam bater na precisão indicada.

A partir da Fase 1, com os sorteios alinhados por trajetória e o passo de 12 meses, estes números mudam (benchmark com legado perto de IPCA + 3,25%, sem legado perto de 3,05%, e a chance cai junto). A atualização de `reference/` é a única exceção à regra de não editar a pasta, numa mudança isolada aprovada por Murilo. Até lá, valem os números abaixo.

| Métrica | Valor de referência | Tolerância |
|---|---|---|
| Retorno composto líquido do perfil moderado | 3,90% a.a. | ±0,05 p.p. |
| Benchmark pessoal, com legado de R$ 3 mi | IPCA + 2,98% | ±0,01 p.p. (cálculo sem sorteio) |
| Benchmark pessoal, sem legado | IPCA + 2,77% | ±0,01 p.p. |
| Folga | +0,92 p.p. | ±0,05 p.p. |
| Probabilidade de sucesso, sem gasto flexível | ≈ 93% (92,9%) | ±2 p.p. |
| Probabilidade do legado, sem gasto flexível | ≈ 89% | ±2 p.p. |
| Patrimônio mediano aos 95 anos, sem gasto flexível | ≈ R$ 20,5 mi | ±R$ 1,5 mi |
| Probabilidade de sucesso, com gasto flexível padrão | ≈ 99% | ±1 p.p. |
| Chance de corte, régua da trajetória de referência | ≈ 35% | ±5 p.p. |
| Chance de corte, régua Guyton-Klinger | ≈ 99,6% | ±1 p.p. |
| Gasto sustentável com 90% de chance | ≈ R$ 87 mil por mês (hoje: R$ 85 mil) | ±R$ 3 mil |

## Testes e critérios de aceite

O motor só é aceito quando passa nos testes abaixo e reproduz os resultados de referência da Família Andrade. Os valores numéricos dos testes 1 a 3 foram calculados com a convenção de fluxo desta especificação.

### Testes do motor (Vitest)

| # | Teste | Entrada | Resultado esperado |
|---|---|---|---|
| 1 | Saque exato sem retorno | R$ 1.000.000; déficit de R$ 50.000 no início de cada ano; r = 0; 20 anos | Patrimônio final 0; benchmark pessoal 0,00% |
| 2 | Saque que zera o patrimônio | R$ 1.000.000; r = 4% real; 30 anos; saque no início do ano | Saque de R$ 55.605,86 zera o patrimônio no fim do 30º ano |
| 3 | Bisseção do benchmark | R$ 1.000.000; déficit de R$ 60.000 por ano; 25 anos; sem legado | r* = 3,7366% (±0,001 p.p.) |
| 4 | Volatilidade zero | Todas as classes com σ = 0 | Probabilidade 0% ou 100%; trajetória igual à do cálculo sem sorteio |
| 5 | Renda cobre tudo | Renda ≥ gastos em todos os anos | Probabilidade 100% |
| 6 | Reprodutibilidade | Mesma entrada e mesma semente | Resultado idêntico; com outra semente, probabilidade a ±2 p.p. |
| 7 | Calibração dos sorteios | 200 mil sorteios por classe | Média a ±0,3 p.p. de μ; volatilidade a ±10% de σ; correlações a ±0,02 |
| 8 | Matriz de correlação | Matriz não positiva definida | Erro claro; a matriz desta especificação passa |
| 9 | Convenção de fluxo | Déficit maior que o patrimônio no início do ano | Falha naquele ano, qualquer que seja o retorno do ano |
| 10 | Monotonia | Mais gasto ou menos patrimônio, mesma semente | Probabilidade nunca sobe |
| 11 | Gasto flexível | Regras ligadas, mesma semente | Probabilidade ≥ sem regras; estilo de vida entre piso e teto; nenhum corte nos últimos 15 anos |
| 12 | Choques | Choque de −30% no 1º ano | Probabilidade menor; choque zero = sem choque |
| 13 | Família Andrade | Dados de exemplo | Dentro das tolerâncias dos resultados de referência |
| 14 | Desempenho | 5.000 trajetórias × 45 anos × 8 classes | Menos de 1 s no navegador; limite de 2 s na integração contínua |

Os testes 1 a 12 e 14 continuam passando a partir da Fase 1; se algum depender da convenção anual antiga, mostrar antes de alterar.

### Testes da Fase 1 em diante

| # | Teste | Entrada | Resultado esperado |
|---|---|---|---|
| 15 | Pesos explícitos | Pesos iguais aos do perfil | Resultado idêntico, bit a bit, ao do `profileId` |
| 16 | Sorteios alinhados | Entradas diferentes (patrimônio, plano, pesos, premissas, horizonte) com a mesma semente | Os mesmos sorteios |
| 17 | Resgate pequeno | Resgate de R$ 1 mil | A chance nunca aumenta |
| 18 | Passo de 12 meses | Data de referência no fim do mês; último passo com m < 12 meses | Fluxos pro rata; evento no seu mês (sem mês, julho); último passo com (1 + R)^(m/12) − 1; aposentado só se a aposentadoria foi antes do início do passo; sem corte nos últimos 15 passos |
| 19 | Ponte | Dois fechamentos da Família Andrade | Estado inicial com o hash de entradas da rodada oficial anterior, final com o da rodada do mês; soma dos passos, em trajetórias, igual à variação total |
| 20 | Rentabilidade do mês | Posições e aportes e resgates do mês | Dietz modificado deflacionado pelo IPCA; sem data do movimento, meio do mês e "datas aproximadas" |

### Critérios de aceite do produto

- [ ] Logado como cliente AI da família A, não se lê nada da família B, nem `reports`, `audit_log` ou famílias CADM (teste pgTAP, rodado com `supabase test db`).
- [ ] Conferência com diferença acima de 0,01% entre as posições e o PL oficial bloqueia só aquela família.
- [ ] Ativo sem classe bloqueia o cálculo da família e aparece na fila do comitê.
- [ ] Toda rodada oficial gera um registro em `simulation_runs` (semente, versão do motor, versão das premissas e hash das entradas) e pode ser refeita com o mesmo resultado.
- [ ] A ponte fecha exatamente: a soma dos passos, em trajetórias, é a variação total.
- [ ] Quem prepara um relatório não consegue aprová-lo; relatório aprovado não muda (gatilho e teste pgTAP), e corrigir gera nova versão com motivo.
- [ ] Uma versão de premissas só vale depois de aprovada, e o recálculo de todas as famílias fica registrado.
- [ ] O "E se?" do app responde em menos de 1 segundo após soltar o controle, num celular intermediário.
- [ ] A tela inicial do app funciona em 375 px de largura sem rolagem horizontal.
- [ ] O PDF do relatório é legível na tela e impresso (A4 paisagem).
- [ ] Nenhum texto voltado ao cliente, no relatório ou no app, recomenda produto, ativo ou alocação.
- [ ] O aviso legal, a data das posições e a versão das premissas aparecem em todas as telas e páginas com números.
- [ ] Temas claro e escuro do app legíveis, com contraste AA.
- [ ] O cliente AI só simula a carteira atual, até compliance aprovar perfis-modelo.
- [ ] A rodada do mês de todas as famílias CADM leva menos de 20 minutos num computador da gestão.
- [ ] Checagem de tipos, lint, testes do motor e testes do banco passam na integração contínua a cada push.

## Plano de entrega por fases

Cinco fases, cada uma com um portão de saída. Uma fase só começa quando o portão da anterior está cumprido. O relatório vem antes do app porque é de uso interno e não depende de login de cliente; a segurança entra antes do primeiro dado real.

> Diagrama "O relatório chega aos clientes CADM antes de o app chegar aos clientes AI" (roteiro: 5 fases e portões). Fase 0 (concluída) → Fase 1 (próxima) → Fase 2 → Fase 3 → Fase 4, cada uma com o portão abaixo.

1. **Fase 0: fundação e motor, sem servidor.** Concluída em 02/10/2026. Projeto Vite com React e TypeScript, Vitest, ESLint, integração contínua, scripts do projeto, Família Andrade em `src/data/andrade.json` e o motor completo em `src/engine`.
   - Portão (cumprido): testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e revisão do `revisor-motor` sem divergências abertas.
2. **Fase 1: relatório de exemplo, sem servidor.** Branch `fase-1-relatorio-exemplo`.
   - As quatro mudanças de "Motor no ciclo mensal", nesta ordem e em commits separados: pesos explícitos; sorteios alinhados por trajetória; passo de 12 meses, com o motor de referência e os resultados atualizados; plano corrigido pelo IPCA em `src/report`.
   - Família Andrade em dois fechamentos fictícios em `src/data/` (ver "Fechamentos fictícios").
   - Rentabilidade do mês (Dietz modificado e IPCA) e ponte "o que mudou" em `src/report`, como módulos puros com testes.
   - As sete páginas do relatório, o PDF e o modo apresentação, com os textos automáticos.
   - Portão: testes do motor e `npm run reference` passando com os resultados novos; testes da ponte (hashes dos extremos e soma em trajetórias); `revisor-motor` sem divergências; PDF de outubro/2026 da Andrade aprovado por Murilo e Alex.
3. **Fase 2: ciclo mensal interno, com dados reais.** Branch `fase-2-ciclo-mensal`. O projeto na nuvem (região São Paulo) só nasce com autorização de Murilo. Em quatro etapas:
   1. Supabase local: migrações (as tabelas de "Dados e integrações"), políticas por linha, segundo fator para usuários internos e testes pgTAP (vazamento entre famílias e relatório aprovado imutável).
   2. Importação de posições e de aportes e resgates, conferência, mapeamento de ativos e fechamento do mês.
   3. Console: famílias por canal, editor do plano, rodada oficial do mês em lote, uma Edge Function por rodada, com o tempo de CPU medido; rotinas de CDI, IPCA e dólar.
   4. Relatórios no banco: rascunho, revisão, aprovação com quatro olhos, PDF no Storage, registro da apresentação e trilha de auditoria.
   - Portão: pgTAP passando; uma família CADM real, anonimizada, importada, conferida e com relatório aprovado; textos do relatório aprovados por compliance; rodada do mês de todas as famílias CADM em menos de 20 minutos num computador da gestão.
4. **Fase 3: app dos clientes AI.** Branch `fase-3-app-ai`.
   - Telas do cliente (Entrar, Visão geral, E se?, Patrimônio, Plano, Como calculamos e Histórico), primeiro com a Família Andrade e depois ligadas ao banco.
   - Convite pelo responsável, segundo fator do cliente e políticas por linha para o papel cliente_ai.
   - Ajustes do canal: carteira atual no motor, custo por cliente, linha da ponte na Visão geral e identidade conforme compliance.
   - Portão: tela inicial em 375 px e no tema escuro; "E se?" em menos de 1 s num celular intermediário; teste de vazamento do papel cliente_ai passando; uso de ponta a ponta com contas fictícias.
5. **Fase 4: piloto e operação.** Branch `fase-4-piloto`.
   - Teste de invasão independente antes de carregar dados reais na nuvem, inclusive as famílias CADM do piloto; termos de uso e política de privacidade; textos aprovados pela compliance da Aware e, se exigido, pela corretora.
   - Piloto por dois fechamentos: relatório para 3 a 5 famílias CADM e app para 3 a 5 clientes AI.
   - E-mail mensal ao cliente AI avisando que os números do mês saíram, sem valores no corpo.
   - Portão: dois fechamentos sem erro de conferência e retorno da gestão e dos clientes do piloto. Depois do piloto: familiar convidado, "Pergunte ao plano", longevidade e impostos.

### Mensagens prontas

O comando `/fase N` do kit já segue este roteiro: lê a fase, apresenta um plano e espera sua aprovação. As mensagens abaixo servem para usar sem o comando, sempre numa conversa nova e com o modo de planejamento ligado.

- **Fase 1:** "Fase 1: relatório de exemplo, sem servidor. Comece pelas quatro mudanças de Motor no ciclo mensal, em commits separados e nesta ordem: pesos explícitos, sorteios alinhados por trajetória, passo de 12 meses (com o motor de referência e os resultados de referência atualizados numa mudança isolada) e plano corrigido pelo IPCA. Me mostre os números antes e depois de cada mudança no motor e peça a revisão do revisor-motor. Depois crie os dois fechamentos fictícios da Família Andrade, a rentabilidade do mês e a ponte em src/report, com testes, e por fim as sete páginas, o PDF e o modo apresentação. Me mostre o plano antes de editar."
- **Revisão do motor (sempre que o motor mudar):** "Use o subagente revisor-motor para revisar src/engine. Me mostre as divergências antes de corrigir qualquer coisa."
- **Fase 2, etapa 1:** "Fase 2, etapa 1: Supabase local com as migrações do SPEC, políticas por linha, segundo fator para usuários internos e testes pgTAP, incluindo vazamento entre famílias e relatório aprovado imutável. Vou deixar o Docker aberto. Nada na nuvem."
- **Fase 2, etapa 2:** "Fase 2, etapa 2: importação de posições e de aportes e resgates, conferência, mapeamento de ativos e fechamento do mês."
- **Fase 2, etapa 3:** "Fase 2, etapa 3: console com famílias por canal, editor do plano, rodada oficial do mês em lote, uma Edge Function por rodada, medindo o tempo de CPU, e rotinas de CDI, IPCA e dólar."
- **Fase 2, etapa 4:** "Fase 2, etapa 4: relatórios no banco, com rascunho, revisão, aprovação por quatro olhos, PDF no Storage, registro da apresentação e auditoria."
- **Fase 2, nuvem (só com autorização de Murilo):** "Criei o projeto Supabase na região São Paulo e fiz login na CLI. Ligue o repositório ao projeto (supabase link), aplique as migrações (supabase db push) sem o seed de exemplo e me diga quais variáveis e segredos configurar."
- **Fase 3:** "Fase 3: app dos clientes AI. Primeiro as telas com a Família Andrade, depois ligadas ao banco, com convite, segundo fator e políticas para o papel cliente_ai. A tela inicial precisa funcionar em 375 px e no tema escuro."
- **Fase 4:** "Fase 4: prepare o piloto com termos de uso, e-mail mensal sem valores e os checklists do teste de invasão e do fechamento mensal. Nada vai para clientes sem minha autorização."

### Entre uma fase e outra

- Peça a revisão independente: o subagente `revisor-motor` quando o motor mudar e `/code-review` para o restante do diff.
- Faça o commit ou abra um pull request; a integração contínua precisa passar.
- Confira `docs/PROGRESSO.md` e comece a fase seguinte numa conversa nova (`/clear`). Conversas longas acumulam contexto e perdem precisão.
- Se o Claude Code errar a mesma coisa duas vezes, acrescente a regra ao `CLAUDE.md`.
- Para retomar uma conversa interrompida: `claude --continue` (a mais recente) ou `claude --resume` (escolher da lista).

## Links úteis

Conferidos em 01/10/2026; os de Claude Code, Supabase, Vite e SheetJS, em 02/10/2026. "Aberto" = página lida na revisão; "localizado" = endereço oficial encontrado por busca, sem leitura do conteúdo.

| Tema | Link | Para quê | Conferência |
|---|---|---|---|
| Inspiração | [Map My Money (App Store)](https://apps.apple.com/us/app/map-my-money/id6758605068) | Projeção de patrimônio, metas e cenários "e se" | Aberto |
| Inspiração | [Post no r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1serdlo/i_built_a_personal_finance_dashboard_using_claude/) | Dashboard de finanças pessoais feito com Claude | Não acessível na revisão |
| Metodologia | [Kitces: guardrails por risco](https://www.kitces.com/blog/risk-based-monte-carlo-probability-of-success-guardrails-retirement-distribution-hatchet/) | Probabilidade-alvo e limites de 70% e 99% | Aberto |
| Metodologia | [Kitces: crítica às regras Guyton-Klinger](https://www.kitces.com/blog/guyton-klinger-guardrails-retirement-income-rules-risk-based/) | Regras originais: gatilho de 20%, ajuste de 10%, sem cortes nos últimos 15 anos | Aberto |
| Longevidade | [Tábua BR-EMS 2021 (SciELO)](https://www.scielo.br/j/rbepop/a/zyWwVwmnbZhNz9JTSTjB4bd/abstract/?lang=pt) | Mortalidade da população segurada, para a longevidade estocástica (depois do piloto) | Localizado |
| Longevidade | [IBGE: tábuas completas de mortalidade](https://www.ibge.gov.br/estatisticas/todos-os-produtos-estatisticas/9126-tabuas-completas-de-mortalidade.html) | Alternativa com a população geral | Localizado |
| Mercado | [Guia do SGS e da Focus (TabNews)](https://www.tabnews.com.br/SidneyBissoli/series-do-banco-central-como-consultar-o-sgs-a-focus-e-a-ptax-sem-cair-nas-armadilhas) | Formato da API, limite de 10 anos, atalho de 20 registros | Aberto |
| Mercado | [Exemplo de chamada ao SGS: IPCA, últimos 3 meses](https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json) | Testar a integração | Citado no guia aberto |
| Mercado | [CVM: informe diário de fundos](https://dados.cvm.gov.br/dataset/fi-doc-inf_diario) | Cotas diárias e patrimônio dos fundos | Localizado (site fora do ar na checagem) |
| Mercado | [CVM: dicionário de dados do informe diário](https://dados.cvm.gov.br/dataset/fi-doc-inf_diario/resource/40891357-ddf8-45eb-9a06-1239dde929cd) | Campos atuais dos arquivos | Localizado |
| Mercado | [CVM: novidades de 2025 no portal de dados](https://www.gov.br/cvm/pt-br/assuntos/noticias/2025/portal-dados-abertos-cvm-traz-novidades-nas-informacoes-sobre-fundos-de-investimento) | Classes e subclasses da Resolução 175 nos arquivos | Aberto |
| Mercado | [Tesouro Transparente: preços e taxas do Tesouro Direto](https://tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1) | CSV diário; [download direto](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv) | Aberto |
| Mercado | [ANBIMA Developers: API de títulos públicos](https://developers.anbima.com.br/en/documentacao/precos-indices/apis-de-precos/titulos-publicos/) | Taxas indicativas, PU, VNA e curvas | Aberto |
| Mercado | [brapi: ações e ativos da B3](https://brapi.dev/docs/acoes) | Cotações, histórico e dividendos | Aberto |
| Regulação | [Lei 13.709/2018 (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) | Proteção de dados | Localizado |
| Regulação | [Resolução CVM 21, texto consolidado](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/001/resol021consolid.pdf) | Administração de carteiras | Localizado |
| Impostos | [Lei 14.754/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm) | Aplicações no exterior e fundos exclusivos | Localizado |
| Impostos | [Lei 15.270/2025: perguntas e respostas da Receita (Demarest)](https://www.demarest.com.br/receita-federal-divulga-perguntas-e-respostas-sobre-a-nova-tributacao-de-dividendos-e-altas-rendas/) | Dividendos acima de R$ 50 mil por mês e imposto mínimo | Aberto |
| Claude Code | [Boas práticas](https://code.claude.com/docs/en/best-practices) | Planejar antes de codar, verificar com testes, revisão por subagente | Aberto |
| Claude Code | [CLAUDE.md e memória](https://code.claude.com/docs/en/memory) | Onde fica o CLAUDE.md, tamanho recomendado, imports | Aberto |
| Claude Code | [Skills (comandos personalizados)](https://code.claude.com/docs/en/skills) | O comando `/fase` do kit | Aberto |
| Claude Code | [Subagentes](https://code.claude.com/docs/en/sub-agents) | O subagente `revisor-motor` | Aberto |
| Claude Code | [Fluxos comuns e modo de planejamento](https://code.claude.com/docs/en/common-workflows) | Plano antes de editar, retomar conversas | Aberto |
| Claude Code | [Instalação e requisitos](https://code.claude.com/docs/en/setup) | Sistemas suportados, comandos de instalação, planos | Aberto |
| Supabase | [Desenvolvimento local](https://supabase.com/docs/guides/local-development) | CLI, Docker e ambiente local | Aberto |
| Supabase | [Migrações](https://supabase.com/docs/guides/deployment/database-migrations) | `migration new`, `db reset`, `seed.sql`, `link` e `db push` | Aberto |
| Supabase | [Testes do banco com pgTAP](https://supabase.com/docs/guides/local-development/testing/overview) | Teste de vazamento entre famílias | Aberto |
| Supabase | [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) | Políticas de acesso por linha | Localizado |
| Supabase | [MFA](https://supabase.com/docs/guides/auth/auth-mfa) | Segundo fator e política que exige `aal2` | Aberto |
| Supabase | [Chaves de API](https://supabase.com/docs/guides/api/api-keys) | Chave publicável no navegador, chave secreta só no servidor | Aberto |
| Supabase | [Regiões](https://supabase.com/docs/guides/platform/regions) | São Paulo (sa-east-1) disponível | Aberto |
| Tecnologia | [Vite: primeiros passos](https://vite.dev/guide/) | Node 20.19+ ou 22.12+ e modelo `react-ts` | Aberto |
| Tecnologia | [SheetJS: instalação](https://docs.sheetjs.com/docs/getting-started/installation/frameworks) | Instalar pela CDN oficial | Aberto |
| Tecnologia | [Claude: uso de ferramentas](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) | Definir a ferramenta do Pergunte ao plano | Localizado |
| Supabase | [Limites das Edge Functions](https://supabase.com/docs/guides/functions/limits) | 2 s de CPU por requisição e 256 MB de memória (rodada oficial) | Consultado em 02/10/2026 (Rota 2) |
| Regulação | [CVM: interpretações da Resolução 178](https://www.gov.br/cvm/pt-br/assuntos/noticias/2024/area-tecnica-da-cvm-divulga-interpretacoes-relacionadas-a-resolucao-178-marco-regulatorio-dos-assessores-de-investimento) | Assessor como preposto do intermediário; material que mostra o intermediário de forma nítida | Consultado em 02/10/2026 (Rota 2) |

## Fora de escopo e o que não fazer

O AWARE Objective simula planos e explica o mês; ele não opera, não recomenda e não controla o dia a dia financeiro.

- Não conectar a custodiantes, à corretora nem a Open Finance na v1.
- Não executar ordens, aplicações ou resgates, nem mostrar botões de investir.
- Não recomendar produtos, ativos ou alocação, nem usar frases como "você deveria", no relatório ou no app.
- Não comparar a família com outros clientes nem mostrar rankings de fundos.
- Não categorizar extratos nem controlar gastos do dia a dia: o produto trabalha com o gasto anual planejado.
- Não calcular a declaração de imposto de renda nem gerar guias de pagamento.
- Não dar acesso ao sistema para o cliente CADM: ele recebe o relatório da gestão.
- Não enviar o relatório pelo sistema na primeira versão: a gestão baixa o PDF e envia pelos canais de hoje.
- Não mudar números, PDF ou comentário de relatório aprovado: corrigir é uma nova versão com motivo.
- Não antecipar o que fica para depois do piloto: familiar convidado, "Pergunte ao plano", longevidade estocástica e módulo de impostos.
- Não usar dados reais em desenvolvimento: só a Família Andrade e dados anonimizados.
- Não guardar CPF, dados bancários ou senhas de custodiantes e da corretora.
- Não colocar chaves de API no código do navegador nem guardar dados de clientes no armazenamento local do navegador.
- Não commitar `.env.local`, chaves ou planilhas de clientes.
- Não aplicar migrações direto no banco da nuvem: só por arquivos em `supabase/migrations`, testados antes no Supabase local.
- Não deixar a IA calcular números: quem calcula é sempre o motor.
- Não inventar premissas, séries de mercado ou regras tributárias.
- Não mostrar uma probabilidade sem a data das posições e a versão das premissas ao lado.

## Perguntas em aberto

Decisões que o agente não deve tomar sozinho. Enquanto não houver resposta, use o padrão indicado e registre em `docs/DECISOES.md` (padrões em vigor: D-004 e D-025).

**Rota 2: canais, piloto e relatório (Murilo, Alex e gestão)**

- [ ] Clientes AI: qual corretora e como sai a posição mensal (exportação, extrato ou API)? Padrão: planilha no modelo do SPEC.
- [ ] Custo anual dos clientes AI na simulação. Padrão: 0,80% ao ano, marcado "a validar".
- [ ] Quem é o responsável pelo cliente AI no sistema: o assessor, o banker ou os dois? Padrão: um responsável por família.
- [ ] O app conta como material do assessor e precisa da marca ou da aprovação da corretora? Padrão: tratar como material do assessor.
- [ ] Perfis-modelo do comitê podem aparecer no "E se?" do cliente AI? Padrão: não, só a carteira atual.
- [ ] Quem na gestão prepara e quem aprova os relatórios, e qual o papel do banker da CADM? Padrão: duas pessoas diferentes da gestão; o banker vê e comenta.
- [ ] Todas as famílias CADM recebem o relatório todo mês, ou só as que têm reunião? Padrão: todas, todo mês.
- [ ] Quais famílias entram no piloto, CADM e AI? Padrão: só a Família Andrade.
- [ ] Logotipo, cores, domínio próprio e modelo visual do relatório. Padrão: as cores do protótipo.
- [ ] Horizonte padrão: 95 ou 100 anos? Padrão: 95.

**Comitê**

- [ ] Classes de ativo oficiais e índices de referência.
- [ ] Retorno, volatilidade, correlações e graus de liberdade; premissas líquidas ou brutas de impostos.
- [ ] Perfis de alocação e pesos-alvo antes e depois da aposentadoria.
- [ ] Probabilidade-alvo e limites das faixas. (Padrão: alvo de 90%; faixas em 70%, 85% e 99%.)

**Operações**

- [ ] Formato real do arquivo de posições CADM hoje, e se cada ativo já tem uma classe atribuída.
- [ ] Onde estão hoje os dados do plano de cada família: renda, gastos, eventos e metas.

**Compliance e TI**

- [ ] Base legal na LGPD (CADM e AI) e nome do encarregado de dados.
- [ ] Aprovação dos textos de aviso e do modelo do relatório.
- [ ] O app dos clientes AI entra nas regras de material de divulgação do assessor (Resolução CVM 178)? Decidir antes da Fase 3.
- [ ] Uso de IA com dados agregados de clientes (depois do piloto): permitido, e com qual provedor?
- [ ] Uso do Claude Code no desenvolvimento aprovado pela TI (o código e os dados fictícios passam pela Anthropic; dados reais, nunca).
- [ ] Hospedagem no Supabase (região São Paulo) e do front-end (Vercel, Netlify ou Cloudflare Pages) aceita pela política de TI.
- [ ] Repositório privado: em qual conta do GitHub, e quem mais tem acesso?
