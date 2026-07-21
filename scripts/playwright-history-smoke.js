const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const fileUrl = `file:///${path.resolve('history-dashboard.html').replace(/\\/g, '/')}`;
  const results = [];
  const errors = [];

  async function run(name, viewport) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(`[${name}] ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`[${name}] ${message.text()}`); });
    // Mock rss2json — único gateway usado pelo código de notícias
    // Retorna JSON válido para qualquer ticker (Yahoo RSS ou Google News RSS via rss2json)
    await page.route('https://api.rss2json.com/**', async route => {
      const mockJson = JSON.stringify({
        status: 'ok',
        feed: { title: 'Mock Feed', link: 'https://example.com', author: '', description: '', image: '' },
        items: [
          {
            title: 'Mock news for ticker - InfoMoney',
            link: 'https://www.infomoney.com.br/mock-news',
            pubDate: 'Mon, 21 Jul 2026 10:00:00 +0000',
            author: '',
            thumbnail: '',
            description: 'Mock news description for smoke test.',
            content: '',
            enclosure: {},
            categories: []
          }
        ]
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockJson
      });
    });
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainChart svg', { timeout: 15000 });

    const title = await page.title();
    const summaryCount = await page.locator('#summaryGrid .stat-card').count();
    const initialTicker = await page.locator('#assetTitle').innerText();
    const initialActiveType = await page.locator('#assetType button.active').getAttribute('data-type');
    const initialChart = await page.locator('#mainChart svg').count();
    const rankingCount = await page.locator('#rankingGrid .ranking-card').count();
    const qualityCount = await page.locator('#qualityGrid .quality-card').count();
    const backHref = await page.locator('a[href="./index.html"]').first().getAttribute('href');
    const globalAssetOptionCount = await page.locator('#assetOptions option').count();

    await page.locator('#assetType button[data-type="fund"]').click();
    const fundTicker = await page.locator('#assetTitle').innerText();
    const fundTypeActive = await page.locator('#assetType button.active').getAttribute('data-type');
    await page.selectOption('#metricSelect', 'dy');
    await page.selectOption('#periodSelect', '30');
    const compareValue = await page.locator('#compareAsset option').nth(1).getAttribute('value');
    await page.selectOption('#compareAsset', compareValue);
    const normalizedTitle = await page.locator('#chartTitle').innerText();
    const query = new URL(page.url()).searchParams;

    await page.locator('#assetSearch').fill('PETR4');
    await page.locator('#assetSearch').dispatchEvent('change');
    const globalSearchSwitchesType = await page.locator('#assetType button.active').getAttribute('data-type') === 'stock'
      && await page.locator('#assetTitle').innerText() === 'PETR4';

    await page.locator('#toggleRejected').click();
    const rejectedVisible = await page.locator('#rejectedList:not([hidden]) .rejected-row').count();

    const downloadName = await page.evaluate(() => {
      let name = '';
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      const originalClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = () => 'blob:history-smoke';
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () { name = this.download; };
      document.getElementById('downloadCsv').click();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
      return name;
    });

    await page.locator('#themeToggle').click();
    const darkApplied = await page.locator('body.dark').count() === 1;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainChart svg', { timeout: 15000 });
    const darkPersisted = await page.locator('body.dark').count() === 1;
    const layout = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      historyVersion: window.B3_HISTORY_DATA?.meta?.version,
      dates: window.B3_HISTORY_DATA?.dates?.length,
      rejected: window.B3_HISTORY_DATA?.meta?.rejected?.length,
      expectedGlobalAssetOptionCount:
        Object.keys(window.B3_HISTORY_DATA?.series?.stock || {}).length
        + Object.keys(window.B3_HISTORY_DATA?.series?.fund || {}).length
    }));

    results.push({ name, viewport, title, summaryCount, initialTicker, initialActiveType, initialChart, rankingCount, qualityCount, backHref, globalAssetOptionCount, fundTicker, fundTypeActive, normalizedTitle, queryType: query.get('type'), queryMetric: query.get('metric'), queryPeriod: query.get('period'), queryCompare: query.get('compare'), globalSearchSwitchesType, rejectedVisible, downloadName, darkApplied, darkPersisted, ...layout });
    await page.close();
  }

  await run('mobile', { width: 320, height: 720 });
  await run('tablet', { width: 768, height: 1024 });
  await run('desktop', { width: 1280, height: 900 });
  await browser.close();

  console.log(JSON.stringify({ results, errors }, null, 2));
  if (errors.length) process.exit(1);
  const failed = results.some(result =>
    result.title !== 'Histórico | B3 Screener'
    || result.summaryCount !== 4
    || !result.initialTicker
    || result.initialActiveType !== 'stock'
    || result.initialChart !== 1
    || result.rankingCount !== 4
    || result.qualityCount !== 3
    || result.backHref !== './index.html'
    || result.globalAssetOptionCount !== result.expectedGlobalAssetOptionCount
    || !result.fundTicker
    || result.fundTypeActive !== 'fund'
    || !result.normalizedTitle.includes('normalizado')
    || result.queryType !== 'fund'
    || result.queryMetric !== 'dy'
    || result.queryPeriod !== '30'
    || !result.queryCompare
    || !result.globalSearchSwitchesType
    || result.rejectedVisible <= 0
    || !/^[A-Z0-9]+-historico\.csv$/.test(result.downloadName)
    || !result.darkApplied
    || !result.darkPersisted
    || result.overflowX
    || result.historyVersion !== 1
    || result.dates <= 0
    || result.rejected <= 0
  );
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
