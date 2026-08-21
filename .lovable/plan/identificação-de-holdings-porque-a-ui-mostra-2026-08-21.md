# Identificação de holdings: porque a UI mostra "—"

## O que foi verificado (factos)

- O matcher (`src/server/securities/matcher.ts`) é o mesmo no teste e na UI; só muda a store. Não há motivo para o alterar.
- A base de dados está sã: `securities` e `security_lookups` existem, têm os índices únicos exigidos pelos upserts (`securities.figi`, `security_lookups.lookup_key`) e privilégios normais para `service_role`/`authenticated`.
- **Ambas as tabelas estão vazias (0 linhas).** O caminho da UI nunca chegou a gravar sequer o primeiro lookup — apesar de as gravações no matcher serem incrementais (lote a lote). Ou seja: a chamada real falha ou é interrompida antes do primeiro resultado do OpenFIGI, não é um problema de "matches mal associados".
- O cliente admin funciona noutros módulos (o FX escreveu ~265 mil taxas), o que exclui um problema de credenciais/ambiente.
- Defeito confirmado na UI (`src/components/assets/asset-composition-section.tsx`): `matchData?.status === "ok" ? … : undefined` mais `MatchBadge` a devolver `—` faz com que **qualquer** erro (500 do server function, timeout, erro de base de dados) apareça como um traço inofensivo. Também não é lido `isError` da query.
- Não é possível, a partir do ambiente de desenvolvimento, executar o server function autenticado contra este Supabase externo, pelo que **a causa exata da falha ainda não está confirmada**. Diagnosticá-la é o primeiro passo do plano, não um pressuposto.

Hipótese principal a confirmar (não assumida): numa cache fria, o `getAssetHoldingMatches` do BLOK percorre ~54 holdings → ~100 identificadores → ~10 lotes OpenFIGI com pausas, o que no pedido único do server function excede o tempo disponível e a resposta nunca chega — enquanto o teste corre com 180 s de timeout.

## Plano

### 1. Tornar a falha visível (pré-requisito do diagnóstico)

- O handler `getAssetHoldingMatches` passa a apanhar exceções e a devolver sempre uma forma explícita: `{ status: "error", message }`, incluindo a origem (store, OpenFIGI, ativo sem ticker).
- A UI passa a distinguir três estados: a identificar, erro (mensagem visível na secção, com botão "Tentar novamente"), e resultado. Nunca converte erro em `—`; `—` fica reservado para holdings sem identificadores.
- Registo no servidor do tempo total, nº de identificadores pendentes e nº de lotes, para se ver no log o ponto exato onde para.

### 2. Confirmar a causa

Com a mensagem de erro visível e o log, confirmar se é timeout do pedido, erro de escrita no Security Master, ou falha do OpenFIGI. Só depois aplicar a correção de integração correspondente.

### 3. Corrigir a integração (sem tocar no matcher)

Se se confirmar o timeout/pedido demasiado longo — correção prevista:

- O `getAssetHoldingMatches` deixa de fazer todo o trabalho num pedido: passa a trabalhar por orçamento de tempo. Resolve o que couber (os lotes já gravam no Security Master à medida que avançam) e devolve o que já sabe mais `pending: n`.
- A UI, enquanto houver `pending > 0`, volta a pedir automaticamente (a cache do Security Master faz cada passagem começar onde a anterior parou), mostrando "a identificar X de Y". Ao fim, fica estável e as passagens seguintes são instantâneas (leitura do Security Master, sem OpenFIGI).  
  
  
Garante que o processamento parcial não cria estados inconsistentes: cada holding só deve ser apresentada como `Identificada` depois de o respetivo resultado ter sido efetivamente persistido no Security Master, e erros/timeout não devem ser gravados como `Não identificada`.

Se o erro for de escrita/leitura no Supabase, a correção é nessa camada (`src/server/securities/store.ts`), mantendo o matcher intacto.

### 4. Associação holding → match

Passar a associar por `holdingKey` em vez do índice do array na tabela, mantendo o alinhamento correto mesmo quando o resultado é parcial.

### 5. Validação

Abrir o BLOK e confirmar o esperado: **53 identificadas, 0 ambíguas, 1 não identificada** (linha de caixa), e confirmar por consulta que `securities`/`security_lookups` deixaram de estar vazias. Segunda abertura da página deve ser imediata.

## Notas técnicas

Ficheiros tocados: `src/lib/securities.functions.ts` (tratamento de erro + orçamento de tempo/estado parcial), `src/components/assets/asset-composition-section.tsx` (estados de erro/progresso e associação por chave) e, se o diagnóstico o indicar, `src/server/securities/store.ts`. `src/server/securities/matcher.ts` não é alterado na sua lógica de decisão.