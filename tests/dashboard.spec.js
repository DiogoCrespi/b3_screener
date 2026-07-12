const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('B3 Screener Dashboard E2E Tests', () => {
  let fileUrl;

  test.beforeAll(() => {
    const absolutePath = path.resolve(__dirname, '../index.html');
    fileUrl = `file://${absolutePath.replace(/\\/g, '/')}`;
  });

  test.beforeEach(({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  });

  test('should load dashboard header and macroeconomic metrics', async ({ page }) => {
    await page.goto(fileUrl);

    // Verify Title
    await expect(page).toHaveTitle('B3 Screener Mobile');

    // Verify Headings
    const h1 = page.locator('header h1');
    await expect(h1).toHaveText('🚀 B3 Screener');

    // Verify macroeconomic cards are loaded (Dólar, Selic)
    const metricCards = page.locator('.metric-card');
    await expect(metricCards).toHaveCount(2);

  });

  test('should switch tabs and update active content', async ({ page }) => {
    await page.goto(fileUrl);

    // Default tab (Ações) should be active
    const activeTab = page.locator('.tab-btn.active');
    await expect(activeTab).toHaveAttribute('data-tab', 'stocks');

    const stockContainer = page.locator('#content-stocks');
    await expect(stockContainer).toBeVisible();

    // Switch to Bola de Neve tab
    const snowballTabBtn = page.locator('.tab-btn[data-tab="snowball"]');
    await snowballTabBtn.click();
    await expect(page.locator('.tab-btn.active')).toHaveAttribute('data-tab', 'snowball');

    const snowballContainer = page.locator('#content-snowball');
    await expect(snowballContainer).toBeVisible();

    // Switch to ETFs tab
    const etfTabBtn = page.locator('.tab-btn[data-tab="etfs"]');
    await etfTabBtn.click();
    await expect(page.locator('.tab-btn.active')).toHaveAttribute('data-tab', 'etfs');

    const etfContainer = page.locator('#content-etfs');
    await expect(etfContainer).toBeVisible();
  });

  test('should filter cards using the search input', async ({ page }) => {
    await page.goto(fileUrl);

    // Click search icon button to display input
    const searchIconBtn = page.locator('button.btn-icon', { hasText: '🔍' });
    await searchIconBtn.click();

    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible();

    // Count initial visible stock cards
    const initialCardsCount = await page.locator('#content-stocks .stock-card').count();
    expect(initialCardsCount).toBeGreaterThan(0);

    // Type a specific ticker like 'PETR4' in search
    await searchInput.fill('PETR4');
    await page.waitForTimeout(200);

    // Verify search results are highlighted/active
    const searchCount = page.locator('#searchCount');
    await expect(searchCount).not.toBeEmpty();
  });

  test('should toggle theme classes on select change', async ({ page }) => {
    await page.goto(fileUrl);

    // Check if theme selector is present
    const themeSelect = page.locator('#themeBtn');
    await expect(themeSelect).toBeVisible();

    // Change value to Seline Light
    await themeSelect.selectOption('theme-seline-light');

    // Verify body class is updated
    const body = page.locator('body');
    const hasSelineTheme = await body.evaluate(el => el.classList.contains('theme-seline-light'));
    expect(hasSelineTheme).toBe(true);
  });

  test('should expand card details when clicked', async ({ page }) => {
    await page.goto(fileUrl);

    // Find the first visible stock card
    const firstCard = page.locator('#content-stocks .stock-card').first();
    await expect(firstCard).toBeVisible();

    // Clicking it should toggle display details
    const detailsContainer = firstCard.locator('.card-details');
    await firstCard.click();
    await expect(detailsContainer).toBeVisible();
  });
});
