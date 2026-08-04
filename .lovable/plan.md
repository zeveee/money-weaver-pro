# Recurring Transactions: modos de execução, histórico e geração

## Comportamento recomendado

Manter a separação atual e acrescentar **duas propriedades à regra**: modo de execução e marca da última ocorrência gerada. Tudo o resto (geração, confirmação, edição) é lógica de aplicação sobre a tabela `transactions` já existente.

- **Recurring Transaction** = instrução. Nunca entra em cálculos.
- **Transaction** = facto. Única fonte de verdade, venha de onde vier.
- **Ocorrência pendente** = valor calculado em memória (data prevista sem transação correspondente). Não é persistida.

### Modo Manual
- O sistema calcula as datas previstas até hoje e mostra-as como *pendentes* na secção do ativo.
- Nada existe na base de dados até o utilizador confirmar.
- Confirmar cria uma `transaction` normal com `recurring_transaction_id` preenchido; a data pode ser ajustada antes de confirmar.
- Ignorar/dispensar uma ocorrência: marca-se avançando `last_generated_on` sem criar transação.

### Modo Automático
- Destinado a débitos diretos. A geração corre, sem confirmação, quando o utilizador abre o ativo (recuperação idempotente) e, mais tarde, por um job diário `pg_cron`.
- Cria `transactions` para todas as datas previstas entre `last_generated_on` (ou `start_date`) e hoje.
- Idempotência garantida por índice único parcial `(recurring_transaction_id, occurred_at)` — reabrir a página nunca duplica.

## Histórico retroativo (opções A/B)

No formulário de criação da regra, uma escolha explícita:

- **Opção A — Apenas futuro**: grava-se a regra com `last_generated_on = hoje`. Nada retroativo é criado.
- **Opção B — Gerar histórico desde o início**: o sistema calcula todas as ocorrências entre `start_date` e hoje e mostra uma **pré-visualização** (nº de ocorrências, datas, total acumulado) antes de gravar. Ao confirmar, cria as transações em bloco.

Exemplo 50 €/mês desde 23/07/2025 até 04/08/2026: 13 ocorrências, 650 € de capital investido, todas ligadas à regra.

As transações geradas são transações comuns: editáveis, elimináveis, contam para capital investido, rentabilidade e XIRR. Eliminar uma transação gerada não a faz reaparecer (a marca `last_generated_on` já avançou); recriar exige "gerar novamente" explícito.

### Calendário de ocorrências
- `weekly`: de 7 em 7 dias a partir de `start_date`.
- `monthly` / `quarterly` / `semiannual` / `annual`: mesmo dia do mês de `start_date`, ou `day_of_month` quando definido; dias 29–31 em meses curtos caem no último dia do mês.
- Nunca gera para lá de `end_date` nem enquanto `is_active = false`.

## Fluxo completo

```text
Criar regra
  ├─ modo: manual | automático
  └─ histórico: apenas futuro | gerar desde start_date (com pré-visualização)
        │
        ▼
Motor de ocorrências (puro, src/services/recurrence.ts)
  datas previstas = f(start, frequency, dayOfMonth, end, hoje)
        │
   ┌────┴─────────────────┐
manual                  automático
mostra pendentes        cria transactions
utilizador confirma  →  transactions (recurring_transaction_id)
        │
        ▼
transaction-metrics / XIRR / Valuations  ← não distinguem a origem
```

## Impacto nos cálculos

Nenhum. `transactionTotals`, `derivePosition` e o futuro XIRR continuam a ler apenas `transactions`; `recurring_transaction_id` é metadado de rastreio. As ocorrências pendentes vivem só na UI e são explicitamente rotuladas como não contabilizadas.

## Impacto no histórico

Regras com Opção B passam a produzir histórico real, o que torna o capital investido e a data de aquisição derivada corretos desde a primeira ocorrência — hoje ambos ignoram o passado do débito direto.

## Impacto na geração automática

Recuperação idempotente ao abrir o ativo cobre o MVP sem infraestrutura. Um `pg_cron` diário sobre um endpoint `/api/public/hooks/recurring-run` pode ser acrescentado depois sem tocar no modelo.

## UX

- Badge "Recorrente" nas linhas de `transactions-section` cuja `recurringTransactionId` não é nula; as manuais ficam sem badge.
- Na secção Reforços Programados: modo da regra, próxima data prevista e, em modo manual, lista de pendentes com botões Confirmar / Dispensar.

## Detalhes técnicos

Migration mínima (necessária — não há onde guardar o modo de forma consultável):

- `CREATE TYPE public.recurrence_execution_mode AS ENUM ('manual','automatic')`
- `recurring_transactions.execution_mode` (not null, default `'manual'`)
- `recurring_transactions.last_generated_on date NULL`
- `CREATE UNIQUE INDEX ... ON public.transactions (recurring_transaction_id, occurred_at) WHERE recurring_transaction_id IS NOT NULL`

Sem novas tabelas, sem alterações a RLS (herdada por `asset → portfolio → owns_portfolio`).

Código:
- `src/services/recurrence.ts` — motor puro de datas (ocorrências previstas, próxima data, pendentes por diferença com transações existentes).
- `src/repositories/recurring-transactions.ts` — campos novos + `generateOccurrences(rule, upTo)` com insert em bloco.
- `src/domain/types.ts`, `src/repositories/mapping.ts` — `executionMode`, `lastGeneratedOn`.
- `recurring-form-dialog.tsx` — seletor de modo + escolha A/B com pré-visualização.
- `recurring-section.tsx` — pendentes, confirmar/dispensar, próxima data.
- `transactions-section.tsx` — badge de origem.
