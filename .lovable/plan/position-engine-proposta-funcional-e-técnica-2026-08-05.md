# Position Engine — proposta funcional e técnica

## 1. Diagnóstico

O motor atual (`derivePosition`) já ordena cronologicamente, mas tem três falhas que
explicam a quantidade errada:

1. **Uma alienação sem quantidade preenchida cai no ramo "sem quantidade"**: reduz o custo
   mas não reduz unidades. A posição fica inflacionada e o custo médio implícito colapsa.
2. **Resgates de seguros/PPR estão declarados como `usesQuantity: false`** na matriz de
   transações. Em produtos Unit Linked isto ignora sempre as unidades resgatadas.
3. **Não existe posição a uma data**: o motor só devolve a posição final. Valuations em modo
   `unit_price` precisam da quantidade **à data da valorização**, não da quantidade de hoje.

O custo médio é hoje recalculado como `custo / quantidade` a cada leitura. O valor numérico
coincide com o esperado, mas a regra não está explícita: passa a ser recalculado apenas em
aquisições, e as saídas apenas consomem unidades e custo ao custo médio vigente.

## 2. Modelo funcional

A posição é reconstruída evento a evento, por ordem cronológica estável.

```text
estado = { quantidade, custoTotal, custoMedio, maisValiaRealizada }

AQUISIÇÃO (com unidades)
  custoTotal  += montante + comissões + impostos
  quantidade  += qtd
  custoMedio   = custoTotal / quantidade        <- único ponto de recálculo

ALIENAÇÃO (com unidades)
  qtdSaida     = min(qtd, quantidade)
  custoSaida   = qtdSaida × custoMedio          <- custo médio vigente, congelado
  maisValia   += (montante − comissões − impostos) − custoSaida
  quantidade  -= qtdSaida
  custoTotal  -= custoSaida
  custoMedio   = inalterado                     <- nunca recalculado numa saída

RENDIMENTO / CUSTO / AJUSTE
  não alteram quantidade nem custo médio
```

Ordenação: `occurred_at` crescente; empates desempatados por `created_at` e depois por `id`,
para que o resultado seja determinístico e reproduzível.

Compra → Compra → Venda e Compra → Venda → Compra produzem resultados diferentes por
construção, porque o custo médio usado na saída é o vigente nesse instante da sequência.

Validação com o Exemplo 1: 100@10 → 200 un / 3.000 € / 15 €; resgate de 50 → custo de saída
750 €, mais-valia 750 €, remanescente 150 un / 2.250 € / 15 €. Exatamente o esperado.

Ativos sem unidades (Cash, PPR clássico, Imobiliário, seguros de capitalização clássicos)
mantêm o modelo atual de capital líquido: entradas somam custo, saídas consomem custo e
geram mais-valia, com `quantidade = 0` e sem custo médio.

## 3. Posição a uma data

O motor passa a expor `positionAt(assetType, transactions, data)`, que aplica exatamente o
mesmo algoritmo apenas aos eventos até essa data. Serve três consumidores:

- Valuations `unit_price`: `total = unit_price × quantidade à valuation_date`.
- Valor Atual: quantidade de hoje.
- Futuro Financial Engine: séries históricas e XIRR, sem duplicar lógica.

O modelo de Valuations não muda: continua a guardar `unit_price`, `total_value`, moeda e
origem, e o Valor Atual continua a ser a valorização mais recente até à data.

## 4. Unit Linked e produtos com Unidades de Participação

Passa a existir uma característica explícita do ativo — **"Baseado em unidades de
participação"** — disponível em `capitalization_insurance` e `ppr`, guardada em
`assets.metadata.unitBased` (sem migration).

Quando ativa:

- Reforço e Resgate passam a pedir quantidade de UPs; o preço da UP é derivado
  (`montante / unidades`), como em qualquer aquisição.
- O modo de valorização do ativo passa a `unit_price`, com rótulos "NAV por UP" e
  "Valor da apólice".
- Valor Atual = quantidade de UPs à data × NAV.

Quando inativa, o comportamento é o atual: `total_value`, sem unidades. O default para
seguros e PPR mantém-se `total_value`; a escolha é do utilizador no formulário do ativo.

## 5. Integridade dos dados

- Alienação com unidades superiores à posição: bloqueada na validação do formulário, com
  a quantidade disponível à data indicada na mensagem.
- Transações de tipo com unidades gravadas sem quantidade: sinalizadas na lista de
  transações como incoerentes, para correção manual, em vez de silenciosamente ignoradas.
- `assets.quantity`, `average_cost` e `current_value` mantêm-se cache informativa.

## Detalhes técnicos

- `src/services/position-engine.ts` (novo): motor puro e cronológico. Expõe
  `buildPosition(assetType, transactions, { asOf })`, `positionAt`, e um tipo `Position`
  com `quantity`, `averageCost`, `costBasis`, `realizedGain`, `tracksQuantity`, `asOf`.
  Inclui a decisão de "esta transação usa unidades" com base no AssetType, na opção da
  matriz e na flag `unitBased`, deixando de depender de `quantity > 0` no registo.
- `src/services/transaction-metrics.ts`: `derivePosition` passa a delegar no novo motor,
  mantendo a assinatura atual para não quebrar consumidores. `transactionTotals` fica igual.
- `src/domain/transaction-profiles.ts`: `usesQuantity(assetType, type, opts?)` aceita o
  contexto `unitBased`, tornando Reforço/Resgate baseados em unidades nesses produtos;
  `validateTransactionForm` recebe a quantidade disponível para validar alienações.
- `src/domain/asset-profiles.ts`: campo `unitBased` nos perfis de seguro e PPR e
  `getValuationSpec(assetType, { unitBased })` a devolver `unit_price` nesses casos.
- `src/components/transactions/transaction-form-dialog.tsx` e
  `src/components/valuations/valuation-form-dialog.tsx`: passam o contexto do ativo e usam a
  quantidade derivada à data selecionada.
- `src/routes/_authenticated/app.asset.$assetId.tsx`: mostra quantidade, custo médio e
  mais-valias realizadas vindas do novo motor.
- Testes unitários do motor cobrindo os Exemplos 1 e 2 e a ordem inversa.
- Sem migrations e sem alterações ao modelo de Valuations.
