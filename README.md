# B3 Screener 🇧🇷

Screener do mercado brasileiro com coleta automatizada, análise fundamentalista e dashboard responsivo.

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

O workflow diário instala dependências pelo lockfile, executa os testes, gera os dados e só então publica alterações em `data.js` e `history/`.

Os históricos são mantidos para auditoria. Caso o volume se torne excessivo, a retenção deve ser alterada em um PR separado para evitar exclusões acidentais.

## Aviso

Os resultados são indicadores quantitativos e não constituem recomendação de investimento.

## Licença

MIT
