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

function getActualTradingDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  const day = date.getUTCDay();
  if (day === 0) { // Sunday -> Friday
    date.setUTCDate(date.getUTCDate() - 2);
  } else if (day === 6) { // Saturday -> Friday
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().split('T')[0];
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
    const alignedDate = getActualTradingDate(date);
    snapshots.push({ file, date: alignedDate, type, payload, items });
  }
  return { snapshots, rejected };
}

function getTrailingYield(dateStr, price, dividends) {
  if (!price || price <= 0 || !dividends || dividends.length === 0) return 0;
  
  const currentDate = new Date(dateStr + 'T12:00:00Z');
  const oneYearAgo = new Date(currentDate);
  oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 365);
  
  let sum = 0;
  for (const div of dividends) {
    const divDate = new Date(div.date + 'T12:00:00Z');
    if (divDate >= oneYearAgo && divDate <= currentDate) {
      sum += div.amount;
    }
  }
  
  return Math.round((sum / price) * 100 * 100) / 100;
}

async function fetchYahooFinancePrices(tickers, isTest = false) {
  const cachePath = path.resolve(__dirname, '../history/cache-yahoo-prices.json');
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      for (const [ticker, val] of Object.entries(raw)) {
        if (val && typeof val === 'object' && (val.prices || ticker === '_selic')) {
          cache[ticker] = val;
        }
      }
    } catch (e) {
      console.warn('Could not parse cache-yahoo-prices.json, starting fresh:', e.message);
    }
  }

  if (isTest) {
    return cache;
  }

  let updated = false;
  // Fetch from 2018-01-01 (All-time limit for B3 coverage) up to 2026-03-15 (local start)
  const p1 = Math.floor(new Date('2018-01-01').getTime() / 1000);
  const p2 = Math.floor(new Date('2026-03-15').getTime() / 1000);

  // Handle Selic fetching
  if (!cache["_selic"]) {
    console.log('📡 Fetching historical Selic Meta from Banco Central...');
    try {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=01%2F01%2F2018&dataFinal=15%2F03%2F2026`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (response.ok) {
        const data = await response.json();
        const selicMap = {};
        for (const record of data) {
          if (record.data && record.valor) {
            const parts = record.data.split('/');
            const ymd = `${parts[2]}-${parts[1]}-${parts[0]}`;
            const val = parseFloat(record.valor);
            if (!isNaN(val)) {
              selicMap[ymd] = val;
            }
          }
        }
        cache["_selic"] = selicMap;
        updated = true;
      } else {
        console.warn(`⚠️ Failed to fetch Selic: ${response.status}`);
      }
    } catch (err) {
      console.error('❌ Error fetching Selic:', err.message);
    }
  }

  for (const ticker of tickers) {
    if (cache[ticker]) continue; // Cached

    const yahooTicker = ticker + '.SA';
    const isMacro = ticker === 'BRL=X';
    const finalTicker = isMacro ? ticker : yahooTicker;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${finalTicker}?period1=${p1}&period2=${p2}&interval=1d${isMacro ? '' : '&events=div,splits'}`;
    console.log(`📡 Fetching historical cotações for ${ticker} from Yahoo Finance...`);
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch Yahoo data for ${ticker}: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      const chartResult = data.chart?.result?.[0];
      if (chartResult && chartResult.timestamp) {
        const timestamps = chartResult.timestamp;
        const quotes = chartResult.indicators.quote?.[0] || {};
        const adjclose = chartResult.indicators.adjclose?.[0]?.adjclose || [];
        
        const prices = {};
        for (let i = 0; i < timestamps.length; i++) {
          const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const close = quotes.close?.[i];
          const adj = adjclose[i] ?? close;
          
          if (adj !== null && adj !== undefined && !isNaN(adj)) {
            prices[dateStr] = Math.round(adj * 100) / 100;
          }
        }

        // Parse dividends
        const dividends = [];
        if (!isMacro && chartResult.events?.dividends) {
          for (const d of Object.values(chartResult.events.dividends)) {
            const dateStr = new Date(d.date * 1000).toISOString().split('T')[0];
            if (d.amount !== null && d.amount !== undefined && !isNaN(d.amount)) {
              dividends.push({ date: dateStr, amount: d.amount });
            }
          }
        }
        
        cache[ticker] = { prices, dividends };
        updated = true;
        
        // Politeness delay
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.warn(`⚠️ No chart data returned for ${ticker}`);
      }
    } catch (err) {
      console.error(`❌ Error fetching Yahoo data for ${ticker}:`, err.message);
    }
  }

  if (updated) {
    try {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log('✅ cache-yahoo-prices.json updated successfully.');
    } catch (e) {
      console.error('Failed to write cache-yahoo-prices.json:', e.message);
    }
  }

  return cache;
}

async function buildHistoryData(options = {}) {
  const historyDir = path.resolve(options.historyDir || 'history');
  const { snapshots, rejected } = readSnapshots(historyDir);
  if (!snapshots.length) throw new Error('No valid history snapshots were found.');

  // 1. Identify unique tickers
  const tickers = new Set();
  const tickerTypes = {};
  for (const snapshot of snapshots) {
    for (const item of snapshot.items) {
      const ticker = textOrNull(item.ticker);
      if (ticker) {
        tickers.add(ticker);
        tickerTypes[ticker] = snapshot.type;
      }
    }
  }

  // Add Dollar ticker to Yahoo fetch list
  const fetchTickers = [...tickers];
  if (!fetchTickers.includes('BRL=X')) {
    fetchTickers.push('BRL=X');
  }

  // 2. Fetch Yahoo Finance historical prices & dividends & Selic
  const isTest = process.env.NODE_ENV === 'test' || options.isTest || false;
  const yahooCache = await fetchYahooFinancePrices(fetchTickers, isTest);

  // 3. Collect all dates
  const localDates = snapshots.map(snapshot => snapshot.date);
  const yahooDates = [];
  for (const ticker of tickers) {
    if (yahooCache[ticker] && yahooCache[ticker].prices) {
      yahooDates.push(...Object.keys(yahooCache[ticker].prices));
    }
  }
  const allDates = [...new Set([...yahooDates, ...localDates])].sort();
  const dateIndex = new Map(allDates.map((date, index) => [date, index]));

  const seriesMaps = { stock: new Map(), fund: new Map() };
  const economyByDate = new Map();
  const acceptedByType = { stock: 0, fund: 0 };

  // Populate economy data from historical caches
  const selicData = yahooCache["_selic"] || {};
  const dollarData = yahooCache["BRL=X"]?.prices || {};
  const allEconomyDates = [...new Set([...Object.keys(selicData), ...Object.keys(dollarData)])];
  
  for (const dateStr of allEconomyDates) {
    const sVal = selicData[dateStr];
    const dVal = dollarData[dateStr];
    
    economyByDate.set(dateStr, {
      selic: sVal !== undefined ? sVal : null,
      dollar: dVal !== undefined ? dVal : null
    });
  }

  // 4. Populate Yahoo Finance prices & dividends (pre-local snapshots)
  for (const ticker of tickers) {
    const type = tickerTypes[ticker];
    const dataEntry = yahooCache[ticker] || {};
    const prices = dataEntry.prices || {};
    const dividends = dataEntry.dividends || [];
    
    for (const [dateStr, price] of Object.entries(prices)) {
      const index = dateIndex.get(dateStr);
      if (index === undefined) continue;
      
      if (!seriesMaps[type].has(ticker)) {
        seriesMaps[type].set(ticker, new Map());
      }
      
      const width = FIELD_DEFINITIONS[type].length;
      const point = new Array(width).fill(null);
      
      // Calculate daily trailing dividend yield
      const dy = getTrailingYield(dateStr, price, dividends);
      
      point[0] = price; // set price
      point[1] = dy;    // set dynamic trailing yield
      
      seriesMaps[type].get(ticker).set(index, point);
    }
  }

  // 5. Populate local snapshots (overwrites Yahoo Finance on overlap)
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
      if (!seriesMaps[snapshot.type].has(ticker)) {
        seriesMaps[snapshot.type].set(ticker, new Map());
      }
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
    .filter(([date]) => dateIndex.has(date))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => [dateIndex.get(date), value.selic, value.dollar]);
  
  const latestTimestamp = snapshots
    .map(snapshot => snapshot.payload.date)
    .filter(value => typeof value === 'string')
    .sort().at(-1) || `${allDates.at(-1)}T00:00:00.000Z`;

  const result = {
    meta: {
      version: 1,
      generatedAt: latestTimestamp,
      range: { from: allDates[0], to: allDates.at(-1) },
      sourceFiles: snapshots.length + rejected.length,
      accepted: acceptedByType,
      rejected,
      assets: { stock: Object.keys(series.stock).length, fund: Object.keys(series.fund).length }
    },
    fields: FIELD_DEFINITIONS,
    dates: allDates,
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

async function main() {
  const outputPath = path.resolve('history-data.js');
  const data = await buildHistoryData();
  const content = serialize(data);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== content) {
      throw new Error('history-data.js is missing or stale. Run npm run build:history.');
    }
    console.log('History data artifact is valid and up to date.');
    return;
  }
  fs.writeFileSync(outputPath, content);
  console.log(`History data generated: ${data.dates.length} dates, ${data.meta.assets.stock} stocks, ${data.meta.assets.fund} funds, ${data.meta.rejected.length} rejected snapshots.`);
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { buildHistoryData, validateArtifact, normalizePoint, finiteOrNull, serialize, CONFIG, FIELD_DEFINITIONS, getActualTradingDate, getTrailingYield };