const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHistoryData, validateArtifact, normalizePoint, getActualTradingDate, getTrailingYield } = require('./build-history-data');

const temporaryDirectories = [];
afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (path.basename(directory).startsWith('b3-history-test-')) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixtureDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-history-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSnapshot(directory, date, sourceType, count, itemFactory, economy = { selic: 12, dollar: 5 }) {
  const items = Array.from({ length: count }, (_, index) => itemFactory(index));
  fs.writeFileSync(path.join(directory, `${date}-${sourceType}-results.json`), JSON.stringify({
    date: `${date}T12:00:00.000Z`, count, economy, type: sourceType === 'fii' ? 'fii' : 'stock', items
  }));
}

function stock(index, overrides = {}) {
  return { ticker: `ST${String(index).padStart(3, '0')}`, cotacao: 10 + index, dividend_yield: 5, overall_score: 7, p_vp: 1, signal: 'WATCHLIST', ...overrides };
}

function fund(index, overrides = {}) {
  return { ticker: `FI${String(index).padStart(3, '0')}`, price: 90 + index, dy: 10, overall_score: 8, p_vp: 0.95, signal: 'TOP_PICK', ...overrides };
}

describe('history data builder', () => {
  test('date alignment logic correct', () => {
    // Thursday -> Wednesday
    assert.strictEqual(getActualTradingDate('2026-01-01'), '2025-12-31');
    // Friday -> Thursday
    assert.strictEqual(getActualTradingDate('2026-01-02'), '2026-01-01');
    // Monday -> Friday
    assert.strictEqual(getActualTradingDate('2026-01-05'), '2026-01-02');
  });

  test('getTrailingYield calculations correct', () => {
    const dividends = [
      { date: '2024-02-01', amount: 1.0 },
      { date: '2024-06-01', amount: 2.0 },
      { date: '2024-12-01', amount: 1.5 },
      { date: '2025-03-01', amount: 3.0 }
    ];
    
    // Trailing 12 months for 2024-12-31: 2024-02-01, 2024-06-01, 2024-12-01 are inside the window. Total = 4.5.
    // Price = 45.0. Yield = (4.5 / 45.0) * 100 = 10.0%.
    assert.strictEqual(getTrailingYield('2024-12-31', 45.0, dividends), 10.0);

    // Trailing 12 months for 2025-04-01: 2024-06-01 (yes), 2024-12-01 (yes), 2025-03-01 (yes), 2024-02-01 (no, >365 days ago). Total = 6.5.
    // Price = 65.0. Yield = (6.5 / 65.0) * 100 = 10.0%.
    assert.strictEqual(getTrailingYield('2025-04-01', 65.0, dividends), 10.0);
  });

  test('aggregates valid snapshots into ordered columnar series', async () => {
    const directory = fixtureDirectory();
    writeSnapshot(directory, '2026-01-02', 'stock', 100, index => stock(index, { cotacao: 12 }));
    writeSnapshot(directory, '2026-01-01', 'stock', 100, index => stock(index, { cotacao: 10 }));
    writeSnapshot(directory, '2026-01-01', 'fii', 50, index => fund(index));
    
    const data = await buildHistoryData({ historyDir: directory, isTest: true });
    
    assert.deepEqual(data.dates, ['2025-12-31', '2026-01-01']);
    assert.deepEqual(data.series.stock.ST000.d, [0, 1]);
    assert.equal(data.series.stock.ST000.v[0][0], 10);
    assert.equal(data.series.stock.ST000.v[1][0], 12);
    assert.equal(data.meta.accepted.stock, 2);
    assert.equal(data.meta.accepted.fund, 1);
    assert.equal(validateArtifact(data), true);
  });

  test('rejects incomplete snapshots without poisoning valid series', async () => {
    const directory = fixtureDirectory();
    writeSnapshot(directory, '2026-01-01', 'stock', 100, index => stock(index));
    writeSnapshot(directory, '2026-01-02', 'stock', 0, index => stock(index));
    
    const data = await buildHistoryData({ historyDir: directory, isTest: true });
    assert.equal(data.meta.rejected.length, 1);
    assert.equal(data.meta.rejected[0].reason, 'INSUFFICIENT_ITEMS');
    assert.equal(data.series.stock.ST000.d.length, 1);
  });

  test('preserves missing and non-finite values as null', () => {
    const point = normalizePoint({ ticker: 'TEST3', cotacao: NaN, dividend_yield: undefined, score: 0 }, 'stock');
    assert.equal(point[0], null);
    assert.equal(point[1], null);
    assert.equal(point[2], 0);
    assert.equal(point.some(value => typeof value === 'number' && !Number.isFinite(value)), false);
  });

  test('rejects declared count mismatches', async () => {
    const directory = fixtureDirectory();
    const items = Array.from({ length: 100 }, (_, index) => stock(index));
    fs.writeFileSync(path.join(directory, '2026-01-01-stock-results.json'), JSON.stringify({ date: '2026-01-01T12:00:00.000Z', count: 101, items }));
    
    await assert.rejects(
      async () => { await buildHistoryData({ historyDir: directory, isTest: true }); },
      /No valid history snapshots/
    );
  });
});