# Valuations: Derivada vs Manual

## Diagnóstico (confirmado no código)

1. **A valuation criada por NAV fica marcada como manual ao editar.**
   Em `valuation-form-dialog.tsx` o estado inicial da checkbox é
   `Boolean(valuation && valuation.unitPrice != null)` — ou seja, qualquer valuation
   com NAV abre já em modo "valor manual". Ao guardar, o total calculado é
   reenviado como se tivesse sido introduzido à mão.

2. **Não existe estado persistido de modo.** A tabela `asset_valuations` tem
   `unit_price`, `total_value`, `currency`, `source` — nada distingue derivada de
   manual. Hoje `total_value` é sempre um número congelado no momento da gravação.

3. **Não há recálculo.** `referenceValue()` devolve sempre `ref.totalValue`
   diretamente, sem consultar o Position Engine. Logo, alterar/adicionar
   Transactions (incluindo as geradas por recorrências) muda a quantidade à data
   mas não muda o valor de mercado da valuation.

Conclusão: o comportamento observado é exatamente o descrito — a valuation por NAV
comporta-se como manual porque nunca foi realmente derivada; o total foi apenas
pré-calculado uma vez.

## Modelo pretendido

Duas naturezas explícitas e persistidas:

| Modo | Input do utilizador | Valor de mercado |
|---|---|---|
| Derivada | Data + NAV | `positionAt(data).quantity × NAV`, recalculado a cada leitura |
| Manual | Data + Valor total (NAV opcional, informativo) | Congelado, tal como introduzido |

Regras:
- Ativos unitBased (Fund, ETF, Stock, Bond, Crypto, Unit Linked): defeito **Derivada**.
- Ativos de valor total (imobiliário, seguros sem UPs, etc.): sempre **Manual** — é o único modo possível.
- O modo manual só é ativado por ação explícita na checkbox; nunca inferido do facto de existir NAV.
- Editar uma valuation derivada reabre em modo derivado, com o NAV preenchido e o total mostrado como valor calculado (só leitura).

## Alterações

### 1. Base de dados (migração)
- `ALTER TABLE public.asset_valuations ADD COLUMN is_manual boolean NOT NULL DEFAULT false;`
- Backfill: `UPDATE ... SET is_manual = true WHERE unit_price IS NULL;`
  (valuations sem NAV só podem ser manuais; as que têm NAV passam a derivadas).
- `total_value` mantém-se preenchido em ambos os casos: para derivadas passa a ser
  apenas cache do último cálculo; para manuais é a fonte de verdade.

### 2. Domínio e repositório
- `AssetValuation` ganha `isManual: boolean` (mapeador em `mapping.ts`).
- `ValuationWriteInput` ganha `isManual`; `createValuation`/`updateValuation` gravam a coluna.

### 3. Serviço de métricas (`valuation-metrics.ts`)
- Nova função pura `resolveValuationValue(valuation, quantityAtDate)`:
  - `isManual === false && unitPrice != null` → `unitPrice × quantityAtDate`
  - caso contrário → `totalValue`
- `referenceValue()` e `currentValue()` passam a receber um resolvedor de quantidade
  à data (`(date) => positionAt(...).quantity`) e a devolver o valor resolvido,
  mais o campo `mode: "derived" | "manual"`.

### 4. UI
- `valuation-form-dialog.tsx`:
  - checkbox inicia a `false` para valuations derivadas (usa `valuation.isManual`, não a presença de NAV);
  - em modo derivado o campo de total desaparece e mostra-se a linha
    `Quantidade à data × NAV = valor calculado` como resultado, não como input;
  - envia `isManual` no submit; em modo derivado o NAV é obrigatório.
- `valuations-section.tsx`:
  - coluna "Valor de mercado" mostra o valor resolvido (recalculado) e um badge
    `Derivada` / `Manual` por linha;
  - cartão de resumo mostra o mesmo badge e, em derivadas, a fórmula usada;
  - a mais-valia continua a comparar com `positionAt(data).costBasis`.

### 5. Efeito prático
Como o valor derivado passa a ser calculado na leitura a partir das transações
carregadas, qualquer criação/edição/remoção de Transaction (ou geração por
recorrência) reflete-se de imediato nas valuations derivadas, sem necessidade de
reprocessamento ou jobs. As manuais mantêm-se congeladas.

## Fora de âmbito
- `assets.current_value` (cache legada usada em `portfolio-metrics.ts`) mantém-se como está.
- Conversão cambial.
