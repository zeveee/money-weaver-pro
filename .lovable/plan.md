# Security Master: identificador + contexto, não identificador isolado

## 1. Como está hoje

Verificado no código atual:

- `security_lookups` tem uma chave única `lookup_key = "<idType>:<idValue>"` (ex.: `isin:IE0000XXXXX9`). É a única dimensão da memória de pesquisa.
- `matcher.ts` extrai, por holding, os identificadores utilizáveis (`holdingIdentifiers`): ISIN/CUSIP/SEDOL a partir do campo `cusip` (classificados pela forma do valor) e, por último, o ticker. **Nada mais da holding entra na chave** — nem currency, nem nome, nem exchange.
- Fluxo: constrói todas as `lookup_key`, lê `store.getLookups(...)`; o que já existe nunca mais é consultado externamente. O que falta vai ao OpenFIGI; 1 candidato distinto (por `compositeFigi`) ⇒ `identified` e persistido; >1 ⇒ `ambiguous`; 0 ⇒ `unidentified`.
- A currency só é usada como valor gravado na security (`options.currency`), nunca como critério de decisão nem de cache.
- Na resolução final, o primeiro identificador com entrada `identified` ganha, sem qualquer verificação de coerência com os atributos da holding.

## 2. O risco é real

Sim. Uma holding nova com o mesmo ISIN mas contexto diferente (outra moeda, outra linha de cotação, outro nome) é associada à security resolvida anteriormente, sem sequer voltar a olhar para os candidatos. O caso WisdomTree Europe Defense (dois fundos com o mesmo ISIN e moedas diferentes) é exatamente este cenário: o `isin:...` fica colado ao primeiro fundo resolvido e bloqueia a descoberta do segundo. Além disso, quando o OpenFIGI devolve vários candidatos, o resultado `ambiguous` também fica preso ao ISIN puro — mesmo que o contexto de uma holding concreta desambiguasse sem qualquer dúvida.

## 3. Alteração mínima proposta

A ideia central: **a memória de pesquisa passa a ser sobre candidatos, não sobre a decisão**. A decisão passa a ser função de (candidatos + contexto da holding).

### 3.1 Separar "o que a fonte devolveu" de "o que decidimos"

- `security_lookups` deixa de guardar `security_id` como verdade única e passa a guardar o conjunto de candidatos da última consulta ao OpenFIGI (`candidate_security_ids`, mais `candidate_count` já existente). Ou seja: cache do resultado da fonte externa, não da associação.
- Todos os candidatos passam a ser gravados em `securities` (o catálogo continua global e por FIGI — nada se perde, o que aparece é mais do que uma linha por ISIN quando o ISIN é mesmo partilhado).
- `status` do lookup passa a descrever a fonte (`resolved` com N candidatos / `unidentified`), não a conclusão sobre uma holding.

### 3.2 Chave de lookup mais fina (opcional, mas recomendada)

Manter `lookup_key` por identificador para efeitos de cache da fonte, e acrescentar uma segunda camada — a decisão por contexto — que **não é persistida como associação permanente**, ou é persistida com uma chave composta `idType:idValue|currency|exchange`. A opção mínima é: não persistir a decisão de todo, e recalculá-la sempre a partir dos candidatos em cache (custo zero em rede).

### 3.3 Nova etapa: seleção por contexto

Depois de obter os candidatos (cache ou OpenFIGI), o matcher aplica um scoring por holding:

```text
candidatos do ISIN  ->  filtro duro  ->  scoring  ->  decisão
```

- **Filtro duro** (elimina candidatos): currency da holding ≠ currency do candidato (quando ambas conhecidas); exchange incompatível quando a holding a declara.
- **Scoring** (ordena os sobreviventes): igualdade de ticker (+forte), semelhança do nome normalizado, `securityType`/`marketSector` coerentes com a linha, preferência por candidato cujo `figi == compositeFigi`.
- **Decisão**: exatamente 1 sobrevivente, ou um líder claro por margem mínima ⇒ `identified`; empate ⇒ `ambiguous` (nunca escolher ao acaso); 0 sobreviventes ⇒ tenta o identificador seguinte e, no fim, `unidentified`.
- Passa a registar-se em `HoldingMatch` o motivo (`matchedBy` + os atributos que desempataram), para a UI e para depuração.

### 3.4 Contexto da holding disponível

`NormalizedHolding` já traz `holdingName`, `holdingTicker`, `cusip`, `currency`. A currency por linha é o sinal mais valioso e hoje é ignorada: passa a ser passada ao matcher por holding, com fallback para a moeda base do snapshot.

## 4. Como usar cada atributo

| Atributo | Papel |
| --- | --- |
| ISIN / CUSIP / SEDOL | Reduz o universo de candidatos. Nunca conclusivo por si só. |
| Currency | Filtro duro quando conhecida dos dois lados. Foi o que falhou no WisdomTree. |
| Exchange / exchCode | Filtro duro quando a holding a declara; caso contrário, preferência suave por linha primária. |
| Ticker | Sinal forte de desempate; fraco como identificador isolado (colide entre bolsas) — mantém-se como último recurso na fase de lookup. |
| Nome | Desempate por semelhança normalizada; nunca decide sozinho. |
| securityType / marketSector | Coerência (equity vs fund vs ETP); despenaliza/elimina candidatos de classe errada. |
| compositeFIGI | Agrupa a mesma empresa em várias bolsas — continua a definir "candidatos distintos". |
| shareClassFIGI | Deteta classes/moedas diferentes do mesmo fundo: mesmo shareClassFIGI + composite diferente ⇒ é aqui que o contexto tem de decidir, não o ISIN. |

## 5. Impacto técnico

- Migração: `security_lookups` ganha `candidate_security_ids uuid[]` (ou tabela de junção `security_lookup_candidates`); `status` reinterpretado. Lookups existentes continuam válidos como cache de 1 candidato.
- `store.ts`: `saveLookup`/`getLookups` passam a lidar com N candidatos; `upsertSecurity` passa a ser chamado para todos os candidatos.
- Novo ficheiro `src/server/securities/select.ts` — função pura `selectCandidate(holding, candidates)` com testes unitários (inclui o caso WisdomTree: dois candidatos, mesmo ISIN, moedas diferentes).
- `matcher.ts`: deixa de decidir na fase de lote; passa a decidir na fase 3 (por holding), usando `select.ts`.
- UI: sem alterações obrigatórias; opcionalmente mostrar o motivo do desempate no tooltip do badge.

## 6. Fora de âmbito

Sem implementação nesta fase; sem alterações ao enriquecimento setor/país; sem alterações à ligação `assets` ↔ market data providers.
