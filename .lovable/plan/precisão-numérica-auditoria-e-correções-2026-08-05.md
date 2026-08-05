# Precisão numérica — auditoria e correções

## 1. O que está guardado hoje (verificado na base de dados)

| Campo | Tipo | Casas decimais |
| --- | --- | --- |
| `transactions.quantity` | numeric(28,10) | 10 |
| `transactions.unit_price` | numeric(20,4) | 4 |
| `transactions.amount` / `fees` / `taxes` | numeric(20,4) | 4 |
| `asset_valuations.unit_price` (NAV) | numeric(20,4) | 4 |
| `asset_valuations.total_value` | numeric(20,4) | 4 |
| `assets.quantity` (cache) | numeric(28,10) | 10 |
| `assets.average_cost` (cache) | numeric(20,4) | 4 |
| `recurring_transactions.amount` | numeric(20,6) | 6 |
| `exchange_rates.exchange_rate` | numeric(20,10) | 10 |
| `benchmark_returns.return_value`, `snapshots.xirr` | numeric(12,8) | 8 |

Custo médio **não é um campo de cálculo**: o motor calcula-o em memória com
precisão total (float64). `assets.average_cost` é apenas cache informativa.

## 2. Os cálculos usam valores completos?

Sim. `mapping.ts` converte cada coluna com `Number(...)` diretamente do valor
devolvido pela base de dados, e o Position Engine, o `valuation-metrics` e o
`transaction-metrics` operam sobre esses números sem qualquer arredondamento
intermédio. Nenhum motor lê valores formatados da UI.

## 3. Onde ocorre arredondamento

- **Armazenamento**: sim, implícito, pela escala da coluna. É o único ponto
  onde se perde informação de forma permanente.
- **Cálculo**: não há arredondamento. Existe apenas o limite natural do
  float64 e um `EPSILON = 1e-9` usado para comparações, não para truncar.
- **Apresentação**: sim — `Intl.NumberFormat` para moeda, `toFixed(2)`,
  `toFixed(4)` para preço unitário, `Number(x.toFixed(8))` para quantidades.

## 4. Problemas reais encontrados

1. **NAV e preço unitário só têm 4 casas decimais.** É insuficiente para
   NAV de fundos/Unit Linked com 6 casas e sobretudo para cripto, onde o
   preço unitário pode ter muitas mais. Como a Valuation Derivada é
   `NAV × quantidade à data`, o erro do NAV é multiplicado pela posição.
2. **Escalas inconsistentes**: recorrências com 6 casas contra 4 nas
   transações que delas resultam.
3. **Arredondamento de apresentação disperso**: cada componente tem a sua
   função de formatação local, o que torna impossível garantir a regra
   "arredondar só na apresentação" de forma sistemática.
4. **`assets.average_cost` com 4 casas** dá a impressão de ser fonte de
   verdade quando é cache; o valor exibido deve vir sempre do motor.

## 5. Correções propostas

- **Migration de precisão**: aumentar `transactions.unit_price` e
  `asset_valuations.unit_price` para numeric(28,12), `assets.average_cost`
  para numeric(28,12) e uniformizar `recurring_transactions.amount` em
  numeric(20,4). Alterações de escala para cima, sem perda de dados.
- **Camada única de formatação** em `src/lib/number-format.ts`, com funções
  para moeda, quantidade, preço unitário e percentagem, usadas por toda a UI.
  Os motores continuam a devolver valores não arredondados.
- **Regra escrita** no `ARCHITECTURE.md`: repositórios e serviços nunca
  arredondam; apenas os componentes formatam.
- **Testes** no Position Engine com quantidades fracionárias e NAV de muitas
  casas, confirmando que quantidade, custo médio e mais-valias mantêm
  precisão total ao longo da sequência cronológica.

## Detalhes técnicos

- Migration: `ALTER TABLE ... ALTER COLUMN ... TYPE numeric(p,s)` nas colunas
  acima; sem alterações de RLS ou de modelo.
- `src/lib/number-format.ts` (novo): `formatCurrency`, `formatQuantity`
  (até 10 casas, sem zeros supérfluos), `formatUnitPrice` (até 8 casas),
  `formatPercent`. Substitui as funções locais em `valuations-section.tsx`,
  `transactions-section.tsx`, `recurring-section.tsx`,
  `recurring-form-dialog.tsx`, `valuation-form-dialog.tsx` e
  `transaction-form-dialog.tsx`.
- `position-engine.ts` e `valuation-metrics.ts` ficam inalterados na lógica:
  já operam em precisão total. Só se documenta a garantia e se acrescentam
  testes.
- Rentabilidade e XIRR, quando forem implementados, consomem `Position` e
  `resolveValuationValue` diretamente, sem passar por valores formatados.
