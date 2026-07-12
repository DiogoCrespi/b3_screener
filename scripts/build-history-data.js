const fs = require('fs');
const path = require('path');

const HISTORY_FILE = /^(\d{4}-\d{2}-\d{2})-(stock|fii)-results\.json$/;
const CONFIG = Object.freeze({ stock: { minItems: 100 }, fund: { minItems: 50 } });
const FIELD_DEFINITIONS = Object.freeze({
  stock: ['price', 'dy', 'score', 'pvp', 'signal', 'category', 'roe', 'roic', 'liquidity', 'graham', 'bazin', 'payout', 'growth'],
  fund: ['price', 'dy', 'score', 'pvp', 'signal', 'category', 'liquidity', 'marketCap', 'vacancy', 'ffoYield', 'capRate', 'fundType', 'exposure']
});

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePoint(item, type) {
  if (type === 'stock') {
    return [
      finiteOrNull(item.cotacao), finiteOrNull(item.dividend_yield),
      finiteOrNull(item.overall_score ?? item.score), finiteOrNull(item.p_vp),
      textOrNull(item.signal), textOrNull(item.category), finiteOrNull(item.roe),
      finiteOrNull(item.roic), finiteOrNull(item.liq_2meses), finiteOrNull(item.graham_price),
      finiteOrNull(item.bazin_price), finiteOrNull(item.payout), finiteOrNull(item.cresc_5a)
    ];
  }
  return [
    finiteOrNull(item.price), finiteOrNull(item.dy),
    finiteOrNull(item.overall_score ?? item.score), finiteOrNull(item.p_vp),
    textOrNull(item.signal), textOrNull(item.category), finiteOrNull(item.liquidity),
    finiteOrNull(item.market_cap), finiteOrNull(item.vacancy), finiteOrNull(item.ffo_yield),
    finiteOrNull(item.cap_rate), textOrNull(item.type), textOrNull(item.exposure)
  ];
}

function readSnapshots(historyDir) {
  const snapshots = [];
  const rejected = [];
  for (const file of fs.readdirSync(historyDir).sort()) {
    const match = file.match(HISTORY_FILE);
    if (!match) continue;
    const [, date, sourceType] = match;
    const type = sourceType === 'fii' ? 'fund' : 'stock';
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
    } catch (error) {
      rejected.push({ file, date, type, reason: 'INVALID_JSON', detail: error.message });
      continue;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length < CONFIG[type].minItems) {
      rejected.push({ file, date, type, reason: 'INSUFFICIENT_ITEMS', count: items.length, minimum: CONFIG[type].minItems });
      continue;
    }
    if (payload.count !== undefined && payload.count !== items.length) {
      rejected.push({ file, date, type, reason: 'COUNT_MISMATCH', count: items.length, declared: payload.count });
      continue;
    }
    snapshots.push({ file, date, type, payload, items });
  }
  return { snapshots, rejected };
}

function buildHistoryData(options = {}) {
  const historyDir = path.resolve(options.historyDir || 'history');
  const { snapshots, rejected } = readSnapshots(historyDir);
  if (!snapshots.length) throw new Error('No valid history snapshots were found.');

  const dates = [...new Set(snapshots.map(snapshot => snapshot.date))].sort();
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const seriesMaps = { stock: new Map(), fund: new Map() };
  const economyByDate = new Map();
  const acceptedByType = { stock: 0, fund: 0 };

  for (const snapshot of snapshots) {
    acceptedByType[snapshot.type]++;
    const economy = snapshot.payload.economy || {};
    const currentEconomy = economyByDate.get(snapshot.date) || { selic: null, dollar: null };
    economyByDate.set(snapshot.date, {
      selic: finiteOrNull(economy.selic) ?? currentEconomy.selic,
      dollar: finiteOrNull(economy.dollar) ?? currentEconomy.dollar
    });
    const index = dateIndex.get(snapshot.date);
    for (const item of snapshot.items) {
      const ticker = textOrNull(item.ticker);
      if (!ticker) continue;
      if (!seriesMaps[snapshot.type].has(ticker)) seriesMaps[snapshot.type].set(ticker, new Map());
      seriesMaps[snapshot.type].get(ticker).set(index, normalizePoint(item, snapshot.type));
    }
  }

  const series = { stock: {}, fund: {} };
  for (const type of ['stock', 'fund']) {
    for (const ticker of [...seriesMaps[type].keys()].sort()) {
      const entries = [...seriesMaps[type].get(ticker).entries()].sort((a, b) => a[0] - b[0]);
      series[type][ticker] = {
        d: entries.map(([index]) => index),
        v: entries.map(([, values]) => values)
      };
    }
  }

  const economy = [...economyByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => [dateIndex.get(date), value.selic, value.dollar]);
  const latestTimestamp = snapshots
    .map(snapshot => snapshot.payload.date)
    .filter(value => typeof value === 'string')
    .sort().at(-1) || `${dates.at(-1)}T00:00:00.000Z`;

  const result = {
    meta: {
      version: 1,
      generatedAt: latestTimestamp,
      range: { from: dates[0], to: dates.at(-1) },
      sourceFiles: snapshots.length + rejected.length,
      accepted: acceptedByType,
      rejected,
      assets: { stock: Object.keys(series.stock).length, fund: Object.keys(series.fund).length }
    },
    fields: FIELD_DEFINITIONS,
    dates,
    economy,
    series
  };
  validateArtifact(result);
  return result;
}

function validateArtifact(data) {
  if (data.meta.version !== 1 || !data.dates.length) throw new Error('Invalid history artifact metadata.');
  for (const type of ['stock', 'fund']) {
    const width = data.fields[type].length;
    for (const [ticker, entry] of Object.entries(data.series[type])) {
      if (entry.d.length !== entry.v.length) throw new Error(`${type}:${ticker} has misaligned dates and values.`);
      let previous = -1;
      entry.d.forEach((index, position) => {
        if (!Number.isInteger(index) || index <= previous || !data.dates[index]) throw new Error(`${type}:${ticker} has invalid date indexes.`);
        if (!Array.isArray(entry.v[position]) || entry.v[position].length !== width) throw new Error(`${type}:${ticker} has an invalid point width.`);
        if (entry.v[position].some(value => typeof value === 'number' && !Number.isFinite(value))) throw new Error(`${type}:${ticker} contains a non-finite number.`);
        previous = index;
      });
    }
  }
  return true;
}

function serialize(data) {
  return `window.B3_HISTORY_DATA = ${JSON.stringify(data)};\n`;
}

function main() {
  const outputPath = path.resolve('history-data.js');
  const content = serialize(buildHistoryData());
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== content) {
      throw new Error('history-data.js is missing or stale. Run npm run build:history.');
    }
    console.log('History data artifact is valid and up to date.');
    return;
  }
  fs.writeFileSync(outputPath, content);
  const data = buildHistoryData();
  console.log(`History data generated: ${data.dates.length} dates, ${data.meta.assets.stock} stocks, ${data.meta.assets.fund} funds, ${data.meta.rejected.length} rejected snapshots.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildHistoryData, validateArtifact, normalizePoint, finiteOrNull, serialize, CONFIG, FIELD_DEFINITIONS };