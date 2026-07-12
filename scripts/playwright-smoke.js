const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const fileUrl = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];

  async function runViewport(name, viewport) {
    const page = await browser.newPage({ viewport });
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[${name}] ${msg.text()}`);
    });
    page.on('pageerror', err => errors.push(`[${name}] ${err.message}`));
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stock-card', { timeout: 15000 });

    const cardCount = await page.locator('.stock-card').count();
    const historyContractVersion = await page.evaluate(() => window.B3_HISTORY_EXTENSION?.version);
    const historyMountCount = await page.locator('[data-history-mount]').count();
    const visibleHistoryMountCount = await page.locator('[data-history-mount]:visible').count();
    const historyExtensionAudit = await page.evaluate(() => {
      const contract = window.B3_HISTORY_EXTENSION;
      const expandableCards = [...document.querySelectorAll('.stock-card')].filter(card => card.querySelector('.card-details'));
      const registeredCards = expandableCards.filter(card => contract?.assetTypes.includes(card.dataset.historyAssetType) && Boolean(card.dataset.historyTicker));
      const mounts = [...document.querySelectorAll(contract?.mountSelector || '[data-history-mount]')];
      const invalidMounts = mounts.filter(mount => {
        const card = mount.closest('.stock-card');
        return !mount.hidden || mount.getAttribute('aria-hidden') !== 'true' || mount.dataset.historyStatus !== 'not-loaded' || !card || mount.dataset.historyAssetType !== card.dataset.historyAssetType || mount.dataset.historyTicker !== card.dataset.historyTicker;
      });
      const mountsByType = mounts.reduce((counts, mount) => {
        const type = mount.dataset.historyAssetType || 'missing';
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {});
      return {
        contractFrozen: Boolean(contract) && Object.isFrozen(contract) && Object.isFrozen(contract.filePatterns) && Object.isFrozen(contract.assetTypes) && Object.isFrozen(contract.metrics),
        expandableCardCount: expandableCards.length,
        registeredCardCount: registeredCards.length,
        invalidMountCount: invalidMounts.length,
        mountsByType
      };
    });
    const stockEquityCount = await page.locator('.stock-card.stock-equity').count();
    const firstStockText = await page.locator('.stock-card.stock-equity').first().innerText();
    const firstStockScore = await page.locator('.stock-card.stock-equity .score-indicator').first().innerText();
    const lastUpdate = await page.locator('#lastUpdate').innerText();
    const dollar = await page.locator('#dollarVal').innerText();
    const selic = await page.locator('#selicVal').innerText();
    const visibleTabs = await page.locator('.tab-btn:visible').evaluateAll(btns => btns.map(b => b.textContent.trim()));
    const historyPageLink = await page.locator('a[href="./history-dashboard.html"]').count();
    const initialActiveTab = await page.locator('.tab-btn.active').getAttribute('data-tab');
    const qaBaseline = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.stock-card')];
      const links = [...document.querySelectorAll('.external-link-btn[href]')];
      const requiredGlobals = ['toggleSearch', 'navigateSearch', 'toggleDownloadMenu', 'downloadCSV', 'showTab', 'filterOpportunities', 'filterFIIs', 'filterSnowball', 'moveSlide', 'goToSlide', 'getInvestidor10Url'];
      return {
        investDataLoaded: Boolean(window.INVEST_DATA?.stocks?.length && window.INVEST_DATA?.fiis?.length && window.INVEST_DATA?.etfs?.length),
        missingSearchTermCount: cards.filter(card => !card.dataset.searchTerm).length,
        invalidExternalLinkCount: links.filter(link => !/^https:\/\//.test(link.href) || link.target !== '_blank').length,
        missingGlobalCount: requiredGlobals.filter(name => typeof window[name] !== 'function').length
      };
    });
    const csvDownloads = await page.evaluate(() => {
      const captured = [];
      const originalCreateObjectURL = URL.createObjectURL;
      const originalClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = () => 'blob:qa-functional';
      HTMLAnchorElement.prototype.click = function () { captured.push(this.download); };
      ['stocks', 'fiis', 'etfs'].forEach(type => window.downloadCSV(type));
      URL.createObjectURL = originalCreateObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
      return captured;
    });

    const themeAudit = await page.evaluate(() => {
      const themes = ['theme-origin-dark', 'theme-seline-light', 'theme-ui-neutral'];
      const cases = themes.map(theme => {
        window.setTheme(theme);
        const styles = getComputedStyle(document.body);
        return {
          theme,
          applied: document.body.classList.contains(theme),
          selected: document.getElementById('themeBtn').value === theme,
          persisted: localStorage.getItem('theme') === theme && localStorage.getItem('b3-theme') === theme,
          tokensPresent: Boolean(styles.getPropertyValue('--bg-color').trim() && styles.getPropertyValue('--card-bg').trim() && styles.getPropertyValue('--text-color').trim())
        };
      });
      window.setTheme('light');
      const legacyFallbackWorks = document.body.classList.contains('theme-seline-light');
      window.setTheme('unknown-theme');
      const unknownFallbackWorks = document.body.classList.contains('theme-seline-light');
      return { cases, legacyFallbackWorks, unknownFallbackWorks };
    });
    await page.selectOption('#themeBtn', 'theme-seline-light');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stock-card', { timeout: 15000 });
    const themeClass = await page.evaluate(() => document.body.className);
    const themePersisted = await page.locator('#themeBtn').inputValue() === 'theme-seline-light' && themeClass.includes('theme-seline-light');
    await page.click('button[title="Pesquisar"]');
    await page.fill('#searchInput', 'PETR');
    const searchCount = await page.locator('#searchCount').innerText();
    await page.locator('.tab-btn[data-tab="etfs"]').click();
    await page.waitForSelector('#content-etfs:not(.hidden)', { timeout: 5000 });
    const etfVisible = await page.locator('#content-etfs:not(.hidden)').count();
    const benchmarkCardCount = await page.locator('#content-etfs .benchmark-card').count();
    const etfCardCount = await page.locator('#content-etfs .etf-card').count();
    const firstEtfTicker = await page.locator('#content-etfs .etf-card img.stock-logo').first().getAttribute('alt');
    await page.fill('#searchInput', firstEtfTicker);
    await page.evaluate(() => window.navigateSearch(1));
    const searchNavigatesAcrossTabs = await page.locator('#content-etfs:not(.hidden) .etf-card.card-highlight').count() > 0;
    const firstBenchmarkText = await page.locator('#content-etfs .benchmark-card').first().evaluate(el => el.textContent || '');
    const firstEtfText = await page.locator('#content-etfs .etf-card').first().evaluate(el => el.textContent || '');
    const benchmarkHasRequiredInfo = firstBenchmarkText.trim().length > 0 && /%|CDI|IPCA|Pré|PRE|Selic|SELIC/i.test(firstBenchmarkText);
    const minimizedEtfHasRequiredInfo = ['ETF de Renda Variável', 'R$', 'DY'].every(token => firstEtfText.includes(token));
    await page.evaluate(() => {
      const card = document.querySelector('#content-etfs .etf-card');
      if (card) card.click();
    });
    const expandedEtfCount = await page.locator('#content-etfs .etf-card.expanded').count();
    const expandedEtfText = await page.locator('#content-etfs .etf-card.expanded').first().evaluate(el => el.textContent || '');
    const expandedEtfHasRequiredInfo = ['Liq. Diária', 'Var. 12m', 'Min 52s', 'Max 52s', 'Investidor 10'].every(token => expandedEtfText.includes(token));

    const layout = await page.evaluate(() => {
      const header = document.querySelector('header').getBoundingClientRect();
      const container = document.querySelector('.container').getBoundingClientRect();
      const bodyWidth = document.documentElement.clientWidth;
      const overflowX = document.documentElement.scrollWidth > bodyWidth + 1;
      return { headerHeight: Math.round(header.height), containerTop: Math.round(container.top), overflowX };
    });

    const minimizedStockHasRequiredInfo = ['Graham:', 'Bazin:', 'R$', 'DY ', 'P/VP'].every(token => firstStockText.includes(token)) && firstStockScore.trim().length > 0;

    await page.locator('.tab-btn[data-tab="stocks"]').click();
    const firstStockCard = page.locator('.stock-card.stock-equity').first();
    const cardBoxBeforeHover = await firstStockCard.boundingBox();
    await firstStockCard.hover();
    const cardBoxAfterHover = await firstStockCard.boundingBox();
    const hoverLayoutStable = Boolean(cardBoxBeforeHover && cardBoxAfterHover)
      && Math.abs(cardBoxBeforeHover.width - cardBoxAfterHover.width) <= 2
      && Math.abs(cardBoxBeforeHover.height - cardBoxAfterHover.height) <= 2;
    const opportunityFilterButton = page.locator('#content-stocks .opp-sub-filters .filter-btn[data-id=QUALITY]');
    const opportunityTotal = await page.locator('#content-stocks .stock-card[data-type="opportunity"]').count();
    await opportunityFilterButton.click();
    const opportunityVisible = await page.locator('#content-stocks .stock-card[data-type="opportunity"]:visible').count();
    const opportunityFilterWorks = await opportunityFilterButton.evaluate(button => button.classList.contains('active')) && opportunityVisible <= opportunityTotal;
    await page.locator('#content-stocks .opp-sub-filters .filter-btn[data-id=ALL]').click();
    await page.evaluate(() => document.querySelectorAll('.card-highlight').forEach(el => el.classList.remove('card-highlight')));
    await page.evaluate(() => {
      document.querySelectorAll('.stock-card.stock-equity').forEach((card, index) => {
        if (index < 5) card.click();
      });
    });
    const expandedStockCount = await page.locator('.stock-card.stock-equity.expanded').count();
    const firstExpanded = page.locator('.stock-card.stock-equity.expanded').first();
    const expandedText = await firstExpanded.evaluate(el => el.textContent || '');
    const expandedHasRequiredInfo = ['P/L', 'ROE', 'Graham Price', 'Bazin Price', 'PEG', 'ROIC', 'Payout'].every(token => expandedText.includes(token));
    await firstExpanded.locator('.next-btn').click();
    const firstTrackTransform = await firstExpanded.locator('.carousel-track').evaluate(el => getComputedStyle(el).transform);
    const stillExpandedAfterCarousel = await firstExpanded.evaluate(el => el.classList.contains('expanded'));
    await firstExpanded.locator('.prev-btn').click();
    const carouselReturns = await firstExpanded.locator('.prev-btn').isDisabled();
    const tradingViewRequested = await firstExpanded.locator('.chart-container').evaluate(el => el.children.length > 0);
    const stockCardCollapses = await firstExpanded.evaluate(card => {
      card.click();
      return !card.classList.contains('expanded') && !card.querySelector('.card-details').classList.contains('show');
    });

    await page.locator('.tab-btn[data-tab="snowball"]').click();
    await page.waitForSelector('#content-snowball:not(.hidden)', { timeout: 5000 });
    await page.evaluate(() => document.querySelectorAll('.card-highlight').forEach(el => el.classList.remove('card-highlight')));
    const snowballFilters = await page.locator('#content-snowball .filter-btn').evaluateAll(btns => btns.map(b => b.textContent.trim()));
    const snowballCardCount = await page.locator('#content-snowball .stock-card.snowball-card').count();
    const firstSnowballText = await page.locator('#content-snowball .stock-card.snowball-card').first().evaluate(el => el.textContent || '');
    const minimizedSnowballHasRequiredInfo = ['cotas', 'paga +1 cota', 'VP:', 'Bazin:', 'R$', 'DY', '/cota'].every(token => firstSnowballText.includes(token));

    await page.locator('#content-snowball .filter-btn', { hasText: 'Base 10' }).click();
    const snowballBase10Count = await page.locator('#content-snowball .stock-card.snowball-card').count();
    const snowballBase10HasHeader = await page.locator('#content-snowball h2', { hasText: 'Base R$ 10' }).count();
    await page.locator('#content-snowball .filter-btn', { hasText: 'Fiagro/Agro' }).click();
    const snowballAgroCount = await page.locator('#content-snowball .stock-card.snowball-card').count();
    await page.locator('#content-snowball .filter-btn', { hasText: 'Ver Todos' }).click();

    await page.evaluate(() => {
      document.querySelectorAll('#content-snowball .stock-card.snowball-card').forEach((card, index) => {
        if (index < 5) card.click();
      });
    });
    const expandedSnowballCount = await page.locator('#content-snowball .stock-card.snowball-card.expanded').count();
    const firstExpandedSnowball = page.locator('#content-snowball .stock-card.snowball-card.expanded').first();
    const expandedSnowballText = await firstExpandedSnowball.evaluate(el => el.textContent || '');
    const expandedSnowballHasRequiredInfo = ['Invest. Total', 'Renda Anual', 'Renda Mensal', 'Último Rendimento', 'Liq. Diária', 'P/VP', 'Central de Notícias'].every(token => expandedSnowballText.includes(token));
    await firstExpandedSnowball.locator('.next-btn').click();
    const snowballTrackTransform = await firstExpandedSnowball.locator('.carousel-track').evaluate(el => getComputedStyle(el).transform);
    const snowballStillExpandedAfterCarousel = await firstExpandedSnowball.evaluate(el => el.classList.contains('expanded'));

    await page.evaluate(() => window.showTab('fiis'));
    await page.waitForSelector('#content-fiis:not(.hidden)', { timeout: 5000 });
    const fiiHiddenTabVisible = await page.locator('#content-fiis:not(.hidden)').count();
    const fiiHiddenTabCardCount = await page.locator('#content-fiis .stock-card.fii').count();
    const fiiFilters = await page.locator('#content-fiis .filter-btn').evaluateAll(btns => btns.map(b => b.textContent.trim()));
    const firstFiiText = await page.locator('#content-fiis .stock-card.fii').first().evaluate(el => el.textContent || '');
    const minimizedFiiHasRequiredInfo = ['R$', 'DY', 'P/VP'].every(token => firstFiiText.includes(token));
    await page.locator('#content-fiis .filter-btn', { hasText: 'Tijolo' }).click();
    const fiiTijoloVisibleCount = await page.locator('#content-fiis .stock-card.fii:not([style*="display: none"])').count();
    const fiiHasSafeIncomeFilter = fiiFilters.some(label => label.includes('Renda Segura'));
    await page.locator('#content-fiis .filter-btn', { hasText: 'Ver Todos' }).click();
    await page.evaluate(() => {
      const card = document.querySelector('#content-fiis .stock-card.fii');
      if (card) card.click();
    });
    const expandedFiiCount = await page.locator('#content-fiis .stock-card.fii.expanded').count();
    const expandedFiiText = await page.locator('#content-fiis .stock-card.fii.expanded').first().evaluate(el => el.textContent || '');
    const expandedFiiHasRequiredInfo = ['Valuation', 'Renda', 'Liquidez', 'Segurança', 'FFO Yield', 'Cap Rate', 'Vacância', 'Liquidez Diária', 'V. Mercado', 'Última Data Com', 'Último Pagamento'].every(token => expandedFiiText.includes(token));

    await page.evaluate(() => window.showTab('fixed'));
    await page.waitForSelector('#content-fixed:not(.hidden)', { timeout: 5000 });
    const fixedHiddenTabVisible = await page.locator('#content-fixed:not(.hidden)').count();
    const fixedCardCount = await page.locator('#content-fixed .fixed-income-card').count();
    const firstFixedText = await page.locator('#content-fixed .fixed-income-card').first().evaluate(el => el.textContent || '');
    const fixedHasRequiredInfo = ['Vence:', 'Min:'].every(token => firstFixedText.includes(token));
    const hiddenTabsStillHidden = await page.locator('.tab-btn[data-tab="fiis"]:visible').count() === 0 && await page.locator('.tab-btn[data-tab="fixed"]:visible').count() === 0;

    results.push({ name, viewport, cardCount, historyContractVersion, historyMountCount, visibleHistoryMountCount, historyExtensionAudit, qaBaseline, csvDownloads, themeAudit, themePersisted, initialActiveTab, historyPageLink, searchNavigatesAcrossTabs, hoverLayoutStable, opportunityFilterWorks, carouselReturns, tradingViewRequested, stockCardCollapses, stockEquityCount, minimizedStockHasRequiredInfo, expandedStockCount, expandedHasRequiredInfo, stillExpandedAfterCarousel, firstTrackTransform, snowballFilters, snowballCardCount, minimizedSnowballHasRequiredInfo, snowballBase10Count, snowballBase10HasHeader, snowballAgroCount, expandedSnowballCount, expandedSnowballHasRequiredInfo, snowballStillExpandedAfterCarousel, snowballTrackTransform, fiiHiddenTabVisible, fiiHiddenTabCardCount, fiiFilters, minimizedFiiHasRequiredInfo, fiiTijoloVisibleCount, fiiHasSafeIncomeFilter, expandedFiiCount, expandedFiiHasRequiredInfo, fixedHiddenTabVisible, fixedCardCount, fixedHasRequiredInfo, hiddenTabsStillHidden, lastUpdate, dollar, selic, visibleTabs, themeClass, searchCount, etfVisible, benchmarkCardCount, etfCardCount, benchmarkHasRequiredInfo, minimizedEtfHasRequiredInfo, expandedEtfCount, expandedEtfHasRequiredInfo, ...layout });
    await page.close();
  }

  await runViewport('mobile-320', { width: 320, height: 720 });
  await runViewport('mobile-375', { width: 375, height: 812 });
  await runViewport('mobile-414', { width: 414, height: 896 });
  await runViewport('tablet-768', { width: 768, height: 1024 });
  await runViewport('desktop-1024', { width: 1024, height: 768 });
  await runViewport('desktop-1280', { width: 1280, height: 900 });
  await browser.close();

  const relevantErrors = errors.filter(e => !/favicon|net::ERR|TradingView|s3\.tradingview/i.test(e));
  console.log(JSON.stringify({ results, errors: relevantErrors }, null, 2));
  if (relevantErrors.length) process.exit(1);
  if (results.some(r => r.cardCount <= 0 || r.historyContractVersion !== 1 || r.historyMountCount <= 0 || r.visibleHistoryMountCount !== 0 || !r.qaBaseline.investDataLoaded || r.qaBaseline.missingSearchTermCount !== 0 || r.qaBaseline.invalidExternalLinkCount !== 0 || r.qaBaseline.missingGlobalCount !== 0 || r.csvDownloads.length !== 3 || !['stocks', 'fiis', 'etfs'].every(type => r.csvDownloads.some(file => new RegExp('^' + type + '_\\d{4}-\\d{2}-\\d{2}\\.csv$').test(file))) || !r.themeAudit.legacyFallbackWorks || !r.themeAudit.unknownFallbackWorks || r.themeAudit.cases.length !== 3 || r.themeAudit.cases.some(theme => !theme.applied || !theme.selected || !theme.persisted || !theme.tokensPresent) || !r.themePersisted || r.initialActiveTab !== 'stocks' || r.historyPageLink !== 1 || !r.searchNavigatesAcrossTabs || !r.hoverLayoutStable || !r.opportunityFilterWorks || !r.carouselReturns || !r.tradingViewRequested || !r.stockCardCollapses || !r.historyExtensionAudit.contractFrozen || r.historyExtensionAudit.expandableCardCount !== r.historyExtensionAudit.registeredCardCount || r.historyExtensionAudit.expandableCardCount !== r.historyMountCount || r.historyExtensionAudit.invalidMountCount !== 0 || !r.historyExtensionAudit.mountsByType.stock || !r.historyExtensionAudit.mountsByType.fund || !r.historyExtensionAudit.mountsByType.etf || r.stockEquityCount <= 0 || !r.minimizedStockHasRequiredInfo || r.expandedStockCount < 5 || !r.expandedHasRequiredInfo || !r.stillExpandedAfterCarousel || r.firstTrackTransform === "none" || r.snowballCardCount <= 0 || !r.minimizedSnowballHasRequiredInfo || r.snowballBase10Count <= 0 || r.snowballBase10HasHeader < 1 || r.snowballAgroCount <= 0 || r.expandedSnowballCount < 5 || !r.expandedSnowballHasRequiredInfo || !r.snowballStillExpandedAfterCarousel || r.snowballTrackTransform === "none" || r.fiiHiddenTabVisible !== 1 || r.fiiHiddenTabCardCount <= 0 || !r.minimizedFiiHasRequiredInfo || r.fiiTijoloVisibleCount <= 0 || !r.fiiHasSafeIncomeFilter || r.expandedFiiCount < 1 || !r.expandedFiiHasRequiredInfo || r.fixedHiddenTabVisible !== 1 || r.fixedCardCount <= 0 || !r.fixedHasRequiredInfo || !r.hiddenTabsStillHidden || r.etfVisible !== 1 || r.benchmarkCardCount <= 0 || r.etfCardCount <= 0 || !r.benchmarkHasRequiredInfo || !r.minimizedEtfHasRequiredInfo || r.expandedEtfCount < 1 || !r.expandedEtfHasRequiredInfo || r.overflowX)) process.exit(1);
})();













