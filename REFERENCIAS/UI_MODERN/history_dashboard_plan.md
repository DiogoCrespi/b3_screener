# Plano — Dashboard Histórico

## Objetivo

Criar uma página estática independente de `index.html`, compatível com abertura local e GitHub Pages, para explorar as séries produzidas por `history/*.json` sem carregar centenas de arquivos no navegador.

## Arquitetura

```text
history/*.json
      ↓ npm run build:history
scripts/build-history-data.js
      ↓ valida, normaliza e agrega
history-data.js
      ↓ window.B3_HISTORY_DATA
history-dashboard.html
      ↓
assets/history-dashboard.css + assets/history-dashboard.js
```

## Decisões

- Sem backend e sem banco de dados.
- Sem biblioteca de gráfico em CDN: SVG nativo reduz dependências, funciona em `file://` e evita indisponibilidade externa.
- Artefato columnar por ticker para reduzir repetição e tamanho.
- Data canônica extraída do nome do snapshot.
- Valores ausentes permanecem `null`; nunca são convertidos em zero.
- Snapshots de ações com menos de 100 itens e fundos com menos de 50 itens são rejeitados como incompletos.
- Séries são ordenadas e deduplicadas por data.
- ETFs ficam fora até existir histórico próprio confiável.

## Experiência da página

1. Resumo do acervo: intervalo, snapshots válidos/rejeitados, ativos e observações.
2. Seletores de classe, ticker, período e métrica.
3. KPIs do ativo: último valor, variação do período, mínimo, máximo e número de pontos.
4. Gráfico principal interativo com tooltip e comparação opcional normalizada.
5. Visões rápidas de preço, DY, score e P/VP.
6. Linha do tempo de mudanças de sinal/categoria.
7. Ranking do período: maiores altas, quedas, DY e evolução de score.
8. Painel de qualidade com snapshots rejeitados e lacunas.
9. Exportação CSV da série selecionada.
10. Link de retorno ao screener principal.

## Design

- Ventriloc: gráfico como informação principal, linha fina e laranja funcional.
- Seline Analytics: superfície clara, legibilidade e espaçamento.
- Pravah: labels técnicas, grids e bordas discretas.
- Origin Financial: modo escuro.
- Ui/Shadcn: controles previsíveis, foco e estados ativos.

## Contrato do artefato

`window.B3_HISTORY_DATA` contém:

- `meta`: versão, geração, intervalo, contagens e rejeições.
- `dates`: calendário canônico compartilhado.
- `economy`: séries de Selic e dólar por índice de data.
- `series.stock` e `series.fund`: mapas por ticker com arrays colunares.
- `fields`: ordem e significado das colunas expostas.

## Integração GitHub Pages

O workflow diário deve executar `npm run build:history` depois da geração, auditar o artefato e incluir `history-data.js` no commit automático. Todos os caminhos da página serão relativos ao repositório.

## Critérios de aceite

- Funciona por `file://` e em subdiretório do GitHub Pages.
- Não faz listagem dinâmica de diretório.
- Rejeita snapshots incompletos e informa a razão.
- Não produz `NaN`, `Infinity` ou zero artificial.
- Layout sem overflow em 320, 375, 768, 1024 e 1280 px.
- Busca, seletores, período, comparação, tooltip, rankings e CSV funcionam.
- Testes unitários do agregador e smoke Playwright passam.