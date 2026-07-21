const { chromium } = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE - ${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[BROWSER PAGEERROR] ${err.message}`);
  });

  const url = 'file:///C:/Nestjs/b3_screener/history-dashboard.html?type=stock&ticker=PETR4';
  console.log(`Opening: ${url}`);
  await page.goto(url);
  await page.waitForTimeout(2000);

  console.log('\nRunning fetch test in browser...');
  const result = await page.evaluate(async () => {
    const rssUrl = 'https://finance.yahoo.com/rss/headline?s=PETR4.SA';
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    try {
      const response = await fetch(apiUrl);
      const json = await response.json();
      return { status: response.status, jsonStatus: json.status, itemsCount: json.items ? json.items.length : 0, firstItem: json.items && json.items[0] ? json.items[0].title : null };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('Browser fetch result:', JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch(err => console.error('Error running check_rss2json:', err));
