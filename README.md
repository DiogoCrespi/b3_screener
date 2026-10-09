# B3 Screener 🇧🇷 + US Screener 🇺🇸

Screener do mercado brasileiro e americano com coleta automatizada, análise fundamentalista e dashboard responsivo. O seletor **🇧🇷 B3 / 🇺🇸 EUA** no topo alterna entre `index.html` e `us.html`.

## Funcionalidades

- Ações: estratégias de qualidade, dividendos, valor, crescimento, Graham e Bazin.
- FIIs, FI-Infra e Fiagros: classificação, liquidez, patrimônio, vacância e dividendos.
- ETFs e referências de renda fixa.
- Dashboard responsivo com tema claro/escuro e exportação CSV.
- Histórico diário dos resultados.

## Requisitos

- Node.js 20 ou superior.

## Instalação

```bash
npm ci
```

Use `npm install` apenas ao alterar dependências e atualizar o `package-lock.json`.

## Uso

Gere `data.js` e os arquivos de histórico:

```bash
npm run generate
```

Depois abra `index.html` no navegador. O comando `npm start` executa o dashboard de terminal e também atualiza `data.js`.

## Mercado americano

```bash
npm run generate:us
```

Gera `data-us.js` e um snapshot compacto em `history-us/`. Depois abra `us.html`.

- **Ações**: ~2.600 empresas listadas com valor de mercado acima de US$ 300M e volume médio acima de US$ 1M/dia, avaliadas pelas mesmas regras do B3 (`analyzeStock` com `{ market: 'US' }`). Os múltiplos são normalizados pela razão entre as medianas EUA/B3 antes das regras; Graham e Bazin usam os valores reais.
- **REITs**: equivalente aos FIIs. Score por spread de DY sobre o Treasury de 10 anos, P/VP, P/FCF (o FFO não está disponível gratuitamente), alavancagem e porte.
- **ETFs**: score por taxa de administração, patrimônio, liquidez e retorno de 3 anos; categorias Mercado amplo, Dividendos, Internacional, Setor/Tema, Renda fixa, Commodities e Alavancado/Inverso (sempre em revisão).
- Exibição em US$ ou R$ (cotação do dia).
- Gráfico do TradingView (widget gratuito) dentro de cada card ao abri-lo, mantendo o link para o site. O script do TradingView só é baixado no primeiro card aberto; se estiver bloqueado, o card avisa e o link continua.
- **Ranking e Top 10**: as regras sozinhas aprovavam centenas de ativos (sobretudo bancos regionais). Cada ativo recebe uma nota de convicção (0–100: score, porte e liquidez) e o selo Top Pick fica limitado aos melhores: 50 ações (máx. 8 por setor, valor de mercado ≥ US$ 2 bi), 15 REITs e 40 ETFs (≥ US$ 1 bi, taxa conhecida). Os demais que passavam nas regras viram "Observar", com o motivo. A tela inicial mostra um Top 10 por aba, com no máximo 2 por setor e sem ETFs do mesmo índice (`services/us/ranking.js`).

Fontes gratuitas, sem chave de API, com redundância em camadas:

| Dado | 1ª fonte | 2ª fonte | Última camada |
|---|---|---|---|
| Ações, REITs, ETFs | TradingView scanner (fundamentos de todos os ativos) | Nasdaq: preços do dia aplicados aos últimos fundamentos válidos (P/L, P/VP, DY recalculados) | Último dado válido, marcado como desatualizado |
| Fed Funds | FRED | NY Fed | Último valor |
| Treasury 10 anos | FRED | Treasury.gov | Último valor |
| Dólar | AwesomeAPI | open.er-api.com | Último valor |

Cada seção só é aceita de uma fonte ao vivo se atingir o volume mínimo (1.000 ações, 50 REITs, 300 ETFs). A página `us.html` mostra um aviso quando alguma reserva está em uso. O Finviz foi avaliado e descartado como reserva: a versão gratuita bloqueia após ~50 páginas, e são necessárias ~170.

## Dashboard histórico dos EUA

```bash
npm run build:history:us
```

Gera `us-history-data.js` para `history-dashboard-us.html`, a partir dos snapshots de `history-us/` e de 3 anos de preços e dividendos do Yahoo Finance (cache em `history-us/cache-yahoo-prices.json`; só tickers novos são buscados). Para caber numa página estática, acompanha um universo limitado: as 250 maiores ações, TOP_PICKs acima de US$ 10 bi, os 60 maiores REITs e os 200 maiores ETFs não alavancados, além de SPY, QQQ, VNQ, SCHD e BND. O simulador usa S&P 500 (SPY) e REITs (VNQ) como benchmarks, T-Bill (Fed Funds) como caixa e 30% de imposto retido sobre dividendos.

O dashboard (`assets/history-dashboard.js`) é o mesmo para os dois mercados; `history-dashboard-us.html` define `window.HISTORY_MARKET` com moeda, rótulos e benchmarks dos EUA.

## Dashboard histórico

Gere o artefato consolidado a partir dos snapshots:

```bash
npm run build:history
```

Depois abra `history-dashboard.html`. A página funciona localmente e no GitHub Pages, sem backend. Ela oferece gráficos de preço, DY, score, P/VP e métricas específicas, comparação normalizada entre ativos, rankings por período, mudanças de sinal, contexto de Selic/dólar, qualidade dos snapshots e exportação CSV.

Valide o artefato e a interface com:

```bash
npm run audit:history
npm run test:history-ui
```
## Testes

```bash
npm test
```

## Fontes de dados

- Fundamentus: fonte principal de ações e FIIs.
- Brapi: contingência para ações, com métricas não equivalentes explicitamente omitidas.
- Investidor10: metadados, FI-Infra, ETFs e Tesouro Direto.
- AwesomeAPI: dólar.
- Banco Central do Brasil: meta Selic.

As páginas externas podem mudar sem aviso. Requisições possuem timeout e a geração falha quando ocorre um erro não recuperável, evitando publicar uma atualização incompleta como se fosse válida.

## Automação

O workflow diário instala dependências pelo lockfile, gera os dados do B3 e dos EUA (cada coleta com até 3 tentativas espaçadas, independentes entre si) e publica `data.js`, `history/`, `data-us.js` e `history-us/`. O push é repetido com `pull --rebase` em vez de forçado. O último passo (`scripts/check-freshness.js`) deixa o run vermelho, gerando notificação do GitHub, se algum mercado não foi atualizado no dia ou se uma seção ficou em cache.

Os históricos são mantidos para auditoria. Caso o volume se torne excessivo, a retenção deve ser alterada em um PR separado para evitar exclusões acidentais.

## Aviso

Os resultados são indicadores quantitativos e não constituem recomendação de investimento.

## Licença

MIT
