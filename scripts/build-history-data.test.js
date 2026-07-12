const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHistoryData, validateArtifact, normalizePoint } = require('./build-history-data');

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
  test('aggregates valid snapshots into ordered columnar series', () => {
    const directory = fixtureDirectory();
    writeSnapshot(directory, '2026-01-02', 'stock', 100, index => stock(index, { cotacao: 12 }));
    writeSnapshot(directory, '2026-01-01', 'stock', 100, index => stock(index, { cotacao: 10 }));
    writeSnapshot(directory, '2026-01-01', 'fii', 50, index => fund(index));
    const data = buildHistoryData({ historyDir: directory });
    assert.deepEqual(data.dates, ['2026-01-01', '2026-01-02']);
    assert.deepEqual(data.series.stock.ST000.d, [0, 1]);
    assert.equal(data.series.stock.ST000.v[0][0], 10);
    assert.equal(data.series.stock.ST000.v[1][0], 12);
    assert.equal(data.meta.accepted.stock, 2);
    assert.equal(data.meta.accepted.fund, 1);
    assert.equal(validateArtifact(data), true);
  });

  test('rejects incomplete snapshots without poisoning valid series', () => {
    const directory = fixtureDirectory();
    writeSnapshot(directory, '2026-01-01', 'stock', 100, index => stock(index));
    writeSnapshot(directory, '2026-01-02', 'stock', 0, index => stock(index));
    const data = buildHistoryData({ historyDir: directory });
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

  test('rejects declared count mismatches', () => {
    const directory = fixtureDirectory();
    const items = Array.from({ length: 100 }, (_, index) => stock(index));
    fs.writeFileSync(path.join(directory, '2026-01-01-stock-results.json'), JSON.stringify({ date: '2026-01-01T12:00:00.000Z', count: 101, items }));
    assert.throws(() => buildHistoryData({ historyDir: directory }), /No valid history snapshots/);
  });
});