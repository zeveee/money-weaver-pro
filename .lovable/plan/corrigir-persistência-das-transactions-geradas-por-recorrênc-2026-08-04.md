# Corrigir persistência das Transactions geradas por recorrências

## Diagnóstico (confirmado na base de dados)

`generateOccurrences` faz `upsert(..., { onConflict: "recurring_transaction_id,occurred_at" })`, o que o PostgREST traduz para `ON CONFLICT (recurring_transaction_id, occurred_at)` **sem cláusula WHERE**.

Os índices existentes em `public.transactions` são:

```text
transactions_pkey                        UNIQUE (id)
idx_tx_asset_date                        (asset_id, occurred_at DESC)
idx_transactions_recurring               (recurring_transaction_id) WHERE recurring_transaction_id IS NOT NULL
uq_transactions_recurring_occurrence     UNIQUE (recurring_transaction_id, occurred_at) WHERE recurring_transaction_id IS NOT NULL
idx_transactions_recurring_occurrence    UNIQUE (recurring_transaction_id, occurred_at) WHERE recurring_transaction_id IS NOT NULL
```

O índice único é **parcial**. O Postgres só consegue inferir um índice parcial se o `ON CONFLICT` repetir o mesmo predicado `WHERE` — coisa que o PostgREST não permite exprimir. Daí o erro `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Existem ainda dois índices únicos duplicados com a mesma definição.

## Correção proposta

Uma única migration, sem alterar modelo funcional, UX nem arquitetura:

1. Remover os dois índices únicos parciais duplicados.
2. Criar um índice único **não parcial** `uq_transactions_recurring_occurrence` sobre `(recurring_transaction_id, occurred_at)`.
   - Em Postgres, `NULL` nunca colide com `NULL` num índice único, por isso as transações manuais (`recurring_transaction_id IS NULL`) continuam a poder repetir-se livremente — o comportamento é idêntico ao do índice parcial.
   - Passa a ser inferível pelo `ON CONFLICT (recurring_transaction_id, occurred_at)` que o PostgREST envia.
3. Manter `idx_transactions_recurring` (índice de leitura por regra).

Nenhuma alteração de código de aplicação é necessária: o `upsert` com `ignoreDuplicates: true` em `src/repositories/recurring-transactions.ts` passa a funcionar tal como está, mantendo a geração idempotente.

## Verificação

Após a migration, confirmar na UI que "Confirmar" e "Confirmar todas" criam as transações, e que repetir a operação não duplica linhas.
