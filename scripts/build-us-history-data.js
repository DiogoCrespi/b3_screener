'use strict';
// Builds us-history-data.js for history-dashboard-us.html from the daily
// history-us/ snapshots plus a Yahoo Finance price backfill, in the same shape
// as history-data.js so the shared dashboard script can read both markets.
const fs = require('fs');
const path = require('path');
const { FIELD_DEFINITIONS, getActualTradingDate, getTrailingYield } = require('./build-history-data');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_FILE = /^(\d{4}-\d{2}-\d{2})-us-results\.json$/;
const BACKFILL_START = '2023-10-01';
const FRED_DFF_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF&cosd=';

const FIELDS = Object.freeze({
  stock: FIELD_DEFINITIONS.stock,
  fund: [...FIELD_DEFINITIONS.fund, 'expenseRatio']
});

// The dashboard tracks a bounded universe: all 5k assets for years would not fit a
// static page. Once a ticker enters it on any day it keeps its series.
const UNIVERSE = Object.freeze({ stocks: 250, largeTopPickCap: 10e9, reits: 60, etfs: 200 });
const BENCHMARKS = Object.freeze(['SPY', 'QQQ', 'VNQ', 'SCHD', 'BND']);
const MIN_ITEMS = Object.freeze({ stocks: 1000, reits: 50, etfs: 300 });

const finiteOrNull = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const textOrNull = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Snapshots store positional rows; fields are read by name since columns were added over time.
function rowsToItems(snapshot, key) {
  const fields = snapshot.fields?.[key] || [];
  return (snapshot[key] || []).map(row => Object.fromEntries(fields.map((field, i) => [field, row[i]])));
}

function readSnapshots(dir) {
  const snapshots = [];
  const rejected = [];
  if (!fs.existsSync(dir)) return { snapshots, rejected };
  for (const file of fs.readdirSync(dir).sort()) {
    const match = file.match(SNAPSHOT_FILE);
    if (!match) continue;
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (error) {
      rejected.push({ file, date: match[1], type: 'stock', reason: 'INVALID_JSON' });
      continue;
    }
    const items = { stocks: rowsToItems(payload, 'stocks'), reits: rowsToItems(payload, 'reits'), etfs: rowsToItems(payload, 'etfs') };
    // Sections served from cache are empty on purpose (see saveUsHistory); a snapshot
    // still counts when the other sections are complete.
    const short = Object.entries(MIN_ITEMS).filter(([key, min]) => items[key].length > 0 && items[key].length < min);
    if (short.length || (!items.stocks.length && !items.etfs.length)) {
      rejected.push({ file, date: match[1], type: 'stock', reason: 'INSUFFICIENT_ITEMS', count: items.stocks.length, minimum: MIN_ITEMS.stocks });
      continue;
    }
    snapshots.push({ file, date: getActualTradingDate(match[1]), payload, items });
  }
  return { snapshots, rejected };
}

const byDesc = key => (a, b) => (b[key] || 0) - (a[key] || 0);

function selectUniverse(snapshots) {
  const tracked = { stock: new Set(), fund: new Set() };
  for (const { items } of snapshots) {
    [...items.stocks].sort(byDesc('market_cap')).slice(0, UNIVERSE.stocks).forEach(s => tracked.stock.add(s.ticker));
    items.stocks.filter(s => s.signal === 'TOP_PICK' && s.market_cap >= UNIVERSE.largeTopPickCap).forEach(s => tracked.stock.add(s.ticker));
    [...items.reits].sort(byDesc('market_cap')).slice(0, UNIVERSE.reits).forEach(r => tracked.fund.add(r.ticker));
    items.etfs.filter(e => e.category !== 'LEVERAGED').sort(byDesc('aum')).slice(0, UNIVERSE.etfs).forEach(e => tracked.fund.add(e.ticker));
  }
  BENCHMARKS.forEach(ticker => tracked.fund.add(ticker));
  return tracked;
}

const ETF_CATEGORY_LABELS = Object.freeze({
  CORE: 'Mercado amplo', DIVIDEND: 'Dividendos', INTERNATIONAL: 'Internacional', SECTOR_THEME: 'Setor/Tema',
  BOND: 'Renda fixa', COMMODITY: 'Commodities', LEVERAGED: 'Alavancado/Inverso'
});

function stockPoint(s) {
  return [
    finiteOrNull(s.cotacao), finiteOrNull(s.dividend_yield), finiteOrNull(s.overall_score), finiteOrNull(s.p_vp),
    textOrNull(s.signal), textOrNull(s.category), finiteOrNull(s.roe), finiteOrNull(s.roic), finiteOrNull(s.liq_2meses),
    finiteOrNull(s.graham_price), finiteOrNull(s.bazin_price), finiteOrNull(s.payout), finiteOrNull(s.cresc_5a)
  ];
}

// Fund fields: price, dy, score, pvp, signal, category, liquidity, marketCap, vacancy,
// ffoYield (FCF yield for REITs), capRate, fundType, exposure, expenseRatio.
function reitPoint(r) {
  const fcfYield = r.p_fcf > 0 ? 100 / r.p_fcf : null;
  return [
    finiteOrNull(r.price), finiteOrNull(r.dy), finiteOrNull(r.overall_score), finiteOrNull(r.p_vp),
    textOrNull(r.signal), 'REIT', finiteOrNull(r.liquidity), finiteOrNull(r.market_cap),
    null, finiteOrNull(fcfYield), null, 'REIT', textOrNull(r.sector), null
  ];
}

function etfPoint(e) {
  return [
    finiteOrNull(e.price), finiteOrNull(e.dy), finiteOrNull(e.overall_score), null,
    textOrNull(e.signal), ETF_CATEGORY_LABELS[e.category] || textOrNull(e.category), finiteOrNull(e.liquidity), finiteOrNull(e.aum),
    null, null, null, 'ETF', ETF_CATEGORY_LABELS[e.category] || null, finiteOrNull(e.expense_ratio)
  ];
}

// Trailing nulls are dropped to keep the static artifact small; the dashboard reads
// a missing position as "no value".
function trimPoint(point) {
  let end = point.length;
  while (end > 0 && point[end - 1] === null) end--;
  return point.slice(0, end);
}

const toYahoo = ticker => ticker.replace(/\./g, '-');

// Prices start at `from`; the request reaches one year earlier so the trailing
// 12-month dividend yield is already complete on the first backfilled day.
const DIVIDEND_LOOKBACK_DAYS = 366;

async function fetchYahoo(ticker, from, to, { fetchImpl = fetch, withDividends = true } = {}) {
  const p1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) - DIVIDEND_LOOKBACK_DAYS * 86400;
  const p2 = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahoo(ticker))}?period1=${p1}&period2=${p2}&interval=1d${withDividends ? '&events=div' : ''}`;
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  const result = (await response.json()).chart?.result?.[0];
  if (!result?.timestamp) throw new Error('no chart data');
  const closes = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
  const prices = {};
  result.timestamp.forEach((ts, i) => {
    const date = new Date(ts * 1000).toISOString().split('T')[0];
    if (date >= from && Number.isFinite(closes[i])) prices[date] = Math.round(closes[i] * 100) / 100;
  });
  const dividends = Object.values(result.events?.dividends || {})
    .filter(d => Number.isFinite(d.amount))
    .map(d => ({ date: new Date(d.date * 1000).toISOString().split('T')[0], amount: d.amount }));
  return { prices, dividends };
}

async function fetchFedFundsHistory(from, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(FRED_DFF_URL + from, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);
  const map = {};
  for (const line of (await response.text()).trim().split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',');
    const value = parseFloat(raw);
    if (date && Number.isFinite(value)) map[date] = value;
  }
  return map;
}

/**
 * Fills the backfill cache for tickers that are not in it yet. Only missing
 * entries are fetched, so a daily run costs a handful of requests.
 */
async function updateBackfillCache(cache, tickers, backfillEnd, { fetchImpl = fetch, delayMs = 150, log = console.log } = {}) {
  let updated = false;
  if (!cache._fedfunds) {
    try {
      cache._fedfunds = await fetchFedFundsHistory(BACKFILL_START, { fetchImpl });
      updated = true;
    } catch (error) {
      log(`⚠️  Fed Funds history unavailable: ${error.message}`);
    }
  }
  const missing = ['BRL=X', ...tickers].filter(ticker => !cache[ticker]);
  if (missing.length) log(`📡 Backfilling ${missing.length} US tickers from Yahoo (${BACKFILL_START} → ${backfillEnd})...`);
  for (const ticker of missing) {
    try {
      cache[ticker] = await fetchYahoo(ticker, BACKFILL_START, backfillEnd, { fetchImpl, withDividends: ticker !== 'BRL=X' });
      updated = true;
    } catch (error) {
      // Recorded as empty so a delisted ticker is not retried every day.
      cache[ticker] = { prices: {}, dividends: [], error: error.message };
      updated = true;
    }
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return updated;
}

function buildArtifact({ snapshots, rejected, cache }) {
  if (!snapshots.length) throw new Error('No valid US history snapshots were found.');
  const tracked = selectUniverse(snapshots);
  const firstLocal = snapshots[0].date;

  const dateSet = new Set(snapshots.map(s => s.date));
  for (const type of ['stock', 'fund']) {
    for (const ticker of tracked[type]) {
      Object.keys(cache[ticker]?.prices || {}).filter(date => date < firstLocal).forEach(date => dateSet.add(date));
    }
  }
  const dates = [...dateSet].sort();
  const dateIndex = new Map(dates.map((date, i) => [date, i]));
  const series = { stock: new Map(), fund: new Map() };
  const put = (type, ticker, date, point) => {
    if (!series[type].has(ticker)) series[type].set(ticker, new Map());
    series[type].get(ticker).set(dateIndex.get(date), trimPoint(point));
  };

  // Backfill: price and trailing dividend yield only, before the first local snapshot.
  for (const type of ['stock', 'fund']) {
    for (const ticker of tracked[type]) {
      const { prices = {}, dividends = [] } = cache[ticker] || {};
      for (const [date, price] of Object.entries(prices)) {
        if (date >= firstLocal || !dateIndex.has(date)) continue;
        const point = new Array(FIELDS[type].length).fill(null);
        point[0] = price;
        point[1] = getTrailingYield(date, price, dividends);
        put(type, ticker, date, point);
      }
    }
  }

  const sectors = {};
  const names = {};
  const economyByDate = new Map();
  for (const date of dates) {
    if (date >= firstLocal) continue;
    const fed = cache._fedfunds?.[date];
    const dollar = cache['BRL=X']?.prices?.[date];
    if (Number.isFinite(fed) || Number.isFinite(dollar)) economyByDate.set(date, [finiteOrNull(fed), finiteOrNull(dollar)]);
  }

  for (const { date, payload, items } of snapshots) {
    economyByDate.set(date, [finiteOrNull(payload.economy?.fedFunds), finiteOrNull(payload.economy?.dollar)]);
    for (const s of items.stocks) {
      if (!tracked.stock.has(s.ticker)) continue;
      put('stock', s.ticker, date, stockPoint(s));
      if (s.sector) sectors[s.ticker] = s.sector;
    }
    for (const r of items.reits) {
      if (!tracked.fund.has(r.ticker)) continue;
      put('fund', r.ticker, date, reitPoint(r));
      sectors[r.ticker] = 'REIT';
    }
    for (const e of items.etfs) {
      if (!tracked.fund.has(e.ticker)) continue;
      put('fund', e.ticker, date, etfPoint(e));
      sectors[e.ticker] = `ETF · ${ETF_CATEGORY_LABELS[e.category] || e.category || 'Outros'}`;
    }
  }

  const out = { stock: {}, fund: {} };
  for (const type of ['stock', 'fund']) {
    for (const ticker of [...series[type].keys()].sort()) {
      const entries = [...series[type].get(ticker).entries()].sort((a, b) => a[0] - b[0]);
      out[type][ticker] = { d: entries.map(([i]) => i), v: entries.map(([, v]) => v) };
    }
  }

  const latest = snapshots.at(-1);
  return {
    meta: {
      version: 1,
      market: 'US',
      generatedAt: latest.payload.date || `${latest.date}T00:00:00.000Z`,
      range: { from: dates[0], to: dates.at(-1) },
      localStart: firstLocal,
      // Each US file holds both classes, so it counts once per class like the B3 pair of files.
      sourceFiles: 2 * (snapshots.length + rejected.length),
      accepted: { stock: snapshots.length, fund: snapshots.length },
      rejected,
      assets: { stock: Object.keys(out.stock).length, fund: Object.keys(out.fund).length },
      sectors
    },
    fields: FIELDS,
    dates,
    economy: [...economyByDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, [fed, dollar]]) => [dateIndex.get(date), fed, dollar]),
    series: out
  };
}

function validateArtifact(data) {
  if (data.meta.version !== 1 || !data.dates.length) throw new Error('Invalid US history artifact metadata.');
  for (const type of ['stock', 'fund']) {
    const width = data.fields[type].length;
    for (const [ticker, entry] of Object.entries(data.series[type])) {
      if (entry.d.length !== entry.v.length) throw new Error(`${type}:${ticker} has misaligned dates and values.`);
      let previous = -1;
      entry.d.forEach((index, position) => {
        const point = entry.v[position];
        if (!Number.isInteger(index) || index <= previous || !data.dates[index]) throw new Error(`${type}:${ticker} has invalid date indexes.`);
        if (!Array.isArray(point) || point.length > width) throw new Error(`${type}:${ticker} has an invalid point width.`);
        if (point.some(value => typeof value === 'number' && !Number.isFinite(value))) throw new Error(`${type}:${ticker} contains a non-finite number.`);
        previous = index;
      });
    }
  }
  return true;
}

const serialize = data => `window.US_HISTORY_DATA = ${JSON.stringify(data)};\n`;

async function buildUsHistoryData({ root = ROOT, fetchImpl = fetch, offline = false, log = console.log } = {}) {
  const { snapshots, rejected } = readSnapshots(path.join(root, 'history-us'));
  const cachePath = path.join(root, 'history-us', 'cache-yahoo-prices.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* first run */ }

  if (!offline && snapshots.length) {
    const tracked = selectUniverse(snapshots);
    const updated = await updateBackfillCache(cache, [...tracked.stock, ...tracked.fund], snapshots[0].date, { fetchImpl, log });
    if (updated) fs.writeFileSync(cachePath, JSON.stringify(cache));
  }
  const data = buildArtifact({ snapshots, rejected, cache });
  validateArtifact(data);
  return data;
}

async function main() {
  const outputPath = path.join(ROOT, 'us-history-data.js');
  const data = await buildUsHistoryData({ offline: process.argv.includes('--offline') });
  fs.writeFileSync(outputPath, serialize(data));
  const kb = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`US history generated: ${data.dates.length} dates, ${data.meta.assets.stock} stocks, ${data.meta.assets.fund} REITs/ETFs, ${kb} KB.`);
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { buildUsHistoryData, buildArtifact, readSnapshots, selectUniverse, rowsToItems, trimPoint, validateArtifact, serialize, FIELDS };
