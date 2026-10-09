const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildUsHistoryData, readSnapshots, selectUniverse, trimPoint, validateArtifact, FIELDS } = require('./build-us-history-data');

const roots = [];
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

const STOCK_FIELDS = ['ticker', 'cotacao', 'dividend_yield', 'overall_score', 'signal', 'category', 'pl', 'p_vp', 'roe', 'market_cap', 'roic', 'liq_2meses', 'graham_price', 'bazin_price', 'payout', 'cresc_5a', 'sector'];
const REIT_FIELDS = ['ticker', 'price', 'dy', 'overall_score', 'signal', 'p_vp', 'p_fcf', 'market_cap', 'liquidity', 'sector'];
const ETF_FIELDS = ['ticker', 'price', 'dy', 'overall_score', 'signal', 'category', 'expense_ratio', 'aum', 'liquidity', 'asset_class'];

function fixture(dates, { stocks = 1000, reits = 50, etfs = 300 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'us-history-test-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'history-us'));
  for (const date of dates) {
    const snapshot = {
      date: `${date}T12:00:00.000Z`,
      economy: { fedFunds: 3.88, treasury10y: 4.5, dollar: 5 },
      fields: { stocks: STOCK_FIELDS, reits: REIT_FIELDS, etfs: ETF_FIELDS },
      stocks: Array.from({ length: stocks }, (_, i) => [`S${i}`, 100 + i, 2, 7, i === 0 ? 'TOP_PICK' : 'WATCHLIST', null, 20, 3, 15, (stocks - i) * 1e9, 12, 5e7, 120, 90, 40, 8, 'Technology']),
      reits: Array.from({ length: reits }, (_, i) => [`R${i}`, 50, 6, 7, 'WATCHLIST', 1.2, 14, (reits - i) * 1e9, 1e7, 'Finance']),
      etfs: Array.from({ length: etfs }, (_, i) => [`E${i}`, 400, 1.2, 9, 'TOP_PICK', i === 0 ? 'LEVERAGED' : 'CORE', 0.03, (etfs - i) * 1e9, 1e8, 'EQUITY'])
    };
    fs.writeFileSync(path.join(root, 'history-us', `${date}-us-results.json`), JSON.stringify(snapshot));
  }
  return root;
}

// Fake Yahoo/FRED: every ticker gets two prices before the first snapshot and one dividend.
const fakeFetch = async (url) => {
  if (url.includes('fred.stlouisfed.org')) {
    return { ok: true, text: async () => 'observation_date,DFF\n2026-09-30,4.1\n2026-10-01,4.0\n' };
  }
  return {
    ok: true,
    json: async () => ({
      chart: { result: [{
        timestamp: [Date.parse('2026-09-30T14:30:00Z') / 1000, Date.parse('2026-10-01T14:30:00Z') / 1000],
        indicators: { adjclose: [{ adjclose: [10, 11] }] },
        events: { dividends: { a: { date: Date.parse('2026-06-01T14:30:00Z') / 1000, amount: 0.5 } } }
      }] }
    })
  };
};

describe('US history builder', () => {
  test('reads positional snapshots by field name and aligns to the previous trading day', () => {
    const root = fixture(['2026-10-09']);
    const { snapshots, rejected } = readSnapshots(path.join(root, 'history-us'));
    assert.equal(rejected.length, 0);
    assert.equal(snapshots[0].date, '2026-10-08');
    assert.equal(snapshots[0].items.stocks[0].cotacao, 100);
    assert.equal(snapshots[0].items.reits[0].p_fcf, 14);
  });

  test('rejects snapshots with too few assets', () => {
    const root = fixture(['2026-10-09'], { stocks: 10 });
    const { snapshots, rejected } = readSnapshots(path.join(root, 'history-us'));
    assert.equal(snapshots.length, 0);
    assert.equal(rejected[0].reason, 'INSUFFICIENT_ITEMS');
  });

  test('tracks a bounded universe, skips leveraged ETFs and keeps benchmarks', () => {
    const root = fixture(['2026-10-09'], { stocks: 1200 });
    const { snapshots } = readSnapshots(path.join(root, 'history-us'));
    const tracked = selectUniverse(snapshots);
    assert.ok(tracked.stock.has('S0'));
    assert.ok(!tracked.stock.has('S1199'));
    assert.equal(tracked.stock.size, 250);
    assert.ok(!tracked.fund.has('E0'));
    assert.ok(tracked.fund.has('SPY') && tracked.fund.has('VNQ'));
  });

  test('trimPoint drops only trailing nulls', () => {
    assert.deepEqual(trimPoint([1, null, 2, null, null]), [1, null, 2]);
    assert.deepEqual(trimPoint([null]), []);
  });

  test('builds a valid artifact merging backfill and snapshots', async () => {
    const root = fixture(['2026-10-09', '2026-10-10']);
    const data = await buildUsHistoryData({ root, fetchImpl: fakeFetch, log: () => {} });
    assert.equal(validateArtifact(data), true);
    assert.equal(data.meta.market, 'US');
    assert.deepEqual(data.dates, ['2026-09-30', '2026-10-01', '2026-10-08', '2026-10-09']);
    const s0 = data.series.stock.S0;
    assert.deepEqual(s0.d, [0, 1, 2, 3]);
    assert.equal(s0.v[0][0], 10);
    assert.ok(s0.v[0][1] > 0, 'backfill carries a trailing dividend yield');
    assert.equal(s0.v[2][0], 100);
    assert.equal(s0.v[2][FIELDS.stock.indexOf('signal')], 'TOP_PICK');
    const reit = data.series.fund.R0.v.at(-1);
    assert.equal(reit[FIELDS.fund.indexOf('fundType')], 'REIT');
    assert.ok(Math.abs(reit[FIELDS.fund.indexOf('ffoYield')] - 100 / 14) < 1e-9);
    assert.equal(data.series.fund.E1.v.at(-1)[FIELDS.fund.indexOf('expenseRatio')], 0.03);
    assert.deepEqual(data.economy[0], [0, 4.1, 10]);
    assert.equal(data.meta.sectors.S0, 'Technology');
    assert.ok(fs.existsSync(path.join(root, 'history-us', 'cache-yahoo-prices.json')));
  });

  test('offline builds reuse the cache without network access', async () => {
    const root = fixture(['2026-10-09']);
    await buildUsHistoryData({ root, fetchImpl: fakeFetch, log: () => {} });
    const failingFetch = async () => { throw new Error('network disabled'); };
    const data = await buildUsHistoryData({ root, fetchImpl: failingFetch, offline: true, log: () => {} });
    assert.equal(data.series.stock.S0.v[0][0], 10);
  });
});
