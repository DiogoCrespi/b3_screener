# Plano de Implementação Visual UI_MODERN

Este plano define como modernizar o visual do B3 Screener usando as referências Refero Styles sem quebrar nenhuma funcionalidade atual. Ele deve ser executado junto com o contrato de paridade descrito em `interface_catalog.md`.

## Objetivo final

Transformar `index.html` em uma interface mais moderna, com seletor de temas e cards minimizados mais bem estruturados, mantendo 100% das funcionalidades atuais:

- Dados carregados por `window.INVEST_DATA` em `data.js`.
- Abas e containers existentes.
- Busca global.
- Exportação CSV.
- Filtros de ações, FIIs e Bola de Neve.
- Cards colapsáveis e expandidos.
- Carrossel de detalhes.
- TradingView sob demanda.
- Links externos.
- Cálculos de Graham, Bazin e Bola de Neve.
- Informações atualmente exibidas nos cards minimizados.
- Informações atualmente exibidas nas gavetas expandidas.

## Referências visuais selecionadas

As páginas Refero foram catalogadas localmente em `refero_replication/README.md`.

Prioridade de uso:

1. **Ui / Shadcn**: base para cards minimizados, botões, inputs, busca e estrutura densa.
2. **Seline Analytics**: tema claro padrão, com análise limpa e ciano como cor de ação.
3. **Origin Financial**: tema escuro padrão, com aparência financeira premium.
4. **Ventriloc**: referência para gráficos e cards de dados futuros baseados em `/history`.
5. **Pravah**: referência para grids técnicos, detalhes expandidos e labels de indicadores.
6. **Caldera**: tema alternativo quente, opcional após estabilização dos temas principais.

## Princípios obrigatórios

1. Não remover dados da tela.
2. Não trocar lógica de negócio durante a mudança visual.
3. Não misturar refatoração visual com mudança de cálculo.
4. Não alterar nomes de campos vindos de `data.js`.
5. Não remover IDs usados pelo JavaScript atual.
6. Não remover `data-search-term`, `data-type` ou `data-strategies`.
7. Não criar landing page; a aplicação deve abrir direto nos dados.
8. Manter cards minimizados como padrão.
9. Tema escolhido deve persistir em `localStorage`.
10. Qualquer aba oculta hoje deve continuar existindo até decisão explícita de produto.

## Arquivos alvo

### Obrigatórios

- `index.html`: CSS, marcação base, renderização de cards e seletor de tema.
- `data.js`: somente leitura durante esta fase.
- `REFERENCIAS/UI_MODERN/interface_catalog.md`: contrato da interface atual.
- `REFERENCIAS/UI_MODERN/implementation_plan.md`: este plano.

### Possíveis novos arquivos, se a refatoração sair do HTML único

- `assets/ui-modern/themes.css`: tokens e temas.
- `assets/ui-modern/components.css`: cards, badges, tabs, filtros, busca.
- `assets/ui-modern/layout.css`: layout geral e responsividade.
- `assets/ui-modern/app-ui.js`: tema e helpers visuais.

Se o projeto continuar em HTML único, esses blocos podem ficar dentro de `<style>` e `<script>`, mas devem ser organizados por seções claras.

## Fase 0: Baseline e proteção contra regressão

### Tarefas

1. Salvar o estado atual da interface como contrato de paridade usando `interface_catalog.md`.
2. Listar todos os seletores críticos usados por JavaScript:
   - `#lastUpdate`
   - `#searchContainer`
   - `#searchInput`
   - `#searchCount`
   - `#downloadMenu`
   - `#downloadOptions`
   - `#themeBtn` ou substituto compatível
   - `#dollarVal`
   - `#selicVal`
   - `#content-stocks`
   - `#content-fiis`
   - `#content-snowball`
   - `#content-fixed`
   - `#content-etfs`
3. Listar funções globais que não podem quebrar:
   - `toggleSearch`
   - `navigateSearch`
   - `toggleDownloadMenu`
   - `downloadCSV`
   - `showTab`
   - `filterOpportunities`
   - `filterFIIs`
   - `filterSnowball`
   - `moveSlide`
   - `goToSlide`
   - `getInvestidor10Url`
4. Criar checklist manual de comparação visual e funcional.

### Critério de aceite

Antes de qualquer mudança visual, deve ser possível responder: quais componentes existem, quais dados exibem e quais funções dependem deles.

## Fase 1: Sistema de temas

### Objetivo

Substituir o toggle simples dark/light por um seletor multi-tema, sem quebrar o tema atual.

### Temas iniciais

1. `theme-origin-dark`: escuro padrão.
2. `theme-seline-light`: claro padrão.
3. `theme-ui-neutral`: neutro técnico.

Temas preparados para fase posterior:

4. `theme-ventriloc-data`.
5. `theme-pravah-technical`.
6. `theme-caldera-warm`.

### Tokens mínimos por tema

Cada tema deve definir:

- `--bg-color`
- `--surface-0`
- `--surface-1`
- `--surface-2`
- `--card-bg`
- `--card-hover`
- `--text-color`
- `--text-muted`
- `--border-color`
- `--primary`
- `--primary-hover`
- `--primary-soft`
- `--success`
- `--warning`
- `--danger`
- `--badge-bg`
- `--shadow-card`
- `--radius-card`
- `--radius-control`
- `--font-ui`
- `--font-display`

### UI do seletor

Substituir o botão `#themeBtn` por um controle compatível:

- Pode ser `<select id="themeSelector">` ou menu customizado.
- Manter um elemento `#themeBtn` ou adaptar sem quebrar referências antigas.
- Persistir o valor em `localStorage` na chave `theme` ou `b3-theme`.
- Aplicar classe no `body`, por exemplo `theme-origin-dark`.

### Critério de aceite

- Recarregar a página mantém o tema escolhido.
- Trocar tema não recarrega os dados.
- Busca, filtros, cards e gráficos continuam funcionando.
- Contraste mínimo aceitável em texto e badges.

## Fase 2: Layout global

### Objetivo

Modernizar a estrutura sem alterar a lógica de renderização.

### Tarefas

1. Ajustar `body`, `.container`, `header`, `.dashboard`, `.tabs`, `.list-container`.
2. Redesenhar o header com:
   - título;
   - data de atualização;
   - busca;
   - download;
   - seletor de tema.
3. Manter comportamento mobile-first.
4. Evitar hero, propaganda ou seções decorativas.
5. Tratar as abas ocultas:
   - FIIs e Renda Fixa permanecem renderizadas e ocultas por navegação, como hoje.
   - Opcional futuro: permitir ativação via configuração.

### Critério de aceite

- A tela inicial abre na aba Ações.
- Header não quebra em 320px, 375px, 414px, tablet e desktop.
- Botões de busca/download/tema continuam acessíveis.
- Abas visíveis continuam: Ações, Bola de Neve, ETFs.

## Fase 3: Componentes globais

### Componentes

- Botões de ícone.
- Botões de filtro (`.filter-btn`).
- Abas (`.tab-btn`).
- Badges.
- Inputs.
- Dropdown/menu.
- Cards de métrica macro.
- Search overlay/container.
- Download menu.

### Diretriz visual

- Base Ui / Shadcn para densidade e previsibilidade.
- Seline para tema claro.
- Origin para tema escuro.
- Evitar gradientes decorativos fortes.
- Badges de risco podem manter cor funcional: danger, warning, success.

### Critério de aceite

- Todos os controles têm hover/focus claro.
- Nenhum botão muda layout ao receber estado ativo.
- Badges não estouram o card no mobile.

## Fase 4: Card minimizado de Ações

### Informações obrigatórias

O card minimizado de ação deve continuar exibindo:

- Logo.
- Ticker.
- Badge de volatilidade, quando aplicável.
- Badge de turnaround ou risco financeiro, quando aplicável.
- Badge de `risk_level`.
- Graham compacto.
- Bazin compacto.
- Cotação atual.
- DY.
- P/VP.
- Score exibido conforme tipo de seção.

### Estrutura recomendada

- Coluna esquerda: logo + ticker + badges.
- Linha secundária: Graham e Bazin.
- Coluna direita: preço, DY, P/VP e score.
- Score em bloco fixo de largura estável.
- Badges com quebra controlada.

### Não fazer

- Não esconder Graham/Bazin atrás de tooltip.
- Não remover badges de risco.
- Não trocar score por ícone sem número.
- Não transformar o card inteiro em tabela densa demais.

### Critério de aceite

Comparar 10 cards de cada seção: STARS RENDA, STARS CRESCIMENTO, STARS VALOR, OPORTUNIDADES e EM ANÁLISE/RISCO. Nenhuma informação atual pode desaparecer.

## Fase 5: Card expandido de Ações

### Manter

- Carrossel de 2 slides.
- Grid técnico completo.
- TradingView sob demanda.
- Links Investidor 10, TradingView e Investing.
- Datas `data_com` e `data_pagamento`.
- Pilares.
- Setas de tendência.

### Melhorias visuais

- Usar estilo Pravah para grids técnicos: linhas finas, labels consistentes, valores alinhados.
- Controlar altura do gráfico.
- Melhorar espaçamento entre grid, datas e links.
- Evitar nested cards excessivos.

### Critério de aceite

Expandir pelo menos 5 ações e alternar slides. O card não deve fechar ao clicar nas setas do carrossel.

## Fase 6: Aba Bola de Neve

### Informações obrigatórias do card minimizado

- Ranking no Top 10.
- Logo.
- Ticker.
- Badge de tipo.
- Texto `Com X cotas, o dividendo paga +1 cota` ou aviso sem distribuição.
- VP estimado.
- Bazin estimado ou `N/A`.
- Preço.
- DY.
- Rendimento mensal por cota.

### Informações obrigatórias do expandido

- Investimento Total Meta.
- Renda Anual Meta.
- Renda Mensal Meta.
- Último Rendimento.
- Liquidez Diária.
- P/VP.
- FFO Yield, Cap Rate, Vacância, Imóveis, Valor de Mercado quando existirem.
- Datas de provento.
- TradingView.
- Links externos.
- Slide de Central de Notícias reservado.

### Critério de aceite

- Filtros `Ver Todos`, `Tijolo`, `Papel`, `Agro`, `Multi`, `Infra`, `Base 10` funcionam.
- Top 10 continua ordenado por score e DY.
- Seções por faixa de preço continuam corretas.

## Fase 7: FIIs e Renda Fixa ocultos

### Objetivo

Melhorar visual desses containers sem alterar sua condição de ocultos na navegação.

### FIIs

Manter:

- Filtros por tipo e Renda Segura.
- Cabeçalhos por grupo.
- Badges de tipo, exposição e risco.
- Segmento, preço, DY, P/VP e score.
- Grid expandido completo.

### Renda Fixa

Manter:

- Tesouro Direto.
- Nome, vencimento, taxa e investimento mínimo.

Decisão opcional:

- Exibir preço unitário, que já existe nos dados, somente se marcado como melhoria explícita. Para não quebrar paridade, esta mudança deve ser feita em etapa separada.

### Critério de aceite

Mesmo ocultas, as abas devem renderizar quando `showTab('fiis')` ou `showTab('fixed')` for chamado no console.

## Fase 8: ETFs e Benchmarks

### Manter

- Benchmarks privados no topo da aba ETFs.
- Cards de ETFs com logo, ticker, preço e DY.
- Expandido com liquidez, variação 12m, mínima 52s, máxima 52s, TradingView e Investidor 10.

### Critério de aceite

A aba ETFs continua visível e abre sem depender da aba Renda Fixa.

## Fase 9: Histórico e gráficos futuros

### Nesta implementação

Apenas preparar documentação e pontos de extensão. Não implementar gráficos baseados em `/history` ainda, para não misturar mudança visual com feature nova.

### Futuro planejado

Usar `/history` para gerar:

- Sparkline de preço por ativo.
- Histórico de DY.
- Evolução de score.
- Mudança de categoria.
- Comparação de ativo contra Selic/CDI.

### Fonte visual

Usar Ventriloc como base:

- Linha fina.
- Pouca cor.
- Laranja ou cor primária apenas para destaque funcional.
- Gráfico como dado real, não decoração.

## Fase 10: QA funcional

### Checklist manual obrigatório

1. Página carrega com `data.js`.
2. `lastUpdate`, dólar e Selic aparecem.
3. Tema persiste após reload.
4. Busca abre, busca ticker e navega resultados.
5. Busca pula para aba correta quando resultado está em outra aba visível.
6. Download CSV funciona para ações, FIIs e ETFs.
7. Filtros de oportunidades funcionam.
8. Filtros de Bola de Neve funcionam.
9. Cards expandem e recolhem.
10. Carrossel avança e volta.
11. TradingView renderiza ao expandir.
12. Links externos continuam corretos.
13. Layout funciona em mobile estreito.
14. Nenhum texto importante fica sobreposto.
15. Nenhum card muda de tamanho de forma brusca ao aplicar hover/focus.

### Testes técnicos sugeridos

- Rodar testes existentes do projeto: `npm test`.
- Criar script opcional de smoke DOM com Playwright se o projeto passar a ter servidor local.
- Validar que `downloadCSV` ainda encontra os arrays corretos.
- Validar que todos os cards renderizados possuem `data-search-term`.

## Fase 11: Ordem prática de implementação

### Passo 1: Preparar CSS de tokens

- Criar classes de tema.
- Mapear variáveis antigas para novas.
- Manter aliases compatíveis (`--bg-color`, `--card-bg`, `--text-color`, etc.).

### Passo 2: Implementar seletor de tema

- Adicionar controle no header.
- Persistir em localStorage.
- Remover dependência exclusiva de `light-mode`.
- Manter fallback para usuários com tema salvo antigo.

### Passo 3: Atualizar layout global

- Header.
- Dashboard.
- Tabs.
- Containers.
- Busca e download.

### Passo 4: Redesenhar card minimizado de Ações

- Só mexer no HTML retornado por `renderStockCard` e CSS relacionado.
- Não alterar os filtros.
- Não alterar cálculos.

### Passo 5: Redesenhar expandido de Ações

- Melhorar grids e espaçamentos.
- Preservar IDs de chart e track.

### Passo 6: Redesenhar Bola de Neve

- Atualizar cards Top 10 e seções por faixa.
- Preservar cálculos de `monthlyDiv`, `magicNumber`, `totalInvest`, `totalMonthly`.

### Passo 7: Redesenhar ETFs, FIIs ocultos e Renda Fixa oculta

- Aplicar componentes globais.
- Manter comportamento atual de visibilidade.

### Passo 8: Revisão de responsividade

- 320px.
- 375px.
- 414px.
- 768px.
- 1024px.
- Desktop largo.

### Passo 9: QA final

- Executar checklist funcional.
- Registrar qualquer diferença intencional.
- Atualizar `interface_catalog.md` se uma mudança visual aprovada alterar a interface.

## Critério de conclusão do projeto visual

A implementação só deve ser considerada completa quando:

- O usuário consegue escolher tema.
- O tema persiste.
- O visual dos cards minimizados foi modernizado.
- Nenhuma informação atualmente exibida foi removida.
- Todas as abas/containers continuam renderizando.
- Todos os filtros continuam funcionando.
- Busca global continua funcionando.
- CSV continua funcionando.
- Cards expandidos, carrossel e TradingView continuam funcionando.
- O layout foi conferido em mobile e desktop.
- `interface_catalog.md` e este plano estão atualizados com qualquer decisão tomada durante a execução.

## Backlog controlado pós-implementação

Estes itens devem ficar para depois da primeira entrega visual:

- Gráficos próprios usando `/history`.
- Ativar FIIs e Renda Fixa como abas visíveis.
- Exibir preço unitário do Tesouro.
- Criar tela de preferências avançadas.
- Criar comparação histórica de ativos.
- Separar `index.html` em arquivos CSS/JS menores.
- Migrar renderização para framework.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Perder informação nos cards | Usar `interface_catalog.md` como checklist por card |
| Quebrar busca | Preservar `data-search-term` em todos os cards |
| Quebrar filtros | Preservar `data-type`, `data-strategies` e funções globais |
| Quebrar TradingView | Manter IDs `chart-{ticker}` e renderização sob demanda |
| Tema antigo salvo causar erro | Criar fallback para tema desconhecido |
| Mobile estourar badges | Definir slots, wraps e larguras máximas |
| Misturar feature nova com redesign | Gráficos de `/history` ficam só catalogados nesta fase |

## Checklist de paridade por tipo de card

### Ações minimizado

- [x] Logo
- [x] Ticker
- [x] Volatilidade
- [x] Turnaround
- [x] Risco financeiro
- [x] Risco geral
- [x] Graham
- [x] Bazin
- [x] Cotação
- [x] DY
- [x] P/VP
- [x] Score

### Ações expandido

- [x] Slide 1 completo
- [x] Slide 2 completo
- [x] Datas de provento
- [x] Pilares
- [x] TradingView
- [x] Links externos

### Bola de Neve minimizado

- [x] Ranking quando Top 10
- [x] Logo
- [x] Ticker
- [x] Badge de tipo
- [x] Magic number
- [x] VP
- [x] Bazin
- [x] Preço
- [x] DY
- [x] Rendimento mensal por cota

### Bola de Neve expandido

- [x] Meta de investimento
- [x] Renda anual
- [x] Renda mensal
- [x] Último rendimento
- [x] Liquidez
- [x] P/VP
- [x] Métricas opcionais disponíveis
- [x] Datas
- [x] TradingView
- [x] Links
- [x] Central de Notícias

### ETFs

- [x] Benchmarks no topo
- [x] Logo
- [x] Ticker
- [x] Preço
- [x] DY
- [x] Liquidez
- [x] Variação 12m
- [x] Min/Max 52s
- [x] TradingView
- [x] Investidor 10

---

## Progresso de Implementação

### 2026-07-11 — Fase 1: Sistema de temas

Status: concluído.

Implementado em `index.html`:

- Criadas classes de tema `theme-origin-dark`, `theme-seline-light` e `theme-ui-neutral`.
- Mantidos aliases de variáveis existentes, como `--bg-color`, `--card-bg`, `--text-color`, `--primary`, `--accent` e `--card-gradient`.
- Adicionados tokens mínimos planejados: `--surface-*`, `--primary-hover`, `--primary-soft`, `--badge-bg`, `--shadow-card`, `--radius-card`, `--radius-control`, `--font-ui` e `--font-display`.
- Substituído o botão de tema por `<select id="themeBtn">` com três opções.
- Criadas funções `normalizeTheme(theme)` e `setTheme(theme)`.
- Mantida função `toggleTheme()` para compatibilidade, agora alternando ciclicamente entre os temas.
- Adicionado fallback para valores legados `light` e `dark`.
- Persistência mantida em `localStorage.theme` e duplicada em `localStorage.b3-theme`.

Validações executadas:

- Parser do JavaScript inline: aprovado.
- Smoke test específico do seletor de temas: aprovado para `theme-origin-dark`, `theme-seline-light`, `theme-ui-neutral`.
- `npm test`: aprovado fora do sandbox após `spawn EPERM` no sandbox. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- Nenhuma lógica de dados, filtros, busca, CSV, cards, carrossel ou TradingView foi alterada nesta fase.
- O visual dos cards ainda não foi reestruturado; isso começa nas fases seguintes.

### 2026-07-11 — Fase 2: Layout global

Status: concluído.

Implementado em `index.html`:

- `body` recebeu altura mínima de viewport, renderização tipográfica otimizada e uso consistente de `--font-ui`.
- `header` passou a ser `sticky`, com blur de fundo, borda inferior fina e espaçamento responsivo.
- `header`, `.header-content` e `.header-actions` foram ajustados para evitar quebra ruim em mobile.
- `.container` passou a usar `width: min(100% - 2rem, 1200px)` para manter margens seguras.
- `.dashboard` passou de flex para grid responsivo: 2 colunas no desktop, 1 coluna em telas até 720px.
- `.tabs` passou para grid de 3 colunas no desktop e 1 coluna no mobile, preservando as abas visíveis atuais.
- `.list-container` passou a usar `minmax(min(100%, 320px), 1fr)` para evitar overflow em telas estreitas.
- Busca, menu de download, botões de ação e seletor de tema foram mantidos acessíveis no header responsivo.
- Menus globais foram alinhados aos tokens `--radius-card`, `--radius-control` e `--shadow-card`.

Validações executadas:

- Smoke test estrutural da Fase 2: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Limitação de validação visual:

- Playwright não está instalado no projeto, então não foi possível gerar screenshots headless sem adicionar dependências novas.

Observações:

- Nenhum ID, função global, filtro, busca, CSV, renderização de card, carrossel ou TradingView foi removido ou renomeado.
- FIIs e Renda Fixa continuam como containers existentes com botões ocultos, conforme contrato atual.
- O redesenho visual dos cards minimizados ainda não foi iniciado; permanece reservado para as próximas fases.

### 2026-07-11 — Fase 3: Componentes globais

Status: concluído.

Implementado em `index.html`:

- Adicionada camada CSS `Phase 3: Global component polish` no fim do `<style>` para reduzir risco de regressão.
- Padronizado `box-sizing: border-box` global.
- Adicionados estados `:focus-visible` para `button`, `select`, `input` e `a`.
- Polidos `.theme-select`, `.btn-icon`, `.tab-btn`, `.filter-btn`, `.badge`, `.price-badge`, `.metric-card`, `.download-options`, `.search-container`, `.search-input`, `.search-btn` e `.external-link-btn`.
- Mantidos IDs, funções globais, atributos `data-*`, renderização de cards e lógica de filtros sem alteração.
- Adicionado ajuste mobile para filtros e busca em telas até 480px.

Implementado em testes:

- Criado `scripts/playwright-smoke.js` para validar a UI renderizada em desktop e mobile.
- Adicionado script `npm run test:ui` no `package.json`.
- O smoke test valida carregamento de cards, `lastUpdate`, dólar, Selic, abas visíveis, troca de tema, busca, navegação para ETFs, ausência de overflow horizontal e erros de console relevantes.

Validações executadas:

- Smoke estático da Fase 3: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- Playwright direto: aprovado em desktop 1280x900 e mobile 375x812, sem erros relevantes e sem overflow horizontal.
- `npm run test:ui`: aprovado.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- O Playwright precisa rodar fora do sandbox neste ambiente porque o Chromium falha com `spawn EPERM` dentro do sandbox.
- Nenhum conteúdo de card minimizado/expandido foi removido ou redesenhado nesta fase; a reestruturação dos cards começa na próxima fase.

### 2026-07-11 — Fase 4: Card minimizado de Ações

Status: concluído.

Implementado em `index.html`:

- Cards de ações agora recebem a classe adicional `.stock-equity`.
- O estado minimizado de ações foi reorganizado com:
  - `.equity-card-main`
  - `.equity-card-identity`
  - `.equity-card-title-row`
  - `.equity-ticker-stack`
  - `.equity-badges`
  - `.valuation-strip`
  - `.equity-card-metrics`
  - `.equity-price-block`
  - `.equity-metric-badges`
- Foram preservados no card minimizado:
  - logo;
  - ticker;
  - badges de volatilidade, turnaround, risco financeiro e risco geral;
  - Graham;
  - Bazin;
  - cotação;
  - DY;
  - P/VP;
  - score.
- O conteúdo expandido, carrossel, TradingView, links externos e grids técnicos não foram alterados.
- FIIs, ETFs, Renda Fixa e Bola de Neve não receberam a estrutura `.stock-equity`.

Validações executadas:

- Smoke estático da Fase 4: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm run test:ui`: aprovado em desktop 1280x900 e mobile 375x812.
  - Validou que existe card `.stock-equity`.
  - Validou que o card minimizado contém `Graham:`, `Bazin:`, `R$`, `DY` e `P/VP`.
  - Validou ausência de overflow horizontal e erros relevantes de console.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- Durante a implementação, uma primeira substituição por regex foi revertida porque alcançou templates além de Ações. O `index.html` foi recomposto com overrides de fases 1-4 e a troca final foi reaplicada apenas dentro de `renderStockCard`.
- A próxima fase deve tratar o card expandido de Ações, mantendo o contrato do catálogo.

### 2026-07-11 — Fase 5: Card expandido de Ações

Status: concluído.

Implementado em `index.html`:

- Adicionada camada CSS `Phase 5: Expanded stock card details`.
- Escopo limitado a `.stock-card.stock-equity`, sem alterar FIIs, ETFs, Bola de Neve ou Renda Fixa.
- Melhorados grids técnicos, caixas de detalhe, labels/values, container de gráfico, links externos, controles de carrossel e quebra mobile.
- Preservados: carrossel de 2 slides, P/L, ROE, Graham Price, Bazin Price, Upside Graham, PSR, `data_com`, `data_pagamento`, PEG, ROIC, Payout, pilares, TradingView, links externos e métricas do slide 2.

Implementado em testes:

- `scripts/playwright-smoke.js` agora expande 5 cards de ações.
- O smoke test valida conteúdo expandido obrigatório, alterna o carrossel e confirma que o card permanece expandido após clicar em próximo.

Validações executadas:

- Smoke estático da Fase 5: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm run test:ui`: aprovado em desktop 1280x900 e mobile 375x812.
  - Validou 725 cards renderizados.
  - Validou 256 cards `.stock-equity`.
  - Validou 5 cards de ações expandidos.
  - Validou conteúdo expandido obrigatório.
  - Validou troca de slide do carrossel sem recolher o card.
  - Validou ausência de overflow horizontal e erros relevantes de console.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- O Playwright precisa rodar fora do sandbox neste ambiente porque o Chromium falha com `spawn EPERM` dentro do sandbox.
- Nenhum conteúdo expandido foi removido; a alteração foi uma camada visual sobre a estrutura existente.

### 2026-07-11 — Fase 6: Aba Bola de Neve

Status: concluído.

Implementado em `index.html`:

- Cards da aba Bola de Neve agora recebem a classe adicional `.snowball-card`.
- Adicionada camada CSS `Phase 6: Snowball tab cards`.
- Escopo visual limitado a `.stock-card.snowball-card`, sem alterar Ações, FIIs, ETFs ou Renda Fixa.
- Melhorado o layout minimizado com espaçamento estável, quebra controlada de ticker/badges/texto e métricas alinhadas.
- Melhorado o expandido com grids técnicos, caixas de detalhe, labels/values, container de gráfico, links externos, controles de carrossel e estado mobile.
- Preservados cálculos de `monthlyDiv`, `magicNumber`, `totalInvest` e `totalMonthly`.
- Preservados filtros `Ver Todos`, `Tijolo`, `Papel`, `Fiagro/Agro`, `Multimercado`, `Infra` e `Base 10`.
- Preservadas seções Top 10, Base R$ 10, Base R$ 20 - R$ 50, Base R$ 100+ e Destaques para Agro/Infra quando filtrado.
- Preservados TradingView, links externos e slide reservado de Central de Notícias.

Implementado em testes:

- `scripts/playwright-smoke.js` agora valida a aba Bola de Neve em desktop e mobile.
- O smoke test valida filtros exibidos, cards `.snowball-card`, dados obrigatórios do minimizado, filtro Base 10, filtro Fiagro/Agro, expansão de 5 cards, conteúdo expandido obrigatório e alternância de carrossel sem recolher o card.

Validações executadas:

- Smoke estático da Fase 6: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm run test:ui`: aprovado em desktop 1280x900 e mobile 375x812.
  - Validou 725 cards renderizados.
  - Validou 199 cards `.snowball-card` na aba Bola de Neve.
  - Validou filtros: `Ver Todos`, `Tijolo`, `Papel`, `Fiagro/Agro`, `Multimercado`, `Infra`, `Base 10`.
  - Validou 154 cards no filtro Base 10 e cabeçalho Base R$ 10.
  - Validou 36 cards no filtro Fiagro/Agro.
  - Validou 5 cards Bola de Neve expandidos em desktop e mobile.
  - Validou conteúdo expandido obrigatório e troca de slide do carrossel.
  - Validou ausência de overflow horizontal e erros relevantes de console.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- O Playwright precisa rodar fora do sandbox neste ambiente porque o Chromium falha com `spawn EPERM` dentro do sandbox.
- O clique mobile do smoke para expansão em lote usa acionamento via DOM para evitar instabilidade causada pelo deslocamento dos cards já expandidos; os handlers reais da interface continuam sendo os mesmos.
- Nenhum campo, cálculo, filtro ou link da aba Bola de Neve foi removido.

### 2026-07-11 — Fase 7: FIIs e Renda Fixa ocultos

Status: concluído.

Implementado em `index.html`:

- Adicionada camada CSS `Phase 7: Hidden FIIs and fixed income tabs`.
- O visual de FIIs foi escopado por `#content-fiis .stock-card.fii`, evitando afetar ETFs que reutilizam `.stock-card.fii`.
- Cabeçalhos `.group-header` de FIIs receberam tratamento visual de seção sem alterar `data-type` ou a lógica de filtro.
- Cards de FIIs preservam logo, ticker, badges de tipo/exposição/risco, segmento, preço, DY, P/VP e score.
- Expandido de FIIs preserva pilares, FFO Yield, Cap Rate, Vacância, Imóveis, Liquidez Diária, Valor de Mercado, datas de provento, TradingView e Investidor 10.
- Cards de Tesouro Direto receberam a classe adicional `.fixed-income-card`.
- O visual de Renda Fixa foi escopado por `#content-fixed .fixed-income-card`.
- Cards de Tesouro Direto preservam nome, vencimento, taxa e investimento mínimo.
- O preço unitário do Tesouro (`price`) continua não exibido para manter paridade com a interface atual.
- Os botões de FIIs e Renda Fixa continuam ocultos na navegação.

Implementado em testes:

- `scripts/playwright-smoke.js` agora valida `showTab('fiis')` e `showTab('fixed')` em desktop e mobile.
- O smoke test valida cards de FIIs, filtros visíveis, filtro Tijolo com itens, presença do filtro Renda Segura, expansão de FII, conteúdo expandido obrigatório, cards de Tesouro, conteúdo obrigatório de Renda Fixa e que os botões FIIs/Renda Fixa permanecem ocultos.
- A expansão em lote de Ações passou a usar acionamento via DOM no smoke para evitar instabilidade mobile causada por deslocamento de layout após abrir cards.

Validações executadas:

- Smoke estático da Fase 7: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm run test:ui`: aprovado em desktop 1280x900 e mobile 375x812.
  - Validou 725 cards renderizados.
  - Validou 189 cards FII na aba oculta `#content-fiis`.
  - Validou filtros FIIs: `Ver Todos`, `Tijolo`, `Papel`, `Fiagro/Agro`, `Multimercado`, `Infra`, `Renda Segura`.
  - Validou 57 cards no filtro Tijolo.
  - Validou expansão de FII e conteúdo expandido obrigatório.
  - Validou 37 cards de Tesouro em `#content-fixed`.
  - Validou que FIIs e Renda Fixa continuam ocultos como botões de navegação.
  - Validou ausência de overflow horizontal e erros relevantes de console.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- O Playwright precisa rodar fora do sandbox neste ambiente porque o Chromium falha com `spawn EPERM` dentro do sandbox.
- No snapshot atual, o filtro `Renda Segura` existe, mas não foi usado como critério de contagem porque pode retornar 0 itens conforme os dados.
- Nenhum campo, cálculo, filtro, link ou gráfico de FIIs foi removido.
- Nenhum campo novo foi exibido em Renda Fixa; preço unitário permanece reservado para decisão futura explícita.

### 2026-07-11 — Fase 8: ETFs e Benchmarks

Status: concluído.

Implementado em `index.html`:

- Adicionada camada CSS `Phase 8: ETFs and benchmarks tab`.
- Benchmarks privados agora recebem a classe adicional `.benchmark-card`.
- ETFs agora recebem a classe adicional `.etf-card`, mantendo `.stock-card.fii` por compatibilidade com a estrutura existente.
- O visual foi escopado por `#content-etfs .benchmark-card` e `#content-etfs .etf-card`.
- Benchmarks privados continuam no topo da aba ETFs e não foram movidos para Renda Fixa.
- Cards minimizados de ETFs preservam logo, ticker, texto `ETF de Renda Variável`, preço e DY/N/A.
- Cards expandidos de ETFs preservam liquidez diária, variação 12 meses, mínima 52 semanas, máxima 52 semanas, TradingView e Investidor 10.
- A aba ETFs continua visível na navegação e independente da aba Renda Fixa.

Implementado em testes:

- `scripts/playwright-smoke.js` agora valida benchmarks e ETFs em desktop e mobile.
- O smoke test valida 4 benchmarks, 40 ETFs, dados obrigatórios do benchmark, dados obrigatórios do card minimizado de ETF, expansão de ETF e conteúdo expandido obrigatório.

Validações executadas:

- Smoke estático da Fase 8: aprovado.
- Parser do JavaScript inline: aprovado.
- Checagem simples de balanceamento de chaves CSS: aprovada.
- `npm run test:ui`: aprovado em desktop 1280x900 e mobile 375x812.
  - Validou 725 cards renderizados.
  - Validou que a aba ETFs permanece visível.
  - Validou 4 cards `.benchmark-card`.
  - Validou 40 cards `.etf-card`.
  - Validou conteúdo minimizado obrigatório dos ETFs.
  - Validou expansão de ETF e conteúdo expandido obrigatório.
  - Validou ausência de overflow horizontal e erros relevantes de console.
- `npm test`: aprovado. Resultado final: 104 testes passaram, 0 falhas.

Observações:

- O Playwright precisa rodar fora do sandbox neste ambiente porque o Chromium falha com `spawn EPERM` dentro do sandbox.
- `.stock-card.fii` foi mantida nos ETFs para compatibilidade, mas o visual novo da Fase 8 usa `.etf-card` para evitar conflito com FIIs ocultos.
- Nenhum campo, gráfico, link, benchmark ou comportamento da aba ETFs foi removido.

### 2026-07-12 — Fase 9: Histórico e gráficos futuros

Status: concluído no escopo preparatório definido pelo plano.

Implementado em `index.html`:

- Criado o contrato global, imutável e versionado `window.B3_HISTORY_EXTENSION`.
- Documentados no contrato o diretório `history/`, os padrões de arquivo de ações e fundos, os tipos de ativo previstos e as métricas candidatas.
- Criada a função interna `registerHistoryExtensionPoint(card, assetType, ticker)`.
- Cards expansíveis de Ações, FIIs, Bola de Neve e ETFs recebem identidade histórica por `data-history-asset-type` e `data-history-ticker`.
- Cada card expansível recebe um mount inerte `[data-history-mount]`, inicialmente com `hidden`, `aria-hidden="true"` e `data-history-status="not-loaded"`.
- Nenhum snapshot é buscado e nenhum gráfico histórico é renderizado nesta fase, conforme a restrição original de não misturar redesign com feature nova.
- TradingView, cálculos, filtros, busca, CSV, cards e carrosséis permanecem inalterados.

Contrato para implementação futura:

- Ações: `cotacao`, `dividend_yield`, `overall_score`, `category`.
- Fundos: `price`, `dy`, `overall_score`, `category`.
- ETFs: `price`, `dy`; o histórico atual não possui snapshots próprios de ETF, portanto será necessário definir uma fonte antes da implementação.
- O consumidor futuro deve descobrir os mounts por `window.B3_HISTORY_EXTENSION.mountSelector`, carregar dados sob demanda e somente remover `hidden` após possuir uma série válida.
- Snapshots devem ser ordenados pela data do nome do arquivo, não pelo timestamp do sistema de arquivos.
- Valores ausentes não podem ser convertidos em zero; pontos inválidos devem ser descartados ou representados como lacunas.

Riscos identificados no acervo atual:

- Existem snapshots anormalmente pequenos e aparentemente incompletos em datas anteriores; tamanho ou contagem mínima deve ser validado antes de compor séries.
- A estrutura de `history/` é arquivo por data e por classe, inadequada para centenas de requisições diretas no navegador; a fase futura deve gerar um índice/artefato agregado durante o pipeline.
- O dashboard abre por `file://`; descoberta dinâmica de diretório não é suportada no navegador. Um manifesto gerado, por exemplo `history/index.json` ou `history-data.js`, será necessário.
- Comparação contra Selic/CDI exige preservar a série econômica por snapshot e definir tratamento para datas sem pregão.

Implementado em testes:

- `scripts/playwright-smoke.js` valida a versão 1 do contrato.
- Valida que há mounts históricos nos cards expansíveis.
- Valida que nenhum mount histórico fica visível na fase preparatória.

Critério de aceite da Fase 9:

- [x] Documentação e contrato de extensão definidos.
- [x] Pontos de montagem preparados sem alteração visual.
- [x] Nenhum gráfico baseado em `/history` implementado prematuramente.
- [x] Limitações e requisitos da fase futura registrados.
Revisão de robustez em 2026-07-12:

- O smoke test passou a exigir que todo card expansível possua exatamente um ponto histórico registrado.
- O contrato e suas coleções estruturais são verificados como imutáveis com `Object.isFrozen`.
- Os atributos de tipo e ticker do mount são comparados com os atributos do card pai.
- O estado inerte é validado por `hidden`, `aria-hidden="true"` e `data-history-status="not-loaded"`.
- A cobertura precisa incluir `stock`, `fund` e `etf`; ausência de qualquer tipo reprova o teste.
Validação final da revisão da Fase 9 em 2026-07-12:

- `node --check`: aprovado para o smoke test e entry points verificados.
- `npm test`: 104 testes aprovados, 0 falhas.
- `npm run audit:data`: aprovado com 235 ações e 189 fundos.
- `npm run test:ui`: aprovado em 1280x900 e 375x812, sem erros relevantes de console e sem overflow horizontal.
- Auditoria histórica: 684 cards expansíveis, 684 cards registrados, 684 mounts, 0 mounts inválidos e 0 mounts visíveis.
- Distribuição dos mounts: 256 `stock`, 388 `fund` (FIIs e Bola de Neve) e 40 `etf`.
- `git diff --check`: aprovado; resta apenas o aviso conhecido de futura normalização LF para CRLF em `index.html` no Windows.
- Mensagens de erro/warning observadas no teste unitário pertencem a casos negativos deliberados (falha de adapters e entrada Selic inválida) e as respectivas asserções passaram.
### 2026-07-12 — Fase 10: QA funcional

Status: concluído.

Automação ampliada em `scripts/playwright-smoke.js`:

- Matriz responsiva executada em 320x720, 375x812, 414x896, 768x1024, 1024x768 e 1280x900.
- Validado carregamento de `window.INVEST_DATA`, atualização, dólar e Selic.
- Validada persistência de tema após `page.reload()`.
- Validada busca, navegação entre resultados e troca automática para a aba ETFs.
- Validados os três fluxos CSV: ações, FIIs e ETFs, incluindo nome de arquivo com data.
- Validado filtro de oportunidades por `data-id` e os filtros já existentes de FIIs e Bola de Neve.
- Validada expansão e retração de card, carrossel avançando e retornando e permanência do card aberto durante a navegação.
- Validada solicitação do widget TradingView ao expandir.
- Validados links externos HTTPS com `target="_blank"`.
- Validado que todos os 725 cards possuem `data-search-term`.
- Validada estabilidade dimensional do card no hover e ausência de overflow horizontal.
- Mantida a auditoria da Fase 9 para os 684 mounts históricos.

Resultados finais:

- `node --check`: aprovado para `scripts/playwright-smoke.js`, `export_data.js` e `index.js`.
- `npm test`: 104 testes aprovados, 0 falhas.
- `npm run audit:data`: aprovado com 235 ações e 189 fundos.
- `npm run test:ui`: aprovado nos seis viewports, sem erros relevantes de console.
- `git diff --check`: aprovado; apenas aviso de futura normalização LF para CRLF em `index.html` no Windows.
- Varredura final: nenhum `TODO`, `FIXME` ou `HACK` encontrado. Chamadas `console.warn`/`console.error` permanecem nos caminhos operacionais de fallback e tratamento de falha; `process.exit(1)` permanece no smoke test para sinalizar reprovação ao CI. Nenhuma dessas ocorrências foi introduzida como warning não tratado da Fase 10.

Erros e warnings avaliados:

- A primeira execução ampliada identificou um seletor de teste dependente do texto `Ver Todos`; corrigido para os identificadores estáveis `data-id="QUALITY"` e `data-id="ALL"`.
- A segunda execução identificou retargeting do locator `.expanded` após o card recolher; a asserção foi corrigida para verificar o mesmo elemento no callback do clique.
- Uma execução do Chromium dentro do sandbox falhou com `spawn EPERM`; a execução autorizada fora do sandbox passou.
- Logs de falha de adapters, transformação inválida e Selic inválida em `npm test` pertencem a cenários negativos deliberados e suas asserções passaram.

Checklist da Fase 10:

- [x] Página e indicadores macro carregam.
- [x] Tema persiste após reload.
- [x] Busca e navegação entre abas funcionam.
- [x] CSV funciona para ações, FIIs e ETFs.
- [x] Filtros de oportunidades, FIIs e Bola de Neve funcionam.
- [x] Cards expandem e recolhem.
- [x] Carrossel avança e volta.
- [x] TradingView é solicitado ao expandir.
- [x] Links externos permanecem válidos.
- [x] Matriz responsiva não apresenta overflow horizontal.
- [x] Hover não altera bruscamente as dimensões do card.
- [x] Todos os cards possuem `data-search-term`.
### 2026-07-12 — Fase 11: Consolidação da implementação visual

Status: concluído.

Auditoria dos passos:

- [x] Passo 1 — Tokens e classes dos três temas presentes, com aliases legados preservados.
- [x] Passo 2 — Seletor multi-tema, persistência dupla e fallbacks legado/desconhecido validados.
- [x] Passo 3 — Header, dashboard, abas, containers, busca e download responsivos.
- [x] Passo 4 — Cards minimizados de ações modernizados sem alterar cálculos ou filtros.
- [x] Passo 5 — Cards expandidos, grids, IDs de chart e tracks preservados.
- [x] Passo 6 — Bola de Neve modernizada com cálculos e filtros preservados.
- [x] Passo 7 — ETFs, FIIs ocultos e Renda Fixa ocultos renderizam e mantêm comportamento.
- [x] Passo 8 — Matriz responsiva validada em seis viewports.
- [x] Passo 9 — QA funcional automatizado concluído e documentação sincronizada.

Reforço implementado no smoke test:

- Os temas `theme-origin-dark`, `theme-seline-light` e `theme-ui-neutral` são aplicados em cada viewport.
- Para cada tema são verificados classe do body, valor do seletor, persistência em `theme` e `b3-theme` e presença dos tokens centrais.
- O valor legado `light` deve normalizar para `theme-seline-light`.
- Um tema desconhecido deve normalizar para `theme-origin-dark`.
- O tema Seline é recarregado e precisa persistir após reload antes da continuação do fluxo funcional.

Paridade consolidada:

- O checklist de Ações, Bola de Neve e ETFs foi marcado como concluído após as validações acumuladas das Fases 4, 5, 6, 8, 10 e 11.
- Nenhuma lógica de negócio ou campo de `data.js` foi alterado na Fase 11.
- Itens de histórico real, novas abas, modularização e framework permanecem no backlog controlado.
Validação final da Fase 11 em 2026-07-12:

- `npm run test:ui`: aprovado nos seis viewports com os três temas, fallbacks, fluxos funcionais, 0 erros relevantes de console e 0 overflow horizontal.
- `npm test`: 104 testes aprovados, 0 falhas.
- `npm run audit:data`: aprovado com 235 ações e 189 fundos.
- `node --check`: aprovado para smoke test, exportador e entry point.
- `git diff --check`: aprovado; permanece somente o aviso conhecido de futura conversão LF para CRLF em `index.html`.
- Varredura por `TODO`, `FIXME` e `HACK`: nenhuma ocorrência.
- Logs de transformação inválida, Selic inválida e adapters indisponíveis em `npm test` são cenários negativos intencionais e passaram nas respectivas asserções.
### 2026-07-12 — Encerramento final da implementação UI_MODERN

Status: implementação finalizada; somente o backlog controlado permanece fora do escopo.

Lacunas encontradas e corrigidas na revisão de encerramento:

- Adicionado `npm run test:e2e` para tornar executável a suíte `tests/dashboard.spec.js` que existia sem script dedicado.
- Adicionados `test-results/` e `playwright-report/` ao `.gitignore` como artefatos gerados.
- O workflow diário agora instala Chromium e executa `npm run test:ui` antes de gerar e publicar dados.
- A suíte E2E revelou que `showTab('stocks')` removia `.active` de todos os botões e não reativava Ações, pois comparava o texto visível `Ações` com a chave interna `stocks`.
- Os botões de aba agora expõem `data-tab`; `showTab` usa esse identificador estável para controlar `.active`.
- O smoke principal passou a exigir `data-tab="stocks"` ativo na inicialização.
- A limitação histórica registrada na Fase 2 sobre ausência do Playwright está superada: `@playwright/test` e Chromium estão integrados ao fluxo atual.

Validação final:

- `npm test`: 104 testes aprovados, 0 falhas.
- `npm run test:e2e`: 5 testes aprovados, 0 falhas.
- `npm run test:ui`: aprovado em seis viewports, três temas, sem erros relevantes de console e sem overflow horizontal.
- `npm run audit:data`: aprovado com 235 ações e 189 fundos.
- Parsers JavaScript e JSON: aprovados.
- `git diff --check`: aprovado; somente aviso conhecido de futura conversão LF para CRLF em `index.html`.
- Varredura por `TODO`, `FIXME` e `HACK`: nenhuma ocorrência.

Erros e warnings avaliados:

- A falha E2E do estado ativo inicial foi uma regressão real e foi corrigida.
- `spawn EPERM` do Chromium dentro do sandbox é uma restrição do ambiente; as execuções autorizadas fora dele passaram.
- Logs de transformação inválida, Selic inválida e adapters indisponíveis são cenários negativos intencionais de testes aprovados.
- Chamadas operacionais de `console.warn`/`console.error` permanecem nos fallbacks e tratamentos de falha esperados.

### 2026-07-12 — Validação e Homologação Final

Realizada a validação final da implementação por Antigravity (Gemini). A bateria de testes unitários (`npm test`), E2E (`npm run test:e2e`) e fumaça UI (`npm run test:ui`) em múltiplos viewports foi executada com 100% de sucesso. Não há erros de console ativos ou warnings impeditivos. A implementação UI_MODERN está formalmente concluída e homologada.

### 2026-07-12 — Alteração do Tema Padrão

- Configurado o tema `theme-seline-light` (Seline Light) como o tema padrão da aplicação.
- Adicionada a classe `theme-seline-light` diretamente à tag `<body>` para evitar flash de tela escura no carregamento inicial.
- Marcado o elemento do dropdown de tema com a opção Seline Light como selecionada por padrão.
- Atualizado o teste de fumaça em `scripts/playwright-smoke.js` para validar o novo fallback de tema padrão (`theme-seline-light`).
- Bateria de testes reexecutada e aprovada com sucesso.

### 2026-07-12 — Ajuste de Espaçamento e Alinhamento do Dashboard

- **Centralização no Desktop**: Alteradas as colunas do grid de `.dashboard` de `repeat(2, minmax(0, 1fr))` para `repeat(2, minmax(0, 300px))` com `justify-content: center` para evitar que os cards de Dólar e Selic fiquem deslocados para a esquerda de suas colunas e centralizá-los harmoniosamente na tela.
- **Visual Lado a Lado no Mobile**: Removido o empilhamento vertical do dashboard no media query `max-width: 720px`, garantindo que os cards se mantenham um ao lado do outro em dispositivos móveis.
- **Espaçamento Responsivo**: Adicionado `padding: clamp(0.75rem, 2vw, 1.5rem)` em `.metric-card` para reduzir o padding interno no mobile e garantir legibilidade perfeita sem wrapping.

### 2026-07-12 — Gradiente nos Botões de Aba e Alinhamento Lado a Lado no Mobile

- **Gradiente nos Botões Selecionados**: Aplicada a variável `--card-gradient` no background de `.tab-btn.active`, combinando com a cor de texto adaptável `var(--text-color)` e um sutil sombreamento `var(--primary-glow)`, criando uma identidade visual consistente com os cards de indicadores macro.
- **Abas Lado a Lado no Mobile**: Removido o grid columns override `.tabs { grid-template-columns: 1fr; }` do media query de 720px, permitindo que os botões de abas ("Ações", "FIIs", "ETFs") fiquem alinhados lado a lado no mobile.
- **Robustez dos Testes**: Atualizadas as buscas por elementos de abas nos scripts Playwright (`tests/dashboard.spec.js` e `scripts/playwright-smoke.js`) para utilizar seletores robustos baseados em `data-tab="..."` e testar visibilidade de abas dinamicamente, permitindo que alterações textuais livres das abas (como a renomeação para "FIIs") não quebrem o pipeline do CI.

### 2026-07-12 — Filtros de Categoria no Topo da Aba "Ações"

- **Filtros de Categoria**: Implementado um contêiner `.opp-filters.top-stock-filters` no topo da aba "Ações" (Ações), trazendo botões com o mesmo estilo visual da aba FIIs ("Ver Todas", "💰 Renda", "🚀 Crescimento", "📉 Valor", "📈 Oportunidades", "⚠️ Risco/Revisão").
- **Lógica de Filtragem Coerente**: Desenvolvida a função `window.filterStocks(category, btn)` para filtrar dinamicamente os cabeçalhos das subseções e os cards correspondentes a cada categoria.
- **Interoperabilidade com Subfiltros de Oportunidades**: Adaptados os filtros internos de "Oportunidades" (`opp-sub-filters`) para funcionarem de forma harmoniosa com os novos filtros de topo, garantindo que os cards se comportem de forma combinada e sem conflitos de seletores Playwright no CI.

### 2026-07-12 — Ajustes do Seletor de Temas, Resolução de Overflow Mobile e Alinhamento de Badges

- **Compactação do Seletor de Temas**: O seletor de temas (antes um dropdown retangular largo) foi reduzido a um botão de ícone minimalista contendo uma seta para baixo (`🔽`), alinhando-se com os demais botões da barra. Utilizou-se a técnica de overlay invisível (`opacity: 0` no `<select>` nativo sobreposto a um `<button>` estético com eventos repassados), preservando o ID `#themeBtn` e mantendo compatibilidade direta e inalterada com testes funcionais.
- **Eliminação de Overflow Horizontal no Mobile**: Corrigido o alinhamento da caixa de busca ativa no mobile. Ajustada de `left: 0; right: auto;` para `right: 0; left: auto;` no breakpoint de 720px para coincidir com a nova posição dos botões à direita, resolvendo o bug de deslocamento e garantindo `overflowX: false` em todas as viewports mobile.
- **Badges Lado a Lado nas Ações**: O `.equity-ticker-stack` foi alterado de `column` para `row` com wrap (`flex-direction: row; align-items: center; flex-wrap: wrap; gap: 8px;`), colocando badges como "LOW", "⚠️ Volatilidade" e "⚠️ Risco Financeiro" lado a lado com o ticker do ativo no mobile e desktop.
- **Badges Lado a Lado nos FIIs e Bola de Neve (Desktop)**:
  - Ampliada a largura mínima da coluna em `.list-container` no desktop de `320px` para `360px` para oferecer mais área horizontal aos cartões.
  - Inserida regra de estilo `@media (min-width: 721px) { .ticker-info h3 { flex-wrap: nowrap !important; } }` para impedir o wrap dos badges de segmento/tipo (ex: "🧱 Tijolo", "📄 Papel", "🌾 Fiagro/Agro") no desktop, assegurando que permaneçam sempre alinhados ao lado do ticker da cota.
- **Layout Mobile Compacto para FIIs e Bola de Neve**:
  * As abas FIIs e Bola de Neve agora mantêm o layout side-by-side (`row` layout) no mobile, alinhando a cotação no canto superior direito e empilhando os subindicadores (DY/PVP e Score) verticalmente à direita.
  * Habilitação da classe `.badge-text` para as FIIs e Bola de Neve, ocultando o texto dos badges de tipo (ex: "🧱 Tijolo" passa a "🧱") e risco (ex: "Risco LOW" passa a "LOW") no mobile, comprimindo-os e garantindo encaixe perfeito.
- **Correção do Corte do Gráfico (TradingView)**:
  - Definida a altura de todos os elementos `.chart-container` para um valor fixo de `300px` (antigo `clamp(220px, 32vw, 300px)`), alinhando a área do contêiner com as especificações do iframe do TradingView, evitando que a metade inferior do gráfico fique oculta em telas menores.
- **Botão Flutuante de Retorno ao Topo (Mobile)**:
  - Adicionado botão flutuante `#back-to-top` em formato circular (`46px x 46px`) com glassmorphism, visível apenas no mobile (breakpoint de 720px) ao rolar a tela além de `300px`. O clique realiza rolagem suave (`smooth scroll`) para o topo.
- **Validação Final**: Todos os testes unitários, funcionais E2E e fumaça UI reexecutados com 100% de aprovação nas 6 resoluções e 3 temas.
### 2026-07-12 — Dashboard histórico independente

Status: implementado.

Plano detalhado: `REFERENCIAS/UI_MODERN/history_dashboard_plan.md`.

Arquitetura entregue:

- `history-dashboard.html`: entrada estática independente do monólito.
- `assets/history-dashboard.css`: layout e temas próprios inspirados em Ventriloc, Seline, Pravah, Origin e Ui.
- `assets/history-dashboard.js`: aplicação, gráficos SVG, análise, rankings, comparação, tema e CSV.
- `scripts/build-history-data.js`: consolidação, validação e serialização dos snapshots.
- `history-data.js`: artefato agregado compatível com `file://` e GitHub Pages.
- `scripts/build-history-data.test.js`: testes do contrato e da qualidade.
- `scripts/playwright-history-smoke.js`: smoke responsivo da nova página.

Decisões de dados:

- Data canônica obtida do nome do arquivo.
- Snapshots de ações com menos de 100 itens e fundos com menos de 50 itens são rejeitados.
- `count` divergente de `items.length` também reprova o snapshot.
- Ausências e números não finitos são preservados como `null`.
- Séries são deduplicadas e ordenadas por data.
- Estrutura columnar reduz repetição no artefato publicado.
- ETFs permanecem fora até existir fonte histórica própria.

Acervo atual consolidado:

- 234 arquivos de origem.
- 112 datas canônicas entre 2026-03-16 e 2026-07-12.
- 110 snapshots válidos de ações e 112 de fundos.
- 12 snapshots incompletos rejeitados e exibidos na página.
- 246 tickers de ações e 208 tickers de fundos com alguma observação histórica.
- Artefato final com aproximadamente 2,8 MB.

Possibilidades implementadas:

- Métricas específicas por classe e períodos de 30, 90 dias ou série completa.
- Comparação normalizada entre dois ativos da mesma classe.
- KPIs de último valor, variação, mínimo/máximo implícitos no gráfico e cobertura.
- Gráfico principal interativo com tooltip.
- Sparklines de preço, DY, score e P/VP.
- Linha do tempo de sinal e categoria.
- Contexto normalizado de Selic e dólar.
- Rankings de altas, quedas, DY e evolução de score.
- Painel de qualidade e lista de snapshots rejeitados.
- Exportação CSV da série selecionada.
- Tema claro/escuro persistente e URL compartilhável com os filtros.

Integração:

- Link de análise histórica adicionado ao header do screener.
- Scripts `build:history`, `audit:history` e `test:history-ui` adicionados ao npm.
- Workflow gera e audita `history-data.js`, testa a página e inclui o artefato no commit automático.
- Todos os caminhos são relativos e funcionam em subdiretório do GitHub Pages.
Validação final do dashboard histórico em 2026-07-12:

- `npm test`: 108 testes aprovados, incluindo 4 testes do agregador histórico.
- `npm run audit:data`: aprovado com 235 ações e 189 fundos.
- `npm run audit:history`: artefato válido e atualizado.
- `npm run test:e2e`: 5 testes aprovados no dashboard principal.
- `npm run test:ui`: aprovado nos seis viewports; novo link histórico presente; 0 erros relevantes.
- `npm run test:history-ui`: aprovado em 320x720, 768x1024 e 1280x900.
- Smoke histórico validou troca de classe, ticker, métrica, período, comparação, URL, rankings, rejeições, CSV, tema persistente e ausência de overflow.
- Parsers JavaScript e JSON: aprovados.
- `git diff --check`: aprovado; apenas warnings conhecidos de LF para CRLF em arquivos existentes no Windows.
- Varredura por `TODO`, `FIXME`, `HACK`, `NaN` e `Infinity`: nenhuma ocorrência na nova implementação.
- O navegador visual integrado não estava disponível na sessão; a verificação real foi executada em Chromium headless pelo Playwright.

Warnings operacionais:

- `console.error` e códigos de saída não zero existem apenas nos caminhos de falha do gerador e dos testes, para bloquear CI corretamente.
- Logs negativos já conhecidos dos testes de adapters e entradas inválidas continuam intencionais e com asserções aprovadas.
- Nenhum erro de console foi observado na nova página.
Ajuste da busca global de Ativo principal em 2026-07-12:

- `#assetOptions` passou a reunir 246 ações e 208 fundos, totalizando 454 tickers pesquisáveis independentemente da classe ativa.
- Cada sugestão identifica sua classe como `Ação` ou `Fundo`.
- Ao selecionar ticker de outra classe, a página troca automaticamente `state.type`, redefine a métrica para preço e remove comparação incompatível.
- Selecionar ticker da classe atual preserva classe e métricas, removendo apenas comparação com o próprio ativo quando necessário.
- Placeholder informa que a busca cobre ações e fundos.
- Smoke Playwright validou as 454 opções e a transição Fundos → PETR4 → Ações em 320, 768 e 1280 px.
- Resultado: 3 viewports aprovados, 0 erros de console e 0 overflow horizontal.
