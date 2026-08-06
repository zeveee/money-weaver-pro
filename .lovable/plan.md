# Transações em moeda diferente da moeda do Ativo

## Princípio

Uma transação é um **facto histórico**. O utilizador pode introduzi-la em qualquer moeda,
mas o que fica registado como facto contabilístico é sempre o **montante na moeda nativa
do ativo**, convertido à taxa da data e **congelado** no momento da gravação.

```text
Introdução do utilizador          Conversão (uma só vez)         Facto persistido
170 EUR · 2,90 UP · 2026-08-01 →  taxa BCE EUR→USD 1,1712    →   199,10 USD · 2,90 UP
                                  (carry-forward se preciso)     + registo da origem
```

O Position Engine passa a trabalhar com a garantia (hoje implícita) de que todas as
transações de um ativo estão na mesma moeda: a nativa. Custo médio, mais-valias
realizadas e não realizadas e, no futuro, rentabilidade e XIRR são calculados nessa moeda.

## Comportamento pretendido

**Ao criar**
1. O campo de moeda passa a ser uma escolha explícita, com a moeda do ativo por defeito.
2. Se a moeda escolhida difere da do ativo, o formulário mostra a conversão em tempo real:
   taxa, data efetiva da taxa (assinalando carry-forward) e montante convertido.
3. Sem taxa disponível para a data, a gravação é bloqueada; o utilizador pode introduzir
   uma taxa manual (fica marcada como tal, para auditoria).
4. Comissões e impostos convertem-se pela mesma taxa — nunca por taxas diferentes.

**Ao gravar**
- Persistem-se `amount`, `fees`, `taxes` e `currency` já na moeda do ativo.
- Preserva-se o original em `metadata.entry`: montante, moeda, comissões, impostos, taxa
  usada, data efetiva da taxa, caminho da conversão (direta/inversa/triangulada), origem
  (BCE ou manual) e instante da conversão.

**Estabilidade**
- A conversão nunca é recalculada por backfills, correções do BCE ou mudança de fonte.
- Só é recalculada quando o utilizador edita explicitamente o montante, a moeda ou a data
  da transação — e nesse caso a UI mostra a nova taxa antes de gravar.
- As valuations mantêm o comportamento atual (taxas históricas vivas para a sua data).

**Relação com o "montante liquidado"**
Quando a moeda de introdução coincide com a moeda base da carteira (ex.: carteira EUR,
ativo USD, transação introduzida em EUR), o montante introduzido é, por definição, o valor
realmente movimentado nessa moeda. Esse valor alimenta automaticamente a liquidação já
existente (`metadata.settlement`), pelo que o reporting deixa de reconverter USD→EUR e
mostra exatamente os 170 EUR introduzidos. Evita-se assim o ida-e-volta cambial.

**Apresentação**
Na lista, o valor principal continua na moeda do ativo, com nota de rodapé do tipo
`introduzido: 170,00 EUR · 1 EUR = 1,1712 USD · BCE 2026-08-01`.

## Cenários suportados

| Carteira | Ativo | Introdução | Facto guardado | Reporting |
| --- | --- | --- | --- | --- |
| EUR | USD | EUR | USD (congelado) | usa o EUR introduzido |
| USD | GBP | GBP | GBP (sem conversão) | GBP→USD à taxa da data |
| CHF | EUR | EUR | EUR (sem conversão) | EUR→CHF à taxa da data |

## Detalhe técnico

- **Novo serviço puro** `src/services/transaction-entry.ts`: tipo `TransactionEntry`,
  `convertEntry(fxTable, entry, assetCurrency, date)` devolvendo montantes nativos +
  registo congelado, `readEntry(metadata)` e `withEntry(metadata, entry)`. Sem I/O,
  reutiliza `rateAt` de `src/services/fx.ts`.
- **Sem migração de schema**: o original vive em `transactions.metadata.entry`, tal como
  `settlement`. Transações antigas sem `entry` continuam válidas (o `currency` da linha já
  é a moeda do facto).
- `src/components/transactions/transaction-form-dialog.tsx`: seletor de moeda, painel de
  conversão, taxa manual de recurso, e composição de `metadata` com `entry` + `settlement`
  derivado quando aplicável. Congelamento: em edição, a taxa guardada é reutilizada
  enquanto montante/moeda/data não mudarem.
- `src/components/transactions/transactions-section.tsx`: nota de rodapé de origem e
  carregamento da tabela FX também quando a moeda de introdução difere da do ativo.
- `src/services/position-engine.ts` **não muda** — passa apenas a ter a invariante
  garantida a montante.
- `src/services/reporting.ts`: pequena precedência adicional para o `entry` na moeda de
  reporting (equivalente ao caminho `settlement` já existente).
- Testes em `src/services/transaction-entry.test.ts`: conversão direta, inversa,
  triangulada, carry-forward, ausência de taxa, congelamento em edição e coerência de
  comissões/impostos.
