# Correção: snapshot FX não é reconstruído ao editar a data

## Diagnóstico (confirmado no código)

É um bug real, e está localizado num único sítio: `entryMatches` em
`src/services/transaction-entry.ts` compara apenas **moeda, montante, comissões e impostos**.
A **data não entra na comparação**. Como `convertEntry` reutiliza a introdução congelada
sempre que `entryMatches` devolve verdadeiro, alterar só a data mantém a taxa e a data FX
antigas — exatamente o que observou.

O formulário já passa a introdução congelada como `frozen` e já recalcula o painel de
conversão a cada mudança de `occurredAt`; o problema não está na UI, está na regra de
correspondência.

## Correção recomendada

1. Passar a guardar no snapshot a **data do evento** que o originou (`entryDate`), a par da
   data efetiva da taxa (`rateDate`, que pode ser anterior por carry-forward).
2. `entryMatches` passa a exigir também igualdade da data do evento. Qualquer alteração de
   data, moeda, montante, comissões ou impostos invalida o snapshot e força nova procura da
   taxa histórica para a nova data, gerando um novo snapshot congelado (`convertedAt` novo).
3. Manter intacto o princípio acordado: sem edição relevante, a taxa nunca é recalculada —
   backfills ou correções do BCE não tocam em factos já gravados.

### Transações antigas (sem `entryDate`)

Snapshots já gravados não têm este campo. Regra de compatibilidade: um snapshot legado só é
reutilizado se a data do evento continuar a corresponder à `rateDate` gravada; caso contrário
é reconstruído. Na prática, uma edição de data numa transação antiga também passa a
recalcular corretamente, sem migração de dados.

### Falta de taxa na nova data

Se não existir taxa (nem carry-forward) para a nova data, a gravação é bloqueada com a
mensagem já existente e o utilizador pode introduzir taxa manual — o comportamento atual de
criação aplica-se igualmente à edição.

## Detalhe técnico

- `src/services/transaction-entry.ts`
  - `TransactionEntry` ganha `entryDate: ISODate`.
  - `readEntry` lê `entryDate` (opcional, string vazia quando ausente).
  - `entryMatches(frozen, input)` compara `toRateDate(input.occurredAt)` com
    `frozen.entryDate`; quando `entryDate` está ausente, compara com `frozen.rateDate`.
  - `convertEntry` preenche `entryDate` em snapshots novos e, ao reutilizar um snapshot,
    normaliza o campo.
- `src/components/transactions/transaction-form-dialog.tsx`: sem alterações de lógica; o
  painel passa a mostrar "congelada na criação" apenas quando o snapshot é de facto
  reutilizado.
- Carregamento FX: garantir que a tabela de taxas cobre também a nova data escolhida na
  edição (a janela `since` do `useFxTable` deve incluir a data mais antiga entre a original
  e a editada).
- Testes em `src/services/transaction-entry.test.ts`: alterar apenas a data recalcula a taxa;
  não alterar nada mantém a taxa congelada mesmo com catálogo corrigido; snapshot legado sem
  `entryDate` é reconstruído ao mudar a data.
