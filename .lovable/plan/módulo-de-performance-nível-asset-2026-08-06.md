# Módulo de Performance (nível Asset)

Definição funcional e fórmulas para validação. Sem XIRR, TWR ou MWR nesta fase.

## Estado verificado

- `position-engine.ts` já devolve `quantity`, `averageCost`, `costBasis` e `realizedGain` em **moeda nativa**, reconstruídos cronologicamente.
- `valuation-metrics.ts` já resolve o **Valor Atual** (derivada = NAV × posição à data; manual = valor congelado).
- `reporting.ts` já converte **evento a evento** com prioridade: liquidação declarada → montante introduzido na moeda da carteira → taxa BCE à data (com carry-forward).
- `reportedTransactionTotals` já dá entradas/saídas/rendimentos/custos convertidos, mas **não** dá custo da posição remanescente nem mais-valias realizadas em moeda de reporting — é essa a peça em falta.

## Separação de camadas (mantida)

```text
Posição      → position-engine.ts   (nativo, factos)
Valorização  → valuation-metrics.ts (nativo, factos)
FX/Reporting → reporting.ts         (conversão por evento)
Performance  → performance.ts       (NOVO: só combina, não reconstrói)
```

O novo módulo não recalcula quantidade nem custo médio: consome os motores existentes.

## Plano de reporting: como se obtém o custo em moeda da carteira

Não se converte o `costBasis` nativo com a taxa de hoje. Corre-se o Position Engine **duas vezes**:

1. **Passagem nativa** — inalterada.
2. **Passagem em moeda de reporting** — cada transação é projetada com `reportTransaction()` (montante, comissões e impostos convertidos à taxa do seu evento) e o mesmo algoritmo de custo médio é aplicado sobre esses valores.

Resultado: `costBasis`, `averageCost` e `realizedGain` também na moeda da carteira, com o efeito cambial já incorporado no momento certo de cada evento. Quantidades são idênticas nas duas passagens.

## Métricas

### 1. Capital Investido

Capital líquido que o investidor ainda tem colocado no ativo, ao custo de aquisição.

```text
CapitalInvestido = costBasis da posição remanescente (passagem de reporting)
```

- **Subscrições** (buy, deposit, transfer_in): somam `montante + comissões + impostos` convertidos à taxa da data.
- **Resgates** (sell, withdrawal, transfer_out): reduzem o capital pelo **custo médio vigente** das unidades saídas, nunca pelo valor de venda.
- **Rendimentos e custos** (dividendos, juros, fees, taxes autónomos): não alteram capital investido.
- Posição totalmente alienada → capital investido = 0.
- Complementar, exposto em paralelo: `CapitalAplicadoBruto = Σ subscrições convertidas` (nunca decresce), usado como denominador da rentabilidade.
- **Multi-moeda**: cada evento converte-se à sua data; a soma é feita já em moeda de reporting. Nunca somar nativo e converter o total.

### 2. Valor Atual

```text
ValorNativo    = última valuation com data <= hoje
                 (derivada: NAV × quantidade à data; manual: total congelado)
                 sem valuations → costBasis nativo
ValorReporting = ValorNativo × taxa MAIS RECENTE disponível
```

Excepção deliberada já implementada em `reportCurrentValue`: o valor atual é uma foto de "quanto vale agora", pelo que usa a taxa corrente; todo o histórico continua a usar a taxa da data.

Apresentação: valor em moeda da carteira como número principal, valor em moeda nativa como nota complementar.

### 3. Mais-Valias Realizadas

Reutiliza o motor. Nativo: `position.realizedGain`. Reporting: `realizedGain` da passagem de reporting.

```text
Realizada(evento) = (valor de venda − custos) convertidos à taxa da venda
                  − custo médio vigente das unidades saídas (já em reporting)
```

O ganho realizado em moeda da carteira inclui, por construção, o ganho cambial entre a compra e a venda.

### 4. Mais-Valias Não Realizadas

```text
NãoRealizada = ValorAtual − CapitalInvestido   (ambos em moeda de reporting)
```

- `null` quando não existe valuation e o valor cai no custo (não há ganho observável).
- Coerência temporal mantida: se a valuation usada for histórica, o capital comparado é o da posição **à data dessa valuation**.

### 5. Ganho Total

Recomendação — expor dois níveis, para não misturar naturezas:

```text
GanhoDeCapital = Realizadas + NãoRealizadas
GanhoTotal     = Realizadas + NãoRealizadas + Rendimentos − CustosAutónomos
```

`GanhoTotal` é a métrica principal apresentada (é o que o investidor de facto ganhou); `GanhoDeCapital` fica visível como decomposição. Comissões e impostos ligados a compras/vendas já estão dentro do custo/realizado — não são contados outra vez.

### 6. Rentabilidade %

```text
Rentabilidade = GanhoTotal / CapitalAplicadoBruto
```

Denominador = soma das subscrições convertidas (capital que passou pelo ativo), não o capital remanescente.

- **Posição aberta**: equivale a ganho / investido.
- **Parcialmente alienada**: o ganho realizado continua no numerador e o capital já resgatado continua no denominador — sem saltos artificiais.
- **Totalmente alienada**: capital investido = 0 mas a rentabilidade continua definida (denominador > 0).
- Denominador 0 → `null`, nunca divisão por zero.
- Não é anualizada nem ponderada no tempo: isso fica para XIRR/TWR.

## Impacto do FX

- Todos os agregados são apresentados na **moeda da carteira**; a moeda nativa é informação complementar.
- Cada métrica devolve também `missingCurrencies` e `usedCarryForward`; havendo taxa em falta, a UI mostra o valor nativo com aviso em vez de um total silenciosamente errado.
- `attributeFxPerformance` (já existente) fica disponível para decompor ganho do ativo vs. efeito cambial, exposto como detalhe opcional.

## Exemplos

**A. Ativo USD, carteira EUR, posição aberta**

```text
10/01  compra 10 un a 100 USD = 1000 USD, taxa 1 EUR = 1,10 USD → 909,09 EUR
10/06  compra 10 un a 120 USD = 1200 USD, taxa 1 EUR = 1,05 USD → 1142,86 EUR
Capital investido = 2051,95 EUR   (custo médio 102,60 EUR/un)
Valuation 30/06: NAV 130 USD → 20 × 130 = 2600 USD, taxa corrente 1,08 → 2407,41 EUR
Não realizada = 2407,41 − 2051,95 = 355,46 EUR
Ganho total = 355,46 EUR   Rentabilidade = 355,46 / 2051,95 = 17,3%
```

**B. Alienação parcial**

```text
Vende 10 un a 140 USD = 1400 USD, taxa 1,06 → 1320,75 EUR
Custo das unidades saídas = 10 × 102,60 = 1026,00 EUR
Realizada = 294,75 EUR
Capital investido remanescente = 1025,95 EUR
Valor atual (10 un × 130 USD ÷ 1,08) = 1203,70 EUR
Não realizada = 177,75 EUR
Ganho total = 472,50 EUR   Rentabilidade = 472,50 / 2051,95 = 23,0%
```

**C. Com rendimento**

```text
Dividendo 50 USD à taxa 1,07 → 46,73 EUR
Ganho de capital = 472,50 EUR
Ganho total = 519,23 EUR   Rentabilidade = 519,23 / 2051,95 = 25,3%
```

## Implementação (após validação)

- **Novo** `src/services/performance.ts` (puro, sem I/O): `assetPerformance(assetType, transactions, valuations, { nativeCurrency, reportingCurrency, fxTable, asOf, unitBased })` devolvendo, em nativo e em reporting, capital investido, capital aplicado bruto, valor atual, realizadas, não realizadas, ganho de capital, ganho total, rentabilidade, mais `missingCurrencies` / `usedCarryForward` / `usedSettlement`.
- **Novo** em `src/services/reporting.ts`: `reportedPosition()` — a passagem do Position Engine sobre transações projetadas, reutilizando `reportTransaction`.
- **Novo** `src/services/performance.test.ts` cobrindo os três exemplos acima, posição fechada, ausência de valuations e taxa em falta.
- **Novo** `src/components/performance/performance-section.tsx`: cartões de métricas na página de detalhe do ativo, valores na moeda da carteira e nota em moeda nativa, sinalização de carry-forward/liquidação.
- **Alterado** `src/routes/_authenticated/app.asset.$assetId.tsx`: inserir a secção de performance entre Detalhes e Transações.
- Position Engine, valuation-metrics e transaction-metrics **não são alterados**.
