# Montante liquidado pela corretora (taxa efetiva opcional)

## Problema

Hoje toda a conversão para a moeda da carteira usa a taxa do BCE à data do evento (`reportTransaction`, `reportedTransactionTotals`, `FxAmount`). O BCE publica uma taxa de referência diária única; a corretora liquida com spread e à hora da execução. Daí as pequenas diferenças observadas em ativos USD.

## Princípio da proposta

O facto financeiro continua a ser registado na moeda nativa do ativo. A conversão passa a ter duas origens possíveis, por transação:

1. **Taxa BCE (por defeito)** — comportamento atual, inalterado.
2. **Liquidação efetiva (opcional)** — o utilizador indica o montante realmente debitado/creditado na moeda da carteira. Desse montante deriva-se a taxa efetiva (`liquidado / bruto nativo`), que substitui a taxa BCE apenas nessa transação.

Nunca se pede ao utilizador uma taxa de câmbio: pede-se um número que ele tem no extrato. A taxa é derivada, tal como o preço unitário já é derivado de quantidade + montante.

## UX (um único campo, escondido por defeito)

No formulário de transação, apenas quando a moeda do ativo difere da moeda da carteira, aparece uma linha extra no fim:

- Checkbox: "Conhecer o montante liquidado em EUR" (moeda da carteira, dinâmica).
- Ao ativar: um campo numérico, pré-preenchido com o valor calculado pelo BCE (bruto = montante + comissões + impostos), editável.
- Abaixo, em texto pequeno: taxa efetiva derivada e desvio face ao BCE (ex.: "1 USD = 0,9187 EUR · +0,34% vs BCE").

Sem transações estrangeiras, o formulário fica exatamente como está hoje.

## Onde entra na apresentação

- Lista de transações: a linha convertida mostra o valor liquidado com um marcador discreto (badge "liquidado" ou "†") e o tooltip passa a dizer "taxa efetiva da corretora" em vez da taxa BCE.
- Totais convertidos (capital investido, entradas, saídas, rendimentos, custos): usam a taxa efetiva quando existe, BCE nos restantes eventos.
- Nota de rodapé FX: acrescenta uma frase quando pelo menos uma transação usa liquidação efetiva.
- Valorizações mantêm-se 100% BCE — não há liquidação de caixa numa valorização.

## Detalhe técnico

**Persistência sem migração.** O valor guarda-se em `transactions.metadata`, campo já existente e livre:

```json
{ "settlement": { "amount": 1834.52, "currency": "EUR" } }
```

Vantagens: zero alterações de schema, RLS e grants intocados, retrocompatível (ausência de `settlement` = comportamento BCE). Alternativa descartada por agora: colunas dedicadas `settlement_amount` / `settlement_currency` — só valem a pena se mais tarde quisermos filtrar/agregar por elas em SQL.

**Camada de domínio.** Novo helper puro (ex.: `src/services/settlement.ts`) com:
- `readSettlement(transaction)` → `{ amount, currency } | null`, validando que a moeda coincide com a de reporting e que o montante é finito e > 0.
- `effectiveRate(transaction, grossNative)` → taxa derivada.

**Camada de reporting.** `reportTransaction` e `reportedTransactionTotals` em `src/services/reporting.ts` passam a receber a moeda de reporting e a consultar primeiro a liquidação; só chamam `rateAt` quando não existe. A `FxRateTable` e `rateAt` não mudam. Uma transação com liquidação deixa de contar para `missingCurrencies` (não precisa de taxa BCE).

**Tipo de resolução.** `ReportedAmount.rate` ganha origem explícita (`source: "ecb" | "settlement"`) para a UI poder distinguir sem heurística.

**Formulário.** `transaction-form-dialog.tsx` recebe `reportingCurrency` e a `FxRateTable` já carregada pela `TransactionsSection` (nenhum fetch novo), calcula o valor sugerido e escreve/limpa `metadata.settlement` no submit.

**Testes.** Casos em vitest: liquidação presente sobrepõe BCE; liquidação ausente mantém BCE; liquidação em moeda errada é ignorada; totais mistos (umas transações com, outras sem).

## Fora de âmbito

- Rentabilidade/XIRR em moeda de reporting.
- Liquidação em valorizações.
- Registo separado do spread da corretora como custo (ficaria implícito na taxa efetiva).
