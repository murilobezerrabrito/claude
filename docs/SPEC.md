# Gêmeo Financeiro: especificação

> Transcrição em Markdown do documento "Prompt do Gêmeo Financeiro" (02/10/2026, @Murilo), sem as seções "Como usar este prompt" e "Arquivo CLAUDE.md". Os dois diagramas do original aparecem aqui como descrição em texto.

## Papel e missão

Você é um engenheiro full-stack sênior com experiência em produtos financeiros e em modelagem quantitativa de planejamento patrimonial. Sua missão é construir o **Gêmeo Financeiro da Aware**: um app web, responsivo e pensado primeiro para celular. Nele, o cliente de carteira administrada vê a chance de manter o padrão de vida até o fim do horizonte, o retorno real que a carteira precisa entregar e o efeito de decisões hipotéticas. Você trabalha neste repositório pelo Claude Code: lê e edita arquivos, roda comandos e testes e faz commits.

Como trabalhar:

1. Antes de cada fase, leia em `docs/SPEC.md` a fase em "Plano de entrega por fases" e as seções que ela cita. Apresente um plano (etapas, arquivos, comandos e como vai provar que funcionou) e só implemente depois da aprovação.
2. O motor de simulação é o coração do produto. Escreva-o como módulo TypeScript puro em `src/engine`, sem dependência de interface, com testes unitários. A interface só consome o motor.
3. Uma etapa só está pronta com evidência: checagem de tipos, lint e testes passando, com a saída dos comandos. O motor também precisa bater com `reference/resultados_referencia.json`.
4. Quando algo estiver ambíguo, escolha a opção mais conservadora, registre a decisão em `docs/DECISOES.md` e siga. Pergunte só quando a decisão afetar dados de clientes, segurança, compliance ou custos.
5. Peça confirmação antes de criar recursos em nuvem, contratar serviços pagos, rodar comandos destrutivos fora do ambiente local ou apagar arquivos.
6. Nunca invente dados de mercado nem parâmetros tributários. Use os valores desta especificação, sempre configuráveis, ou deixe o campo editável com o aviso "a validar".
7. Todo texto voltado ao cliente é em português do Brasil, em linguagem simples.
8. Faça commits pequenos, com mensagens em português, num branch por fase. Ao fim de cada etapa, atualize `docs/PROGRESSO.md` com o que foi feito e o próximo passo, para que uma conversa nova retome sem perder o fio.
9. Ao fim de cada fase, entregue: o que foi feito, como testar e o que ficou pendente.

## Contexto do negócio

A Aware Investments é um multi-family office (MFO) brasileiro. Na primeira versão, o app atende só os clientes de **carteira administrada (CADM)** do banker Alex. Para eles a Aware tem mandato formal de gestão e posições organizadas todo mês, as mesmas que alimentam o reporte das carteiras administradas à ANBIMA.

**Problema.** O cliente recebe relatórios de rentabilidade contra o CDI, mas não sabe se está no caminho dos seus objetivos de vida. Em anos ruins isso gera ansiedade, pedidos de resgate na hora errada e conversas presas à rentabilidade de curto prazo.

**Objetivo.** Trocar a pergunta "bati o CDI?" por "meu plano de vida continua de pé?". Sinais de sucesso:

- O Alex usa o app nas reuniões de revisão com cada cliente.
- Clientes abrem o app sozinhos pelo menos uma vez por mês.
- Em quedas de mercado, as conversas passam a girar em torno da probabilidade do plano, e não do resultado do mês.

**Inspirações.**

- [Map My Money](https://apps.apple.com/us/app/map-my-money/id6758605068): app de iOS que se apresenta como um "GPS financeiro". Projeta o patrimônio ao longo dos anos, acompanha metas, simula cenários "e se" e eventos de vida, e mostra o custo de oportunidade de uma compra. Queremos a mesma clareza de trajetória, só que com carteira gerida e premissas institucionais.
- [Post no r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1serdlo/i_built_a_personal_finance_dashboard_using_claude/) sobre um dashboard de finanças pessoais feito com Claude. Serve de referência de que um painel completo é viável com IA; o conteúdo do post não foi conferido nesta especificação.

**O que já existe.** Um protótipo em HTML (`reference/gemeo.html`) com um cliente fictício: Monte Carlo com 2.000 cenários, um único retorno por perfil com distribuição normal, controles de "E se?", probabilidade de sucesso, benchmark pessoal e gráfico em faixa. Use-o como referência de layout e comportamento. Esta especificação evolui o motor: classes de ativo correlacionadas, caudas grossas, gasto flexível, longevidade e impostos. Um motor de referência em Python (`reference/motor_referencia.py`) já segue esta especificação e gera os números de aceite.

**Custódia.** As carteiras ficam em custodiantes diferentes, no Brasil e no exterior. A v1 não se conecta a custodiantes: as posições entram por importação mensal (ver "Dados e integrações").

## Visão do produto

O produto tem três camadas: o **gêmeo financeiro** é o motor, o **benchmark pessoal** é a métrica e o **"E se?"** é a interface.

> Diagrama "O motor calcula, a métrica resume e o E se? pergunta" (três camadas do produto: 3 entradas, 1 motor, 3 resultados). Três entradas alimentam o motor: **Carteira CADM** (posições mensais importadas), **Plano da família** (renda, gastos e eventos) e **Premissas do comitê** (retorno, risco e correlação). O **Gêmeo financeiro** roda 5.000 trajetórias simuladas, ano a ano até o horizonte, com classes correlacionadas. Saem três resultados: **Probabilidade** (chance de o plano durar), **Benchmark pessoal** (retorno real necessário) e **Trajetória** (faixas P10, P50 e P90). O **E se?** (o cliente muda hipóteses) altera as hipóteses e o motor recalcula na hora.

- **Gêmeo financeiro (motor).** Um modelo da vida financeira da família, projetado ano a ano até o fim do horizonte. Recebe a carteira CADM, o plano da família e as premissas do comitê, e roda milhares de cenários de mercado.
- **Benchmark pessoal (métrica).** O retorno real (acima do IPCA) que a carteira precisa entregar para o plano dar certo. Substitui o CDI como régua principal. Vem acompanhado da probabilidade de sucesso e da trajetória em faixas.
- **"E se?" (interface).** O cliente, ou o Alex na reunião, muda uma hipótese (aposentar antes, vender um imóvel, doar mais, uma crise no 1º ano) e vê o efeito na hora.

Princípios que valem para todo o produto:

1. **Simulação não é recomendação.** O app mostra consequências de hipóteses. Ele nunca diz "compre", "venda" ou "mude sua alocação". Mudanças de carteira passam pelo Alex.
2. **Premissas oficiais e versionadas.** Só o comitê altera retorno, risco e correlação. O cliente nunca mexe nelas. Toda versão tem data de vigência e aprovador.
3. **Reprodutível.** Qualquer número mostrado a um cliente pode ser recalculado igual: mesmas entradas, mesma versão de premissas, mesma semente aleatória.
4. **Incerteza à vista.** Mostrar faixas e probabilidades, nunca um único número como certeza.
5. **Conservador na dúvida.** Entre duas premissas razoáveis, use a pior para o cliente.
6. **Simples na superfície.** A tela principal mostra três coisas: probabilidade, benchmark pessoal e trajetória. A mecânica fica em "Como calculamos".
7. **Privado por padrão.** Cada família vê só os próprios dados, e o app guarda o mínimo necessário.
8. **Celular primeiro.** A maioria dos clientes vai abrir no telefone.

## Usuários e permissões

Cinco papéis, com acesso restrito por família no banco de dados (row level security), não só na interface.

| Papel | Quem é | Vê | Pode fazer | Não pode |
|---|---|---|---|---|
| Cliente titular | Responsável pela família na CADM | Tudo da própria família | Usar o "E se?", salvar cenários pessoais, sugerir mudanças no plano (o Alex confirma), convidar familiares | Alterar premissas, posições ou o plano oficial |
| Familiar convidado | Cônjuge ou herdeiro, convidado pelo titular | O que o titular liberar (com ou sem valores em reais) | Usar o "E se?" sem salvar | Convidar outras pessoas, ver dados de outra família |
| Banker | Alex (depois, outros bankers) | Só as famílias sob sua responsabilidade | Editar plano, fluxos, eventos e metas; importar posições; salvar cenários de reunião; ver o histórico | Alterar premissas do comitê |
| Comitê (admin) | Gestão da Aware | Todas as famílias | Criar e aprovar versões de premissas, mapear ativos para classes, gerenciar usuários | Apagar a trilha de auditoria |
| Compliance | Área de compliance | Tudo, só leitura, mais a trilha de auditoria | Aprovar os textos de aviso e as versões de premissas | Editar dados de clientes |

Regras de acesso:

- Toda tabela com dado de cliente tem `household_id` e política de acesso no banco. Um teste automatizado tenta ler a família B logado como cliente da família A e precisa falhar.
- Todo acesso de banker, comitê ou compliance a dados de uma família é registrado (quem, quando, o quê).
- O cliente vê a data da última atualização das posições em todas as telas.

## Telas e funcionalidades

Nove telas: as sete primeiras são do cliente (o Histórico também serve ao banker), as duas últimas são internas.

### 1. Entrar

- E-mail e senha mais segundo fator (app autenticador). Sem cadastro aberto: o acesso nasce de um convite do banker.
- A sessão expira após 30 minutos sem uso.

### 2. Visão geral (tela inicial)

Responde em cinco segundos à pergunta "meu plano continua de pé?".

- **Probabilidade de sucesso** em destaque (ex.: 87%), com selo de faixa e a variação desde o mês anterior ("+2 p.p. desde agosto").
- **Benchmark pessoal**: "Sua carteira precisa render IPCA + 3,8% ao ano". Ao lado, o retorno esperado do perfil atual e a folga em pontos percentuais.
- **Trajetória** do patrimônio financeiro por idade: faixa P10 a P90, linha P50, linha P10 destacada e marcos (aposentadoria, eventos).
- **Uma frase de leitura** gerada a partir dos números: "No cenário mediano, vocês chegam aos 95 anos com R$ 9,8 mi em valores de hoje. No cenário ruim, o patrimônio dura até os 88."
- Rodapé: data das posições, versão das premissas e aviso legal curto, com link para o completo.

### 3. E se?

- Controles: idade de aposentadoria, gasto essencial, gasto de estilo de vida, renda, aporte ou resgate pontual, venda de imóvel (valor e ano), doação anual, perfil de alocação (só perfis aprovados), choque de mercado no 1º ano e horizonte.
- Cenários prontos em botões: aposentar 3 anos antes, vender um imóvel, doar R$ 200 mil por ano, crise como a de 2008 no 1º ano, inflação alta por 5 anos, gastar 10% a mais.
- Recalcula ao soltar o controle (espera de 250 ms), com indicador de cálculo. Mostra sempre a diferença para o plano oficial ("87% → 71%").
- Compara até três cenários lado a lado: probabilidade, benchmark pessoal, patrimônio mediano aos 80 anos e no fim, e idade em que o dinheiro acaba no cenário ruim.
- **Gasto sustentável**, calculado sob demanda: "Com 85% de chance, vocês podem gastar até R$ X por mês."
- Salvar cenário com nome. O do cliente é pessoal; o do banker pode ser marcado "para a reunião".
- Botão "Voltar ao plano oficial".

### 4. Patrimônio

- Patrimônio total: carteira CADM por classe de ativo (barras horizontais com % e R$) e outros bens declarados (imóveis, empresa, previdência, conta no exterior fora da CADM).
- Alocação atual contra a alocação-alvo do perfil.
- Rentabilidade da CADM no ano e em 12 meses, nominal e real, contra o benchmark pessoal. O CDI aparece como referência secundária.
- Data de referência das posições e custodiantes.

### 5. Plano

- Linha do tempo da família: idades, aposentadoria, eventos e metas.
- Fluxos: renda por fonte e prazo, gastos essenciais e de estilo de vida, eventos com valor, ano e recorrência.
- Metas: manter o padrão de vida até certa idade, legado mínimo, doações.
- O cliente sugere mudanças; elas entram numa fila para o banker confirmar.

### 6. Como calculamos

- Explica em linguagem simples o que é a simulação, o que significa "87%", o que é o benchmark pessoal, quais premissas estão em vigor (tabela de retorno e risco por classe) e quais são as limitações.
- Aviso legal completo.

### 7. Histórico

- Série mensal da probabilidade de sucesso e do benchmark pessoal, mais a rentabilidade real realizada da CADM.
- Marcadores de eventos: mudança no plano, nova versão de premissas, choque de mercado.

### 8. Área do banker

- Lista de famílias com probabilidade atual, variação no mês, folga, selo de faixa e data das posições. Ordenável.
- Filtro "precisam de atenção": probabilidade abaixo de 70%, queda de mais de 5 p.p. no mês, ou de 99% ou mais (talvez conservador demais).
- Editor do plano de cada família.
- Importação mensal de posições (CSV ou XLSX) com prévia, validação e conciliação contra o patrimônio do relatório oficial (tolerância de 0,01%).
- Modo reunião: o "E se?" em tela cheia, sem menus.

### 9. Área do comitê

- **Premissas**: editor de versões com retorno real esperado, volatilidade e graus de liberdade por classe, mais a matriz de correlação. Validação automática (simétrica, diagonal 1, positiva definida). Fluxo rascunho → aprovada → vigente, com data de vigência e aprovador. Ao publicar, recalcular todas as famílias e guardar o antes e depois.
- **Perfis de alocação**: pesos-alvo por classe para cada perfil.
- **Mapeamento de ativos**: cada ativo importado (por código, ISIN ou CNPJ) recebe uma classe. Ativo sem classe bloqueia o cálculo da família e entra numa fila.
- Usuários, convites e trilha de auditoria (leitura para compliance).

## Motor de simulação

O motor é uma simulação de Monte Carlo anual, em valores reais, com retornos correlacionados por classe de ativo, caudas grossas e regras de gasto flexível. Ele é uma função pura: mesmas entradas e mesma semente geram exatamente o mesmo resultado.

### Convenções

- **Unidade:** tudo em reais de hoje (descontado o IPCA). Retornos são reais, acima do IPCA. A interface sempre diz "em valores de hoje".
- **Passo:** anual. O ano 0 é a data de referência das posições.
- **Horizonte:** até o membro mais jovem do casal completar a idade-limite (padrão 95 anos). Longevidade estocástica fica para a v2.
- **Patrimônio simulado:** só o financeiro (carteira CADM mais investimentos líquidos declarados). Imóveis e participações em empresas entram apenas como fluxos: aluguel, dividendos, venda.
- **Ordem no ano (conservadora):** déficits saem no início do ano; superávits entram no fim.
- **Trajetórias:** 5.000 por cálculo (configurável, mínimo 1.000).
- **Números aleatórios comuns:** cenários comparados usam a mesma semente, para que a diferença reflita a hipótese e não o ruído do sorteio.

### Entradas

| Entrada | Origem | Exemplo |
|---|---|---|
| Patrimônio financeiro por classe | Importação CADM mais declarados | R$ 12 mi |
| Pessoas: nascimento e sexo | Banker | Casal de 52 e 50 anos |
| Renda por fonte: valor real anual, início, fim | Banker | Pró-labore até os 62 |
| Gasto essencial e de estilo de vida, por fase | Banker | R$ 55 mil e R$ 30 mil por mês |
| Eventos: valor, ano, recorrência, entrada ou saída | Banker ou cliente | Faculdade de 2027 a 2031 |
| Metas: idade-limite, legado mínimo, doação anual | Banker | Até 95 anos, legado de R$ 3 mi |
| Perfil de alocação: pesos-alvo por classe | Comitê | Moderado |
| Taxa de gestão (% ao ano) | Contrato do cliente | 0,80% |
| Premissas (versão vigente) | Comitê | Versão 2026-10 |
| Regras de gasto flexível | Banker | Ligadas |
| Choques do cenário | Tela "E se?" | Crise no 1º ano |

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

Rebalanceamento anual para os pesos-alvo, com taxa de gestão f descontada sobre o patrimônio:

```latex
R_t = (1 - f)\Big(1 + \sum_k w_{k} \, r_k\Big) - 1
```

Opcional na v1: pesos diferentes antes e depois da aposentadoria (dois conjuntos de pesos por perfil).

### Fluxos de caixa

O fluxo líquido do ano é F = renda + aluguéis + dividendos + entradas de eventos − gasto essencial − gasto de estilo de vida − saídas de eventos − doações. O patrimônio evolui assim:

```latex
W_{t+1} = \begin{cases} W_t\,(1 + R_t) + F_t & \text{se } F_t \ge 0 \\ (W_t + F_t)\,(1 + R_t) & \text{se } F_t < 0 \end{cases}
```

- Se o patrimônio não cobre o déficit do ano (W + F < 0), a trajetória **falha** naquela idade. Daí em diante o patrimônio fica em zero.
- Eventos têm valor real, ano de início, ano de fim e recorrência: única, anual ou a cada N anos.
- Venda de imóvel: entrada única no ano escolhido, pelo valor líquido de custos e impostos informado pelo banker. O aluguel daquele imóvel para a partir do ano da venda.
- Previdência (PGBL/VGBL), na v1, entra no patrimônio financeiro com a classe do fundo. Na v2 ganha tratamento próprio de imposto e sucessão.

### Gasto flexível

O gasto essencial nunca é cortado. As regras ajustam só o gasto de estilo de vida, a partir da aposentadoria. A régua padrão é uma **trajetória de referência**: o patrimônio projetado sem sorteio, com o retorno composto esperado do perfil e o plano completo. Se, num ano, o patrimônio de uma trajetória simulada fica abaixo de 80% da referência, o estilo de vida é cortado; acima de 120%, é aumentado.

| Regra | Gatilho | Ação | Padrão |
|---|---|---|---|
| Corte | Patrimônio abaixo de 80% da trajetória de referência | Corta 10% do estilo de vida | Ligada; desligada nos últimos 15 anos do horizonte |
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
- **v2:** em cada trajetória, sorteie a idade de morte de cada pessoa a partir de uma tábua de mortalidade por idade e sexo. O plano termina quando morre o último. Após a primeira morte, o gasto cai para um percentual do gasto do casal (padrão 70%, configurável). Para clientes de alta renda, a tábua BR-EMS da SUSEP é mais adequada do que a da população geral do IBGE.

### Impostos

- **v1:** premissas líquidas de impostos, informadas pelo comitê.
- **v2:** módulo de impostos com parâmetros editáveis por vigência. Regras a modelar, todas a validar com o tributário antes de entrar em produção:

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
| Probabilidade de sucesso | % das trajetórias que nunca falham até o fim do horizonte | Visão geral, E se?, banker |
| Probabilidade do legado | % das trajetórias que terminam com patrimônio ≥ legado mínimo | Visão geral, se houver meta de legado |
| Benchmark pessoal | Menor retorno real constante que sustenta o plano (seção seguinte) | Visão geral |
| Folga | Retorno composto líquido do perfil − benchmark pessoal, em p.p. | Visão geral |
| Trajetória | Percentis P10, P25, P50, P75 e P90 do patrimônio por idade | Gráfico principal |
| Idade de esgotamento | Idade em que o P10 chega a zero (ou "não esgota") | Frase de leitura |
| Gasto sustentável | Maior gasto total com probabilidade ≥ alvo (padrão 90%) | E se? |
| Chance de corte | % das trajetórias com algum corte no estilo de vida | E se?, com regras ligadas |
| Maior corte mediano | Mediana do maior corte, em % do estilo de vida inicial | E se?, com regras ligadas |

Gasto sustentável: bisseção sobre um multiplicador k do gasto total (essencial + estilo de vida), entre 0,3 e 3, com a mesma semente em todas as rodadas. Use 2.000 trajetórias na busca e confirme o resultado final com 5.000.

### Desempenho e reprodutibilidade

- O motor roda num Web Worker para não travar a tela. Meta: 5.000 trajetórias × 45 anos × 8 classes em menos de 1 segundo num celular intermediário.
- Gerador de números aleatórios com semente: xoshiro128** (ou equivalente documentado). Normais por Box-Muller.
- Use Float64Array e evite criar objetos dentro do laço.
- Cada cálculo mostrado a um cliente grava: hash das entradas, versão das premissas, semente, versão do motor e resumo dos resultados. Com isso, qualquer número pode ser refeito.

### Pseudocódigo

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
              - essential(inp, t) - lifestyle - outflows(inp, t) - donations(inp, t);
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
- **Folga** = retorno composto esperado do perfil, líquido da taxa de gestão, menos r*. O retorno composto vem da própria simulação: exp(média de ln(1 + R)) − 1, sobre todos os anos e trajetórias. Nunca compare r* com a média aritmética, que superestima o crescimento.

### Faixas da probabilidade

Alvo padrão de 90%. As faixas seguem a lógica dos guardrails por risco (limite inferior de 70% e superior de 99% nos exemplos da Kitces), com uma faixa intermediária de atenção.

| Faixa | Probabilidade | Cor do selo | O que o banker vê |
|---|---|---|---|
| Folga grande | 99% ou mais | Azul | Sugestão de conversa: dá para gastar, doar ou antecipar planos |
| No caminho | De 85% a 99% | Verde | Nada a fazer |
| Atenção | De 70% a 85% | Amarelo | Revisar na próxima reunião |
| Plano em risco | Abaixo de 70% | Vermelho | Contato proativo, com o gasto sustentável já calculado |

Os limites das faixas e o alvo são parâmetros do comitê.

### Termômetro mensal

- Após cada importação de posições, recalcule probabilidade, r* e folga com o patrimônio novo e o plano vigente. Grave um registro mensal: data, probabilidade, r*, folga, patrimônio, versão das premissas e versão do plano.
- Rentabilidade realizada da CADM: retorno mensal por Dietz modificado com os fluxos do mês, encadeado no tempo e deflacionado pelo IPCA. O gráfico do Histórico compara essa linha com o benchmark pessoal acumulado no mesmo período.
- Texto automático do mês, por exemplo: "A probabilidade passou de 87% para 84% em setembro. O plano continua na faixa verde."
- **v2, atribuição da variação:** recalcular trocando um fator por vez para separar quanto da mudança veio do mercado (posições novas), do plano (gastos e eventos) e das premissas (nova versão do comitê).

## "E se?" e linguagem natural

O "E se?" altera hipóteses numa cópia do plano oficial. Nada volta para o plano oficial sem confirmação do banker.

### Controles

| Controle | Campo do motor | Faixa | Passo |
|---|---|---|---|
| Idade de aposentadoria | `retirementAge` | Idade atual a 75 | 1 ano |
| Gasto essencial | `essentialMonthly` | 20% a 200% do atual | R$ 1 mil por mês |
| Gasto de estilo de vida | `lifestyleMonthly` | 0 a 300% do atual | R$ 1 mil por mês |
| Renda até aposentar | `incomes[].amount` | 0 a 200% da atual | R$ 5 mil por mês |
| Aporte ou resgate pontual | `events[]` | −50% a +100% do patrimônio | R$ 50 mil |
| Venda de imóvel | `propertySales[]` | Imóveis declarados, ano | 1 ano |
| Doação anual | `annualDonation` | 0 a R$ 2 mi por ano | R$ 25 mil |
| Perfil de alocação | `profileId` | Perfis aprovados | — |
| Choque no 1º ano | `firstYearShock` | 0% a −30% | 5 p.p. |
| Horizonte | `horizonAge` | 85 a 105 anos | 1 ano |
| Gasto flexível | `rules.enabled` | Ligado ou desligado | — |

Além dos controles, três perguntas que o motor resolve por bisseção, sempre com a probabilidade-alvo (padrão 90%):

- **Quanto posso gastar?** Maior gasto mensal total.
- **Quanto posso doar?** Maior doação anual.
- **Quando posso parar?** Menor idade de aposentadoria.

### Comparação

- Até três cenários lado a lado, todos com a mesma semente.
- Tabela de diferenças contra o plano oficial e gráfico com a mediana de cada cenário sobreposta à faixa do plano oficial.

### Linguagem natural (Fase 3)

Uma caixa "Pergunte ao seu plano" recebe perguntas como "e se eu me aposentar aos 58 e vender a casa de praia em 2030?". A IA só traduz a pergunta em parâmetros; quem calcula é sempre o motor.

1. Uma função no servidor chama a API do Claude com uso de ferramentas (tool use). A única ferramenta, `propor_cenario`, tem um JSON Schema com exatamente os campos do "E se?" e seus limites.
2. O app mostra os parâmetros propostos em português simples ("Aposentadoria: 62 → 58 anos; venda da casa de praia em 2030") e o cliente confirma.
3. O motor calcula no navegador, como em qualquer cenário.
4. A resposta em texto pode ser redigida pela IA, mas só a partir dos números do motor, passados como dados. Instruções fixas: não recomendar produtos nem alocação, não prometer rentabilidade, dizer que é uma simulação, no máximo três frases.
5. Pergunta fora do escopo ("devo comprar dólar?") recebe resposta padrão: "Não posso recomendar investimentos. Posso simular o efeito de uma hipótese no seu plano; para decisões, fale com o Alex."
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
      "annualDonation": { "type": "number", "minimum": 0 },
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
      "solve": { "type": "string", "enum": ["none", "maxSpending", "maxDonation", "earliestRetirement"] },
      "clarifyingQuestion": { "type": "string", "description": "Use quando a pergunta for ambígua." }
    }
  }
}
```

Exemplos de tradução esperada:

| Pergunta do cliente | Parâmetros propostos |
|---|---|
| E se eu parar de trabalhar 3 anos antes? | `{"retirementAge": 59}` |
| Quanto posso doar por ano sem comprometer nada? | `{"solve": "maxDonation"}` |
| E se a bolsa cair 30% e eu vender a casa de praia em 2028? | `{"firstYearShock": -0.30, "propertySales": [{"propertyId": "casa-praia", "year": 2028}]}` |
| E se a gente gastar mais? | `{"clarifyingQuestion": "Quanto a mais por mês, e em quais anos?"}` |

## Dados e integrações

Posições vêm do controle interno da Aware por importação mensal; dados de mercado vêm de fontes públicas por rotinas agendadas. A v1 não se conecta a custodiantes.

### Modelo de dados

Postgres. Toda tabela com dado de família tem `household_id` e política de acesso por linha. Valores monetários em `numeric(18,2)`, taxas em `numeric(10,6)`.

| Tabela | Colunas principais | Observação |
|---|---|---|
| `households` | id, name, banker_id, profile_id, fee_rate, horizon_age, legacy_min, status | Uma família por contrato CADM |
| `people` | id, household_id, name, birth_date, sex, role | role: titular, cônjuge, filho |
| `user_roles` | user_id, household_id, role, can_see_amounts | household_id vazio para papéis internos |
| `assets` | id, asset_code, isin, cnpj, name, class_code, currency | Mapeamento ativo → classe |
| `import_batches` | id, ref_date, file_name, uploaded_by, row_count, total_value, official_total, status | Uma importação por mês |
| `positions` | id, household_id, batch_id, ref_date, custodian, asset_id, quantity, unit_price, gross_value, net_value, currency | Uma linha por ativo por mês |
| `other_assets` | id, household_id, kind, name, value, annual_income, can_be_sold | kind: imóvel, empresa, previdência, exterior |
| `cash_flows` | id, household_id, kind, annual_amount_real, start_year, end_year, other_asset_id | kind: renda, gasto essencial, gasto de estilo de vida, aluguel, dividendos |
| `events` | id, household_id, name, direction, amount_real, year, recurrence, every_n, end_year | Entradas e saídas pontuais ou recorrentes |
| `goals` | id, household_id, kind, target_age, amount | kind: padrão de vida, legado, doação |
| `plan_versions` | id, household_id, created_by, snapshot (jsonb), created_at | Cada mudança no plano gera uma versão |
| `plan_change_requests` | id, household_id, requested_by, payload (jsonb), status, reviewed_by | Sugestões do cliente |
| `cma_versions` | id, label, effective_date, status, nu, approved_by, approved_at | status: rascunho, aprovada, vigente, arquivada |
| `cma_classes` | cma_version_id, class_code, name, benchmark, mu_real, vol | |
| `cma_correlations` | cma_version_id, class_a, class_b, rho | Só o triângulo superior |
| `profiles` | id, name, weights_pre (jsonb), weights_post (jsonb) | Pesos por classe |
| `scenarios` | id, household_id, owner_id, name, params (jsonb), for_meeting | |
| `simulation_runs` | id, household_id, scenario_id, inputs_hash, inputs (jsonb), cma_version_id, seed, engine_version, paths, summary (jsonb), created_by, created_at | Garante a reprodutibilidade |
| `monthly_snapshots` | household_id, ref_date, probability, required_return, slack, wealth, cma_version_id, plan_version_id | Termômetro mensal |
| `market_series` | series_code, date, value, source | CDI, IPCA, dólar |
| `audit_log` | id, actor_id, action, target_table, target_id, household_id, details (jsonb), at | Só inserção, sem update nem delete |

### Importação mensal das posições

Arquivo CSV ou XLSX, com todas as famílias ou uma por vez. Modelo de colunas (linhas fictícias):

```csv
data_referencia,codigo_cliente,custodiante,codigo_ativo,isin,cnpj,nome_ativo,quantidade,preco_unitario,valor_bruto,valor_liquido,moeda
2026-09-30,AND001,Custodiante A,NTNB-2035,,,Tesouro IPCA+ 2035,120,4380.55,525666.00,512020.00,BRL
2026-09-30,AND001,Custodiante A,CDB-BANCOX-2028,,,CDB Banco X 2028,1,850000.00,850000.00,838500.00,BRL
2026-09-30,AND001,Custodiante B,FUNDO-MM-Y,,00.000.000/0001-00,Fundo Multimercado Y,152340.12,6.5642,999990.00,991250.00,BRL
2026-09-30,AND001,Custodiante C,ETF-GLOBAL-Z,,,ETF Global Z,1800,105.20,189360.00,189360.00,USD
```

Regras:

- Colunas obrigatórias, datas no formato AAAA-MM-DD e números com ponto decimal (aceitar vírgula e converter).
- **Conciliação:** a soma de `valor_liquido` por família precisa bater com o patrimônio do relatório oficial, informado no upload, com tolerância de 0,01%. Diferença maior bloqueia a publicação.
- Ativo sem classe vai para a fila de mapeamento do comitê, e a família fica "pendente" até ser resolvido.
- Prévia antes de confirmar; importação tudo ou nada. Reimportar o mesmo mês substitui a anterior e fica registrado na auditoria.
- Moeda estrangeira: converter pelo dólar de venda do Banco Central (série 1) na data de referência.
- Patrimônio por classe = soma de `valor_liquido` por `class_code`.

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

- **v1:** só CDI, IPCA e dólar, para a rentabilidade real e a conversão de moeda.
- **v2:** cotas da CVM e preços para estimar o patrimônio entre importações, sempre com o aviso "estimado; o oficial é o relatório mensal".

Rotinas: uma função agendada no servidor busca as séries todo dia útil à noite, grava em `market_series` com inserção idempotente (upsert) e avisa o comitê se uma série ficar mais de 3 dias úteis sem dado novo.

## Segurança, LGPD e compliance

São dados patrimoniais de famílias de alta renda: segurança e LGPD entram na Fase 2, antes do primeiro dado real, e não no fim.

### Segurança

- Segundo fator obrigatório (app autenticador) para todos os usuários. Bloqueio após 5 tentativas erradas; sessão de 30 minutos.
- Banco e funções do servidor hospedados de preferência na região de São Paulo.
- Criptografia em trânsito e em repouso. Chaves de API (ANBIMA, brapi, Claude) e a chave secreta do Supabase só no servidor, nunca no navegador nem no repositório. No navegador, só a chave publicável do Supabase.
- Política de acesso por linha em todas as tabelas, mais o teste automatizado de vazamento entre famílias.
- Trilha de auditoria só de inserção para todo acesso e alteração feitos por usuários internos.
- Backups diários com retenção de 30 dias e teste de restauração a cada trimestre.
- Uploads: aceitar só CSV e XLSX até 10 MB, sem executar macros.
- Teste de invasão (pentest) independente antes de abrir para o primeiro cliente.

### LGPD (Lei 13.709/2018)

- Base legal a confirmar com o encarregado de dados: execução do contrato de CADM. Consentimento específico para convidar familiares e, na Fase 3, para usar a IA.
- Minimização: identificar o cliente por código interno. Não guardar CPF nem dados bancários no app. Dados reais nunca entram no repositório nem nas conversas com o Claude Code; para testes, use dados anonimizados.
- Direitos do titular: exportar e excluir os dados a pedido, com o pedido registrado.
- Prazos de retenção definidos com compliance, inclusive para os registros de simulação.
- Contratos de tratamento de dados com cada fornecedor (banco de dados, hospedagem e, na Fase 3, o provedor de IA).
- Política de privacidade e termos de uso aceitos no primeiro acesso, com o aceite registrado.

### Compliance

- O app é ferramenta de planejamento e simulação. Nenhuma tela sugere produto, ativo ou mudança de alocação.
- **Perfil de investidor:** o cliente só simula perfis de alocação compatíveis com seu perfil de suitability. O banker pode simular qualquer perfil, com aviso na tela.
- Premissas aprovadas, versionadas e com trilha de quem aprovou.
- Textos legais guardados em tabela com versão. Mudança de texto exige nova aprovação de compliance.
- Referências: Resolução CVM 21 (administração de carteiras), Resolução CVM 30 (dever de verificar a adequação ao perfil do cliente) e Código ANBIMA de Administração de Recursos de Terceiros.

### Textos de aviso (rascunhos para compliance aprovar)

- **Rodapé de todas as telas:** "Simulação ilustrativa com base em premissas da Aware Investments. Não é promessa de rentabilidade nem recomendação de investimento."
- **Aviso completo, em Como calculamos:** "As projeções deste aplicativo são simulações estatísticas. Elas usam premissas de retorno, risco e correlação definidas pelo comitê de investimentos da Aware Investments e as informações do seu plano. Não garantem resultados futuros, não constituem recomendação de investimento e não substituem a análise do seu banker. Rentabilidade obtida no passado não representa garantia de rentabilidade futura. Os valores estão em reais de hoje, corrigidos pela inflação. Quando as premissas ou o seu plano mudam, os resultados mudam junto."
- **Respostas da IA (Fase 3):** "Resposta gerada por inteligência artificial a partir de uma simulação. Confira os parâmetros e fale com o Alex antes de qualquer decisão."
- **Perfil acima do suitability (visão do banker):** "Este perfil está acima do perfil de investidor do cliente. Use apenas como ilustração."

## Stack técnica e arquitetura

React em TypeScript com o motor rodando num Web Worker no navegador; Supabase para banco, autenticação, arquivos e funções do servidor a partir da Fase 2. Tudo em TypeScript, para que o motor seja testado sem servidor e reaproveitado nas funções do servidor.

> Diagrama "O motor roda no navegador; o servidor guarda dados e busca o mercado" (arquitetura: navegador, servidor e fontes externas; a mesma biblioteca do motor também roda no recálculo mensal do servidor). **Navegador:** Interface React (telas e gráficos, celular primeiro) envia hipóteses ao Motor (Web Worker: simulações e bisseções, mesmo código do servidor). **Supabase (servidor):** Auth com MFA (convites e papéis), Postgres com RLS (dados e auditoria), Storage (planilhas importadas) e Funções do servidor (importação de posições, dados de mercado, recálculo mensal, Pergunte ao plano). **Fontes externas:** Banco Central SGS (CDI, IPCA e dólar), CVM, Tesouro, ANBIMA (cotas e preços, v2), brapi (ações, FIIs e ETFs, v2) e API do Claude (perguntas, Fase 3).

O navegador conversa com o Postgres sempre sob as políticas de acesso por linha. As funções do servidor importam as planilhas, buscam dados de mercado, fazem o recálculo mensal (com a mesma biblioteca do motor) e, na Fase 3, chamam a API do Claude.

| Camada | Escolha |
|---|---|
| Interface | React, TypeScript, Vite, Tailwind CSS e shadcn/ui |
| Gráficos | Recharts; D3 só se a faixa P10 a P90 exigir |
| Formulários | React Hook Form com Zod (os mesmos schemas validam as entradas do motor) |
| Motor | TypeScript puro em `src/engine`, sem dependências, rodando num Web Worker |
| Testes | Vitest para o motor e a interface; Playwright para os fluxos principais; pgTAP para o banco |
| Banco e login | Supabase: Postgres, Auth com MFA, políticas de acesso por linha, Storage (Fase 2) |
| Servidor | Supabase Edge Functions (Deno), com agendamento para as rotinas |
| Desenvolvimento local | Supabase CLI como dependência do projeto (`npx supabase`) e Docker |
| Planilhas | Papa Parse para CSV e SheetJS para XLSX |
| Números e datas | `Intl.NumberFormat('pt-BR')` e date-fns |
| Integração contínua | GitHub Actions: checagem de tipos, lint e testes a cada push |
| Hospedagem do front-end | A definir com TI (Vercel, Netlify ou Cloudflare Pages); na Fase 1, a revisão é local |

Estrutura do repositório (o kit já traz `CLAUDE.md`, `.claude/`, `docs/` e `reference/`):

```text
CLAUDE.md                     # regras para o Claude Code
README.md
.claude/
  skills/fase/SKILL.md        # comando /fase N
  agents/revisor-motor.md     # subagente que revisa o motor
docs/
  SPEC.md  PROGRESSO.md  DECISOES.md
reference/                    # não editar
  gemeo.html  motor_referencia.py  andrade.json  resultados_referencia.json
src/
  engine/                     # simulate, requiredReturn, solvers, cholesky, rng, guardrails
    __tests__/
  workers/engine.worker.ts
  data/                       # andrade.json e premissas de exemplo
  features/
    overview/  whatif/  wealth/  plan/  history/  banker/  committee/
  lib/
    supabase.ts  format.ts
scripts/
  reference.ts  sync-engine.ts
supabase/                     # a partir da Fase 2
  migrations/  seed.sql  tests/
  functions/
    _shared/engine/  import-positions/  market-sync/  monthly-recalc/  ask-plan/
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

- Cores e logotipo da Aware: a receber. Até lá, use um verde-escuro institucional como cor principal e cinzas levemente esverdeados, como no protótipo.
- Tipografia: uma serifada para títulos e números de destaque (ex.: Fraunces) e uma sem serifa para o texto (ex.: IBM Plex Sans). Algarismos tabulares em tabelas.
- Temas claro e escuro.
- Cores de estado só nas faixas (azul, verde, amarelo, vermelho), sempre acompanhadas de texto.

### Gráfico de trajetória

- Eixo horizontal em idade, não em ano. Linhas verticais tracejadas marcam a aposentadoria e os eventos.
- Faixa P10 a P90 em tom claro, faixa P25 a P75 mais escura, mediana em linha grossa, P10 em linha fina vermelha.
- Eixo vertical em "R$ mi de hoje", começando em zero.
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

- Sem posições do mês: "Ainda não temos as posições de setembro. Assim que o Alex importar, seus números são atualizados."
- Erro na importação: "A soma da planilha (R$ 12.380.000) não bate com o relatório oficial (R$ 12.400.000). Confira as linhas do Custodiante B antes de publicar."
- Frase de leitura em faixa amarela: "Em 78 de cada 100 cenários o dinheiro dura até os 95. No cenário ruim, ele acaba aos 89. Vale revisar o plano com o Alex."

## Dados de exemplo: Família Andrade

Família fictícia para desenvolvimento, testes e demonstração. O mesmo JSON está em `reference/andrade.json`; na Fase 0, ele é copiado para `src/data/andrade.json`, a fonte única dos testes, das telas da Fase 1 e da semente do banco na Fase 2. Convenções: o ano civil do passo t é o ano da data de referência + t; anos de início e fim são inclusivos; valores em reais de hoje.

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

### Resultados de referência

Calculados com `reference/motor_referencia.py`, que segue esta especificação, com as premissas ilustrativas e 50.000 trajetórias, para reduzir o ruído do sorteio. Os valores e as tolerâncias também estão em `reference/resultados_referencia.json`, lido pelo teste 13 e por `npm run reference`. O gerador aleatório do TypeScript é diferente do NumPy, então as métricas sorteadas não batem exatamente: precisam cair dentro das tolerâncias. As métricas sem sorteio (benchmark pessoal) precisam bater na precisão indicada.

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

### Critérios de aceite do produto

- [ ] Um cliente da família A não consegue ler nenhum dado da família B (teste pgTAP, rodado com `supabase test db`).
- [ ] Importação com diferença acima de 0,01% em relação ao relatório oficial é bloqueada.
- [ ] Ativo sem classe bloqueia o cálculo da família e aparece na fila do comitê.
- [ ] Toda simulação exibida gera um registro em `simulation_runs` e pode ser refeita com o mesmo resultado.
- [ ] Uma versão de premissas só vale depois de aprovada, e o recálculo de todas as famílias fica registrado.
- [ ] O "E se?" responde em menos de 1 segundo após soltar o controle, num celular intermediário.
- [ ] A tela inicial funciona em 375 px de largura sem rolagem horizontal.
- [ ] Nenhum texto voltado ao cliente recomenda produto, ativo ou alocação.
- [ ] O aviso legal aparece em todas as telas com números.
- [ ] Temas claro e escuro legíveis, com contraste AA.
- [ ] O cliente não consegue simular um perfil acima do seu suitability.
- [ ] Checagem de tipos, lint, testes do motor e testes do banco passam na integração contínua a cada push.

## Plano de entrega por fases

Quatro fases, cada uma com um portão de saída. Uma fase só começa quando o portão da anterior está cumprido. A ordem segue o fluxo do Claude Code: o motor é validado antes de existir servidor, e a segurança entra antes do primeiro dado real.

1. **Fase 0: fundação e motor, sem servidor.** Projeto Vite com React e TypeScript, Vitest, ESLint, integração contínua no GitHub Actions, scripts do projeto, Família Andrade em `src/data/andrade.json` e o motor completo em `src/engine` (retornos, fluxos, gasto flexível, benchmark pessoal e bisseções).
   - Portão: testes 1 a 14 passando, `npm run reference` dentro das tolerâncias e revisão do `revisor-motor` sem divergências abertas.
2. **Fase 1: telas com dados de exemplo, sem login.** Visão geral, "E se?" e Como calculamos, com o motor num Web Worker e as premissas num arquivo versionado em `src/data/`. Sem servidor e sem dados reais.
   - Portão: revisão do Alex com a família de exemplo; tela inicial funcionando em 375 px e no tema escuro.
3. **Fase 2: servidor e dados reais, uso interno.** Em quatro etapas: (1) Supabase local com migrações, políticas de acesso por linha, login com segundo fator e testes pgTAP; (2) importação mensal com conciliação e mapeamento de ativos; (3) áreas do banker e do comitê, editor do plano e telas Patrimônio, Plano e Histórico; (4) termômetro mensal, rotinas de mercado e trilha de auditoria. O projeto na nuvem (região São Paulo) só nasce com sua autorização.
   - Portão: teste de vazamento entre famílias passando; uma família real, anonimizada, importada e conciliada; textos aprovados por compliance; teste de invasão feito.
4. **Fase 3: abertura para clientes.** Convites, termos de uso, e-mail mensal com o termômetro, modo reunião, "Pergunte ao plano" com IA, longevidade estocástica, módulo de impostos e atribuição da variação mensal.
   - Portão: piloto com 3 a 5 famílias do Alex antes de ampliar.

### Mensagens prontas

O comando `/fase N` do kit já segue este roteiro: lê a fase, apresenta um plano e espera sua aprovação. As mensagens abaixo servem para usar sem o comando, sempre numa conversa nova e com o modo de planejamento ligado.

- **Fase 0:** "Leia CLAUDE.md e docs/SPEC.md. Vamos fazer a Fase 0. A pasta já tem CLAUDE.md, .claude/, docs/ e reference/: não apague nem sobrescreva esses arquivos ao criar o projeto. Crie na raiz o projeto Vite com React e TypeScript, com Vitest, ESLint, os scripts da seção Scripts do projeto e o workflow de integração contínua. Copie reference/andrade.json para src/data/. Implemente o motor em src/engine exatamente como na seção Motor de simulação, com os testes 1 a 14, e crie o npm run reference. Me mostre o plano antes de editar."
- **Revisão do motor (fim da Fase 0 e sempre que o motor mudar):** "Use o subagente revisor-motor para revisar src/engine. Me mostre as divergências antes de corrigir qualquer coisa."
- **Fase 1:** "Fase 1. Crie as telas Visão geral, E se? e Como calculamos, sem servidor e sem login, com o motor num Web Worker, os dados de src/data/andrade.json e as premissas num arquivo versionado em src/data/. Siga a seção Design e linguagem e use reference/gemeo.html como referência de layout. No fim, rode o servidor de desenvolvimento para eu conferir; a tela inicial precisa funcionar em 375 px de largura e no tema escuro."
- **Fase 2, etapa 1 (servidor local):** "Fase 2, etapa 1. Configure o Supabase local com a CLI (vou deixar o Docker aberto). Crie as migrações das tabelas da seção Dados e integrações, as políticas de acesso por linha, o login com segundo fator e o seed com a Família Andrade. Escreva os testes pgTAP, incluindo o de vazamento entre famílias. Nada na nuvem por enquanto."
- **Fase 2, etapa 2:** "Fase 2, etapa 2: importação mensal com prévia, conciliação e mapeamento de ativos, como na seção Importação mensal das posições."
- **Fase 2, etapa 3:** "Fase 2, etapa 3: áreas do banker e do comitê, editor do plano e telas Patrimônio, Plano e Histórico."
- **Fase 2, etapa 4:** "Fase 2, etapa 4: termômetro mensal, rotinas de dados de mercado e trilha de auditoria."
- **Fase 2, nuvem (só com sua autorização):** "Criei o projeto Supabase na região São Paulo e fiz login na CLI. Ligue o repositório ao projeto (supabase link), aplique as migrações (supabase db push) sem o seed de exemplo e me diga quais variáveis e segredos configurar."
- **Fase 3:** "Fase 3. Nesta ordem: convites e termos de uso, modo reunião, e-mail mensal com o termômetro, Pergunte ao plano, longevidade estocástica, módulo de impostos e atribuição da variação mensal. No Pergunte ao plano, siga a seção E se? e linguagem natural: a IA só propõe parâmetros, o motor calcula, e nada sai do servidor com dados que identifiquem o cliente."

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
| Longevidade | [Tábua BR-EMS 2021 (SciELO)](https://www.scielo.br/j/rbepop/a/zyWwVwmnbZhNz9JTSTjB4bd/abstract/?lang=pt) | Mortalidade da população segurada, para a v2 | Localizado |
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

## Fora de escopo e o que não fazer

O app simula planos; ele não opera, não recomenda e não controla o dia a dia financeiro.

- Não conectar a custodiantes nem a Open Finance na v1.
- Não executar ordens, aplicações ou resgates, nem mostrar botões de investir.
- Não recomendar produtos, ativos ou alocação, nem usar frases como "você deveria".
- Não comparar a família com outros clientes nem mostrar rankings de fundos.
- Não categorizar extratos nem controlar gastos do dia a dia: o app trabalha com o gasto anual planejado.
- Não calcular a declaração de imposto de renda nem gerar guias de pagamento.
- Não usar dados reais em desenvolvimento: só a Família Andrade e dados anonimizados.
- Não guardar CPF, dados bancários ou senhas de custodiantes.
- Não colocar chaves de API no código do navegador nem guardar dados de clientes no armazenamento local do navegador.
- Não commitar `.env.local`, chaves ou planilhas de clientes.
- Não aplicar migrações direto no banco da nuvem: só por arquivos em `supabase/migrations`, testados antes no Supabase local.
- Não deixar a IA calcular números: quem calcula é sempre o motor.
- Não inventar premissas, séries de mercado ou regras tributárias.
- Não mostrar uma probabilidade sem a data das posições e a versão das premissas ao lado.

## Perguntas em aberto

Decisões que o agente não deve tomar sozinho. Enquanto não houver resposta, use o padrão indicado e registre em `docs/DECISOES.md`.

**Alex e Murilo**

- [ ] Quais 3 a 5 famílias entram no piloto? (Padrão: só a Família Andrade.)
- [ ] Horizonte padrão: 95 ou 100 anos? (Padrão: 95.)
- [ ] O cliente usa o "E se?" sozinho desde o início, ou só nas reuniões durante o piloto? (Padrão: só nas reuniões.)
- [ ] Familiares convidados veem valores em reais? (Padrão: não.)

**Comitê**

- [ ] Classes de ativo oficiais e índices de referência.
- [ ] Retorno, volatilidade, correlações e graus de liberdade; premissas líquidas ou brutas de impostos.
- [ ] Perfis de alocação e pesos-alvo antes e depois da aposentadoria.
- [ ] Probabilidade-alvo e limites das faixas. (Padrão: alvo de 90%; faixas em 70%, 85% e 99%.)

**Operações**

- [ ] Formato real do arquivo de posições hoje, e se cada ativo já tem uma classe atribuída.
- [ ] Onde estão hoje os dados do plano de cada família: renda, gastos, eventos e metas.

**Compliance e TI**

- [ ] Base legal na LGPD e nome do encarregado de dados.
- [ ] Aprovação dos textos de aviso.
- [ ] Uso de IA com dados agregados de clientes: permitido, e com qual provedor?
- [ ] Uso do Claude Code no desenvolvimento aprovado pela TI (o código e os dados fictícios passam pela Anthropic; dados reais, nunca).
- [ ] Hospedagem no Supabase (região São Paulo) e do front-end (Vercel, Netlify ou Cloudflare Pages) aceita pela política de TI.
- [ ] Repositório privado: em qual conta do GitHub, e quem mais tem acesso?
- [ ] Marca: cores, logotipo e domínio próprio.
