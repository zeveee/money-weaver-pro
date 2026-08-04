# Correção: modo Manual e desvio de datas nas recorrências

Dois defeitos de implementação. Modelo funcional, UX e arquitetura mantêm-se.

## 1. Modo Manual a criar transações imediatamente

Hoje, ao gravar uma regra nova com "Gerar histórico desde a data de início", o repositório cria de imediato as transações em bloco, independentemente do modo de execução.

Correção:

- **Manual + histórico**: não criar nada. A regra grava-se com a marca de processamento vazia, de modo que todas as ocorrências passadas apareçam como *pendentes* na secção do ativo, para confirmação individual ou "Confirmar todas".
- **Manual + apenas futuro**: mantém-se como está (marca = hoje, nada retroativo).
- **Automático + histórico**: continua a criar as transações retroativas (comportamento correto para débito direto).
- **Automático + apenas futuro**: marca = hoje; a geração automática só corre para datas futuras.

O texto de pré-visualização no formulário passa a distinguir os dois casos: em modo manual anuncia "ocorrências pendentes para confirmação", em modo automático anuncia "transações criadas".

## 2. Ocorrências com um dia a menos (23 → 22)

O motor de recorrência calcula corretamente em UTC (23/07/2025), mas a apresentação converte para o fuso local: uma data guardada à meia-noite UTC recua um dia em fusos negativos. Daí 22/07, 22/08 e "próxima 22/08/2026".

Correção:

- Formatar datas puras (`YYYY-MM-DD`) diretamente a partir da string, sem passar por conversão de fuso — nas secções de recorrências, de transações e na data de aquisição derivada.
- Passar a materializar as transações geradas ao meio-dia UTC em vez da meia-noite, para que qualquer formatação local continue a cair no dia certo.
- Correção pontual de dados: as transações já geradas à meia-noite UTC são reposicionadas para meio-dia UTC, mantendo o dia correto e a idempotência.

## Detalhes técnicos

- `src/repositories/recurring-transactions.ts`: `createRecurringTransaction` decide entre backfill real e marca vazia consoante `executionMode`; `generateOccurrences` grava `occurred_at` como `T12:00:00.000Z`.
- `src/services/recurrence.ts`: sem alteração de lógica (o cálculo já é UTC-safe); `pendingOccurrences` continua a comparar por prefixo de data.
- Helpers de formatação: `dateLabel` em `recurring-section.tsx` e `transactions-section.tsx`, e a data de aquisição em `app.asset.$assetId.tsx`, passam a usar um formatador de data-only partilhado (`src/lib/date-format.ts`).
- Migração pontual de dados para normalizar `occurred_at` das transações com `recurring_transaction_id` para meio-dia UTC.
