# Recorrências: coluna dedicada em `transactions`

## Recomendação

**Opção 2 — criar já `recurring_transaction_id` como coluna dedicada** em `public.transactions`, na mesma migration que cria `recurring_transactions`. Se a entidade é permanente, guardar a ligação em `metadata` só adia uma segunda migration (backfill de JSONB para coluna, com risco de dados inconsistentes por já existirem transações geradas).

### Porquê

- **Reporting** — filtrar/agrupar por origem (`WHERE recurring_transaction_id = ...`, "quanto entrou por reforços programados vs. manual") é uma junção normal, sem `metadata->>'...'` nem casts para uuid.
- **Auditoria** — integridade referencial real: a FK garante que o id aponta para uma regra existente; em JSONB nada impede um id órfão ou mal formatado.
- **Performance** — índice B-tree simples sobre a coluna; em JSONB seria preciso índice de expressão, mais frágil e ignorado por queries ligeiramente diferentes.
- **XIRR** — não muda os cálculos (continuam a usar montante+data das transações realizadas), mas permite cenários "excluir/isolar reforços programados" sem parsing.
- **Integrações futuras** — importadores e deduplicação (evitar gerar duas vezes a ocorrência do mesmo mês) ficam sobre uma constraint verificável, não sobre convenção.

`metadata` continua útil para o que é genuinamente variável (ex.: `incomeKind`, dados de importação); a proveniência estrutural não é isso.

## Alterações propostas ao schema

Na migration de `recurring_transactions`, acrescentar a `public.transactions`:

```text
recurring_transaction_id  uuid  NULL
  REFERENCES public.recurring_transactions(id) ON DELETE SET NULL

INDEX idx_transactions_recurring
  ON public.transactions(recurring_transaction_id)
  WHERE recurring_transaction_id IS NOT NULL
```

- **NULL permitido** — transações manuais (a maioria) não têm origem recorrente.
- **ON DELETE SET NULL** — apagar uma regra nunca pode apagar factos financeiros já ocorridos; a transação sobrevive, perde apenas a etiqueta de origem.
- **Índice parcial** — só indexa as linhas geradas, mantendo-o pequeno.
- **Opcional, recomendado**: `UNIQUE (recurring_transaction_id, occurred_at)` parcial, para tornar impossível gerar duas vezes a mesma ocorrência.

Sem backfill necessário: ainda não existem transações geradas por recorrência.

## Impacto no código

- `src/domain/types.ts` — `Transaction` ganha `recurringTransactionId: UUID | null`.
- `src/repositories/mapping.ts` — mapear o novo campo.
- `src/repositories/transactions.ts` — aceitar/escrever o campo em `TransactionWriteInput` (default `null`).
- `src/services/transaction-metrics.ts` — sem alterações de cálculo; abre a porta a métricas por origem mais tarde.
- Formulário manual — inalterado (envia `null`).

## Nota

Esta é uma recomendação; nada é executado até aprovares. A implementação entra na mesma migration de `recurring_transactions` já proposta, para não haver duas migrations.
