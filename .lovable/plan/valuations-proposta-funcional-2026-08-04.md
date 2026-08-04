# Valuations — proposta funcional

## 1. Princípio base

Uma Valuation é um **facto observado de valor** numa data: "neste dia, este ativo valia X".
Transactions respondem a "quanto investi"; Valuations respondem a "quanto vale hoje".
Nunca se cruzam na escrita — só na leitura, no futuro Financial Engine.

A tabela `asset_valuations` já existe e serve o objetivo sem alterações de schema:
`asset_id`, `valuation_date`, `unit_price`, `total_value`, `currency`, `source`.

## 2. Modelo por AssetType — dois modos de entrada

Em vez de um formulário por tipo, existem **dois modos** e cada AssetType declara o seu no
`asset-profiles.ts` (campo novo `valuationMode`):

| Modo | AssetTypes | Utilizador introduz | Sistema calcula |
|---|---|---|---|
| `unit_price` | ETF, Stock, Fund, Bond, Crypto, Commodity | preço por unidade | `total_value = unit_price × quantidade derivada à data` |
| `total_value` | Capitalization Insurance, PPR, Real Estate, Cash | valor total / saldo / valor de contrato | `unit_price = null` |

No modo `unit_price` o total é mostrado em tempo real e pode ser sobreposto manualmente
(casos de desdobramentos ou dados de corretora), mantendo os dois campos coerentes.
Rótulos adaptados ao tipo: "Preço por unidade", "NAV por unidade", "Valor do contrato",
"Valor de mercado", "Saldo".

`source` é opcional e livre (`manual`, `broker`, `avaliação`), preparando importações futuras.

## 3. Valor Atual

Regra única e explícita:

```text
Valor Atual = total_value da valuation com maior valuation_date <= hoje
Se não existir valuation → fallback: custo da posição derivada das transactions
```

A UI indica sempre a origem do valor ("valorização de 30/06/2026" vs. "custo, sem valorização").
`assets.current_value` continua a ser apenas cache informativa — nunca fonte de verdade.

## 4. Compatibilidade com o Financial Engine

A série de valuations por data é exatamente o input que falta ao motor futuro:

- **Mais-valia não realizada** = Valor Atual − custo da posição
- **Rentabilidade** = (Valor Atual + rendimentos − investido) / investido
- **XIRR** = fluxos das transactions + valor final da última valuation como fluxo terminal
- **Séries históricas** = uma valuation por data alimenta `asset_performance_snapshots`

Nada disto exige alterar o modelo depois: as valuations já guardam data, unidade, total e moeda.

## 5. Multi-currency

`currency` é gravada em cada valuation e por defeito herda a moeda do ativo.
Não há conversão nesta fase: valores são apresentados na moeda do ativo.
Quando existir FX, a conversão será uma camada de leitura sobre `exchange_rates`
(`valuation.currency` → `portfolio.base_currency` à `valuation_date`), sem tocar nos dados gravados.

## 6. Fora de âmbito nesta etapa

FIFO, custo médio móvel definitivo, realized/unrealized gains avançados e correções
às métricas temporais atuais ficam para a etapa do Financial Engine.

## Detalhes técnicos da implementação

- `src/repositories/valuations.ts` — list (ordenado por data desc), get, create, update, delete;
  reutiliza `toValuation` já existente em `mapping.ts`.
- `src/domain/asset-profiles.ts` — novo campo `valuationMode: "unit_price" | "total_value"`
  e `valuationLabel` por tipo.
- `src/services/valuation-metrics.ts` — serviço puro: `latestValuation(valuations, asOf)`,
  `currentValue(asset, valuations, derivedPosition)`, sem I/O.
- `src/components/valuations/valuation-form-dialog.tsx` — formulário adaptativo ao modo.
- `src/components/valuations/valuations-section.tsx` — tabela com data, valor unitário,
  total, moeda, origem e ações editar/eliminar.
- `src/routes/_authenticated/app.asset.$assetId.tsx` — substitui o placeholder "Valorações"
  pela secção real e passa a mostrar o Valor Atual derivado.
- Sem migrations: `asset_valuations` já tem RLS e estrutura adequadas.
