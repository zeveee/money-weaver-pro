# Arquitetura Multi-Currency (validação, sem implementação)

## Estado atual verificado

- `portfolios.base_currency` já existe (reporting currency).
- `assets.currency`, `transactions.currency`, `asset_valuations.currency` já guardam a moeda original — nenhum dado é perdido hoje.
- A tabela `public.exchange_rates` já existe (`date`, `base_currency`, `quote_currency`, `exchange_rate numeric(20,10)`), com leitura pública e escrita admin, mas está **sem repositório e sem uso**: `src/repositories/mapping.ts` tem `toExchangeRate` e mais nada. Nenhum serviço converte moeda.
- `position-engine.ts`, `valuation-metrics.ts` e `transaction-metrics.ts` operam hoje em moeda única implícita (somam montantes sem olhar para `currency`).

Conclusão: o modelo de dados já é multi-currency-ready; falta a **camada de conversão** e a disciplina de "valor tem sempre moeda".

## Princípio central proposto

Dois planos de cálculo separados, nunca misturados:

```text
Plano 1 — moeda original (native)
  Position Engine, custo médio, quantidade, NAV, mais-valias por ativo
  → nunca converte, nunca perde a moeda de origem

Plano 2 — moeda de reporting
  Conversão evento-a-evento na data do evento, só depois agregação
  → capital investido, valor atual, ganhos, rentabilidade, XIRR da carteira
```

Regra de ouro: **converter no evento, nunca no total**. Somar em moeda nativa e converter o somatório com a taxa de hoje daria resultados errados e impediria a decomposição cambial.

## 1. Modelo de FX Rates

Manter `exchange_rates` como catálogo global, com estes ajustes:

- Normalizar tudo contra uma **moeda pivô** (EUR ou USD, escolha interna e invisível ao utilizador). Qualquer par A→B obtém-se por triangulação `A→pivô→B`. Evita explosão combinatória de pares.
- Unicidade em `(date, base_currency, quote_currency)`.
- Índice para lookup "última taxa ≤ data".
- Política de dia sem cotação (fim de semana, feriado): **last observed carry-forward** — usa-se a taxa mais recente com data ≤ data do evento. Nunca interpolação futura.
- Campo `source` para saber de onde veio a taxa (provider vs. manual).
- Taxa manual de fallback permitida por evento (ver ponto 4).

Precisão: `numeric(20,10)` já está correto; conversão só arredonda na apresentação, coerente com as regras de `ARCHITECTURE.md`.

## 2. Serviço puro de conversão

Novo serviço `src/services/fx.ts` (sem I/O, como os restantes):

- `rateAt(table, from, to, date)` — resolve direto, inverso ou triangulado via pivô; devolve também a data efetiva da taxa usada.
- `convert(money, to, date)` — recebe `{ amount, currency }`, devolve `{ amount, currency, rate, rateDate }`.
- Identidade: `from === to` → taxa 1, sem lookup.
- Falha explícita quando não há taxa: devolve estado `missing`, nunca 1 silencioso.

Introduz-se um tipo `Money = { amount: number; currency: string }` no domínio, para que nenhum número solto circule sem moeda.

## 3. Integração com Transactions

- O Position Engine mantém-se **em moeda nativa do ativo** — quantidade, custo médio, mais-valia realizada não mudam.
- Para reporting, cada transação gera um par: valor nativo + valor convertido à **taxa da data da transação**. O capital investido em moeda de reporting é a soma dos convertidos, não a conversão da soma.
- Casos onde `transaction.currency` difere de `asset.currency` (ex.: dividendo pago noutra moeda) resolvem-se em dois saltos: transação → moeda do ativo → moeda de reporting, ambos à data do evento.

## 4. Integração com Valuations

- Valuation derivada: `positionAt(data) × NAV` em moeda nativa; a conversão aplica-se ao resultado, com a **taxa da data da valuation**.
- Valuation manual: valor congelado na sua moeda; converte-se à data da valuation.
- Excepção deliberada: o **valor atual** apresentado hoje pode ser convertido à taxa mais recente disponível (é uma foto de "quanto vale agora"), enquanto o histórico usa sempre a taxa da data. Esta distinção fica explícita no serviço, não implícita.
- Se faltar taxa, a UI mostra o valor em moeda nativa com aviso, em vez de um total silenciosamente errado.

## 5. Reporting Currency

- Fonte: `portfolios.base_currency`; `profiles.base_currency` fica como preferência para vistas cross-portfolio (grupos, património global).
- Todos os agregados passam a devolver `Money` + a moeda de reporting usada + eventuais avisos de taxas em falta.
- A UI ganha, mais tarde, indicação "valores em EUR" e badge de moeda nativa por linha.

## 6. Performance cambial (preparação)

Guardando por evento o par (valor nativo, taxa aplicada), a decomposição futura sai de graça:

```text
Ganho total (reporting) = Ganho do ativo (nativo × taxa base) + Efeito cambial + Termo cruzado
```

Ou seja: calcula-se a performance em moeda nativa e a performance em moeda de reporting; a diferença é o contributo cambial. Não requer tabelas adicionais — apenas que a taxa usada em cada evento seja recuperável e determinística.

## 7. Atualização automática de taxas

Arquitetura recomendada (implementação posterior):

- Endpoint TanStack em `src/routes/api/public/fx-sync` que puxa taxas diárias contra a moeda pivô e faz upsert em `exchange_rates`.
- Agendamento por `pg_cron` a chamar esse endpoint uma vez por dia.
- Providers gratuitos candidatos: Frankfurter (BCE, sem chave), exchangerate.host, ECB XML. O serviço fica atrás de uma interface para se poder trocar de provider sem tocar nos cálculos.
- Backfill histórico à medida que aparecem transações antigas em moedas novas.
- Entrada manual continua possível para moedas exóticas.

## Ordem de implementação sugerida (depois da validação)

1. `Money` no domínio + repositório de `exchange_rates` + serviço puro `fx.ts` com testes.
2. Camada de reporting sobre Position Engine e Valuations (nativo intacto, convertido em paralelo).
3. Sync automático de taxas.
4. Só então Performance, Rentabilidade e XIRR — que já nascem multi-currency.

## Pontos que precisam da tua decisão

- Moeda pivô: EUR (decidido), alinhado com a futura API do BCE.
- Valor atual: taxa mais recente disponível (recomendado) ou estritamente a taxa da data da valuation.
- Comportamento quando falta taxa: bloquear o agregado com aviso (recomendado) ou aproximar com a taxa mais próxima anterior sem avisar.
