# Estado independente por ocorrência recorrente

## Causa confirmada

O cálculo de pendências usa `last_generated_on` como marcador **global** de progresso: `pendingOccurrences` só considera datas posteriores a essa marca. Ao confirmar 23/05/2026, o repositório avança a marca para essa data, pelo que todas as ocorrências anteriores (23/07/2025 … 23/04/2026) passam a ser consideradas já processadas e desaparecem — mesmo nunca tendo sido confirmadas nem dispensadas.

O mesmo acontece com "Dispensar" individual, que hoje é implementado como "avançar a marca".

## Comportamento pretendido

Cada ocorrência passa a ter estado próprio:

- **confirmada** — existe uma transação ligada à regra naquela data (já é assim hoje).
- **dispensada** — registada explicitamente como dispensada, apenas essa data.
- **pendente** — nem uma nem outra.

Confirmar ou dispensar uma ocorrência isolada não afeta nenhuma outra. "Confirmar todas" e "Dispensar todas" continuam a operar sobre o conjunto listado, ocorrência a ocorrência.

## Como fica

- `last_generated_on` deixa de ser marcador de progresso e passa a ser apenas a **âncora inicial** da regra: define a partir de que data as ocorrências existem (opção "apenas futuro" = hoje; opção "com histórico" = vazio). Nunca mais é avançado por confirmações ou dispensas.
- As datas dispensadas ficam guardadas na própria regra, no campo de metadados já existente (`metadata.dismissedDates`), sem necessidade de migração nem de nova tabela.
- A lista de pendentes passa a filtrar: datas previstas desde a âncora, menos as que já têm transação, menos as dispensadas.
- Opcional na UI (sem alterar o modelo): quando existirem dispensadas, mostrar a contagem com ação de "repor" — se não quiser, fica de fora.

Nada muda nos cálculos financeiros: só as transações continuam a contar para capital investido, rentabilidade e XIRR.

## Detalhes técnicos

- `src/services/recurrence.ts`: `pendingOccurrences` passa a excluir também as datas em `rule.metadata.dismissedDates`; o filtro por `lastGeneratedOn` mantém-se apenas como limite inferior (âncora), já que deixa de ser mutado.
- `src/repositories/recurring-transactions.ts`:
  - `generateOccurrences` deixa de chamar `markGeneratedUpTo` no fim (a confirmação é evidenciada pela transação criada).
  - `markGeneratedUpTo` é substituído por `dismissOccurrences(ruleId, dates[])`, que faz merge das datas no array `metadata.dismissedDates` (ordenado e sem duplicados) e devolve a regra atualizada. Adiciona-se `restoreOccurrences` se a ação de repor for incluída.
  - `createRecurringTransaction` mantém-se: âncora = `null` com histórico, `todayISO()` sem histórico.
- `src/components/recurring/recurring-section.tsx`: "Dispensar" individual chama `dismissOccurrences(r.id, [d])`; "Dispensar todas" passa o array completo de pendentes em vez da última data.
- Sem migração de base de dados.
