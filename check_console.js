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
  await page.waitForTimeout(15000);

  const errorText = await page.locator('#newsTrack p').innerText().catch(() => 'No text found');
  console.log(`\nNews section text on screen: "${errorText}"`);

  await browser.close();
}

main().catch(err => console.error('Error running check_console:', err));
