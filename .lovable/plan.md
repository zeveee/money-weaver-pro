# Integração FX (BCE via Frankfurter) e validação na UI

Estado verificado agora: o endpoint `/api/public/fx-sync` já existe e o serviço `fx.ts`/`reporting.ts` está testado, mas a tabela `exchange_rates` está **vazia (0 linhas)** e **nenhum ecrã** consome ainda a camada de reporting — todos os valores na UI são apresentados em moeda nativa.

## O que vai ser feito

### 1. Carregamento das taxas
- Backfill inicial: **2015-01-01 até hoje**, diário, base EUR, todas as moedas publicadas pelo BCE (~30, inclui USD, GBP, CHF, BRL, JPY). São ~2.900 dias úteis x ~30 moedas.
- Para evitar timeouts, o endpoint passa a partir o intervalo em blocos anuais e faz upsert bloco a bloco, devolvendo o resumo por ano.
- Sync diário posterior: apenas `latest`.

### 2. Automatização
- Job `pg_cron` diário (17:30 UTC, depois da publicação do BCE) a chamar `/api/public/fx-sync` na URL estável do projeto. O agendamento só funciona após publicar a app; até lá, o sync é feito manualmente pelo endpoint.

### 3. Camada de leitura no frontend
- Hook `useFxTable(currencies)` que carrega `exchange_rates` via o repositório existente e devolve o `FxRateTable` já indexado (cache React Query, `staleTime` longo).

### 4. UI de validação (detalhe do Ativo)
Quando `asset.currency !== portfolio.baseCurrency`, cada bloco mostra **valor nativo + valor convertido**:
- Cartão de posição: Capital Investido, Valor Atual e Mais-Valias em USD e em EUR (convertidos evento a evento pelo `reporting.ts`).
- Lista de Transações: coluna adicional com o valor em moeda de reporting e a data/valor da taxa aplicada (tooltip: taxa, data efetiva, e marca "taxa transportada" quando houve carry-forward).
- Lista de Valorizações: idem, com a taxa da data da valorização.
- Valor Atual usa a taxa mais recente disponível; o histórico usa sempre a taxa da data do evento.
- Quando não existe qualquer taxa utilizável para uma moeda, o valor convertido aparece como falha explícita ("sem taxa") e o total é assinalado como parcial — nunca é assumido 1.

Nada de rentabilidade ou XIRR nesta fase.

## Como validar

1. **Primeiro sync**: chamar `GET /api/public/fx-sync?from=2015-01-01` (posso executá-lo pelo preview após a implementação). Resposta esperada: `{ ok: true, upserted: N, dates: [...] }`.
2. **Confirmar a tabela**: consulta ao Supabase com contagem por par e min/max de data — esperado ~87.000 linhas, `EUR>USD` com datas de 2015-01-02 até ao último dia útil, `source = 'ecb'`.
3. **Validar na UI**: criar um Asset em USD numa Portfolio EUR, uma compra com data antiga e uma valorização recente; confirmar que o valor em EUR da compra corresponde à taxa EUR/USD dessa data (verificável na consulta da tabela) e não à taxa de hoje, e que o Valor Atual usa a taxa mais recente.

## Notas técnicas

- Escrita em `exchange_rates` continua reservada a admin/`service_role`; o endpoint usa o cliente privilegiado do servidor. Leitura é pública, pelo que o frontend consegue construir a tabela de taxas com a chave anónima.
- Ficheiros tocados: `src/routes/api/public/fx-sync.ts` (chunking), novo `src/hooks/use-fx-table.ts`, `src/routes/_authenticated/app.asset.$assetId.tsx`, `src/components/transactions/transactions-section.tsx`, `src/components/valuations/valuations-section.tsx`, e um formatador de par nativo/convertido em `src/lib/number-format.ts`.
- Sem alterações de schema: `exchange_rates` já tem índice único `(base_currency, quote_currency, date)` usado pelo upsert.
