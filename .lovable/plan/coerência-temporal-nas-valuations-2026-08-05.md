# Coerência temporal nas Valuations

## O que está correto hoje

O formulário de valorização já usa a posição à data: `quantityAt(valuationDate)` chama `availableQuantityAt` → `positionAt`, pelo que a quantidade e o total derivado (preço unitário × quantidade) respeitam a data escolhida.

## Problemas confirmados

1. **Resumo superior usa a posição atual, não a posição à data.**
   `valuations-section.tsx` calcula `derivePosition(...)` sobre todo o histórico e usa esse `costBasis` tanto no cartão "Custo da posição" como na mais-valia não realizada. No exemplo dado, uma valuation de 01/03/2025 seria comparada com o custo de 2.250 € (posição atual) em vez do custo a 01/03 (3.000 € / 200 un.).

2. **A mais-valia não realizada compara datas diferentes.**
   `unrealizedGain(current, costBasis)` recebe o valor de mercado à data da valorização e o custo de hoje. Tem de ser: valor da valorização − custo da posição *à data dessa valorização*.

3. **Valorização "Atual" ignora datas futuras.**
   `latestValuation` filtra `valuationDate <= hoje`. Uma valorização com data posterior a hoje existe na lista mas nunca é escolhida como "Atual", o que explica o desalinhamento observado entre a tabela e o resumo.

## Alterações propostas

### Serviço `src/services/valuation-metrics.ts`
- Manter `latestValuation(valuations, asOf)` como está (semântica "valor a uma data"), mas acrescentar a noção de valorização mais recente registada, independentemente de ser futura, usada pela UI para marcar "Atual" e alimentar o resumo.
- Estender `unrealizedGain` para receber o custo da posição correspondente à data da valorização usada, em vez do custo atual.

### Secção `src/components/valuations/valuations-section.tsx`
- Determinar primeiro a valorização de referência (a mais recente registada).
- Calcular `positionAt(asset.type, transactions, referencia.valuationDate, { unitBased })` e usar esse resultado para: custo da posição, custo médio e quantidade apresentados junto ao valor de mercado.
- Mais-valia = valor da valorização − custo da posição nessa data.
- Mostrar explicitamente a data de referência nos três cartões, e acrescentar linhas com quantidade e custo médio à data (hoje só existe o preço unitário).
- Quando a valorização de referência tem data futura, indicar isso no rótulo para não parecer inconsistência.
- Sem valorizações: manter o fallback ao custo da posição atual, como hoje.

### Marcação "Atual" na tabela
- O badge passa a marcar a valorização de referência (mais recente registada), ficando alinhado com o resumo.

## Notas técnicas

- Nada muda no schema nem nos repositórios; toda a lógica fica nos serviços puros e na apresentação.
- `positionAt` já trunca o histórico por data (fim do dia para datas YYYY-MM-DD), pelo que uma transação no próprio dia da valorização conta para a posição.
- Os testes existentes de `position-engine` cobrem a reconstrução cronológica; acrescento casos ao cenário do exemplo (100×10, 100×20, venda 50×30) a validar custo e custo médio em três datas distintas.
