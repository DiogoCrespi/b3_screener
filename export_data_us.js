const fs = require('fs');
const path = require('path');
const { getDollarRate } = require('./services/economy');
const { getFedFundsRate, getTreasury10y } = require('./services/us/economy');
const { fetchUsStocks, fetchUsReits, fetchUsEtfs } = require('./services/us/tradingview');
const { fetchNasdaqStockQuotes, fetchNasdaqEtfQuotes } = require('./services/us/nasdaq');
const { repriceStocks, repriceEtfs } = require('./services/us/reprice');
const { analyzeReit, analyzeEtf, bySignalThenScore } = require('./services/us/fund-rules');
const { analyzeStock } = require('./services/logic/stock-rules');
const { demoteDuplicateIssuerRecommendations } = require('./services/stocks');
const { rankSection, pickTop } = require('./services/us/ranking');

const OUTPUT_FILE = path.join(__dirname, 'data-us.js');
const HISTORY_DIR = path.join(__dirname, 'history-us');

const MIN_STOCK_DOLLAR_VOLUME = 1e6;
const MIN_FUND_DOLLAR_VOLUME = 500e3;
// Minimum analysed counts for a section to be accepted from a live source.
const MINIMUMS = Object.freeze({ stocks: 1000, reits: 50, etfs: 300 });
// Share of yesterday's assets that must be found in Nasdaq's listing to trust a reprice.
const MIN_REPRICE_COVERAGE = 0.8;

const countBy = (items, selector) => items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
}, {});

// Per-item provenance is identical for the whole section; keep it once in `source`.
const stripProvenance = ({ data_source, collected_at, ...rest }) => rest;

function round(value, digits = 4) {
    return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function compactNumbers(item) {
    const out = {};
    for (const [key, value] of Object.entries(item)) out[key] = round(value);
    return out;
}

const finalize = items => items.map(item => compactNumbers(stripProvenance(item)));

function analyzeStocks(stocks, fedFunds) {
    const analyzed = stocks
        .filter(s => s.liq_2meses > MIN_STOCK_DOLLAR_VOLUME)
        .map(s => analyzeStock(s, fedFunds, { market: 'US' }))
        .filter(s => s.signal !== 'INSUFFICIENT_DATA')
        .sort(bySignalThenScore);
    return finalize(rankSection(demoteDuplicateIssuerRecommendations(analyzed), 'stocks').sort(bySignalThenScore));
}

function analyzeReits(reits, treasury10y) {
    const analyzed = reits.filter(r => r.liq_2meses > MIN_FUND_DOLLAR_VOLUME).map(r => analyzeReit(r, treasury10y));
    return finalize(rankSection(analyzed, 'reits').sort(bySignalThenScore));
}

function analyzeEtfs(etfs) {
    return finalize(rankSection(etfs.filter(e => e.liquidity > MIN_FUND_DOLLAR_VOLUME).map(analyzeEtf), 'etfs').sort(bySignalThenScore));
}

// Home-screen Top 10 per section: best TOP_PICKs, at most two per sector/category.
function buildHighlights(sections) {
    return { stocks: pickTop(sections.stocks, 'stocks'), reits: pickTop(sections.reits, 'reits', 10, 10), etfs: pickTop(sections.etfs, 'etfs') };
}

function buildUsData({ fedFunds, treasury10y, dollar, stocks, reits, etfs }) {
    return {
        market: 'US',
        currency: 'USD',
        updatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        source: { provider: 'tradingview', collectedAt: new Date().toISOString() },
        economy: { fedFunds, treasury10y, dollar },
        ...withHighlights({ stocks: analyzeStocks(stocks, fedFunds), reits: analyzeReits(reits, treasury10y), etfs: analyzeEtfs(etfs) })
    };
}

const withHighlights = sections => ({ ...sections, highlights: buildHighlights(sections) });

function loadPreviousData(file = OUTPUT_FILE) {
    try {
        const src = fs.readFileSync(file, 'utf8');
        return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
    } catch {
        return null;
    }
}

/**
 * Tries each provider in order and returns the first result accepted by `isValid`.
 * A provider that throws or returns too little data falls through to the next one.
 */
async function firstValid(label, providers, isValid) {
    for (const [name, load] of providers) {
        try {
            const value = await load();
            if (isValid(value)) {
                console.log(`✅ ${label}: ${name}`);
                return { value, provider: name };
            }
            console.warn(`⚠️  ${label}: ${name} returned insufficient data, trying next source...`);
        } catch (error) {
            console.warn(`⚠️  ${label}: ${name} failed (${error.message}), trying next source...`);
        }
    }
    return null;
}

const SECTION_KEYS = ['stocks', 'reits', 'etfs'];

/**
 * Collects every US section with redundancy:
 *   1. TradingView: fresh fundamentals and prices for everything (one request per section).
 *   2. Nasdaq: today's prices applied to the last good fundamentals (see reprice.js).
 *   3. Last good data as-is, flagged stale.
 * Rates go FRED -> NY Fed / Treasury.gov (economy service) -> last good value.
 */
async function collectUsData({ previous = loadPreviousData(), sources = {} } = {}) {
    const src = {
        tvEquities: () => Promise.all([fetchUsStocks(), fetchUsReits()]).then(([stocks, reits]) => ({ stocks, reits })),
        tvEtfs: fetchUsEtfs,
        nasdaqStockQuotes: fetchNasdaqStockQuotes,
        nasdaqEtfQuotes: fetchNasdaqEtfQuotes,
        fedFunds: getFedFundsRate,
        treasury10y: getTreasury10y,
        dollar: getDollarRate,
        ...sources
    };
    const now = new Date().toISOString();
    const prevSections = previous?.source?.sections || {};
    const prevCollectedAt = (key) => prevSections[key]?.fundamentalsSince || prevSections[key]?.collectedAt || previous?.source?.collectedAt || null;
    const sections = {};

    const [fedLive, t10Live, dollarLive] = await Promise.all([src.fedFunds(), src.treasury10y(), src.dollar()]);
    const pickRate = (key, live) => {
        if (Number.isFinite(live)) return live;
        const last = previous?.economy?.[key];
        if (Number.isFinite(last)) {
            console.warn(`⚠️  ${key}: all sources failed, reusing last value ${last}`);
            sections[key] = { provider: 'cache', stale: true, since: prevCollectedAt(key) };
            return last;
        }
        return null;
    };
    const economy = { fedFunds: pickRate('fedFunds', fedLive), treasury10y: pickRate('treasury10y', t10Live), dollar: pickRate('dollar', dollarLive) };
    if (economy.fedFunds === null) throw new Error('Fed Funds rate unavailable from every source and no previous value exists.');

    // Each provider resolves to analysed sections; Nasdaq quotes are fetched at most once.
    let stockQuotes;
    let etfQuotes;
    const reprice = (key, quotesLoader, repriceFn, analyze) => async () => {
        if (!Array.isArray(previous?.[key]) || previous[key].length === 0) throw new Error('no previous fundamentals to reprice');
        const { items, coverage } = repriceFn(previous[key], await quotesLoader());
        if (coverage < MIN_REPRICE_COVERAGE) throw new Error(`only ${(coverage * 100).toFixed(0)}% of assets found in Nasdaq listing`);
        return analyze(items);
    };
    const loadStockQuotes = () => (stockQuotes ??= src.nasdaqStockQuotes());
    const loadEtfQuotes = () => (etfQuotes ??= src.nasdaqEtfQuotes());

    const result = {};
    const providerMeta = (key, provider) => provider === 'tradingview'
        ? { provider, stale: false, collectedAt: now }
        : { provider, stale: false, collectedAt: now, fundamentalsSince: prevCollectedAt(key) };

    const equities = await firstValid('US stocks/REITs', [
        ['tradingview', async () => {
            const { stocks, reits } = await src.tvEquities();
            return { stocks: analyzeStocks(stocks, economy.fedFunds), reits: analyzeReits(reits, economy.treasury10y) };
        }],
        ['nasdaq', async () => ({
            stocks: await reprice('stocks', loadStockQuotes, repriceStocks, items => analyzeStocks(items, economy.fedFunds))(),
            reits: await reprice('reits', loadStockQuotes, repriceStocks, items => analyzeReits(items, economy.treasury10y))()
        })]
    ], value => value.stocks.length >= MINIMUMS.stocks && value.reits.length >= MINIMUMS.reits);
    if (equities) {
        Object.assign(result, equities.value);
        sections.stocks = providerMeta('stocks', equities.provider);
        sections.reits = providerMeta('reits', equities.provider);
    }

    const etfs = await firstValid('US ETFs', [
        ['tradingview', async () => analyzeEtfs(await src.tvEtfs())],
        ['nasdaq', reprice('etfs', loadEtfQuotes, repriceEtfs, analyzeEtfs)]
    ], value => value.length >= MINIMUMS.etfs);
    if (etfs) {
        result.etfs = etfs.value;
        sections.etfs = providerMeta('etfs', etfs.provider);
    }

    for (const key of SECTION_KEYS) {
        if (result[key]) continue;
        if (!Array.isArray(previous?.[key]) || previous[key].length === 0) {
            throw new Error(`US ${key}: every source failed and there is no previous data to fall back on.`);
        }
        console.warn(`⚠️  US ${key}: every live source failed, keeping last good data.`);
        result[key] = previous[key];
        sections[key] = { provider: 'cache', stale: true, since: prevCollectedAt(key) };
    }

    const liveSections = SECTION_KEYS.filter(key => !sections[key].stale);
    return {
        market: 'US',
        currency: 'USD',
        updatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        source: {
            provider: [...new Set(liveSections.map(key => sections[key].provider))].join('+') || 'cache',
            collectedAt: now,
            sections,
            degraded: Object.values(sections).some(s => s.stale || s.provider !== 'tradingview')
        },
        economy,
        ...withHighlights({ stocks: result.stocks, reits: result.reits, etfs: result.etfs })
    };
}

// Compact daily snapshot: positional rows keep the US history small enough for git.
function saveUsHistory(data) {
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const snapshot = {
        date: new Date().toISOString(),
        economy: data.economy,
        source: data.source,
        // Readers must look fields up by name: columns were appended over time.
        fields: {
            stocks: ['ticker', 'cotacao', 'dividend_yield', 'overall_score', 'signal', 'category', 'pl', 'p_vp', 'roe', 'market_cap',
                'roic', 'liq_2meses', 'graham_price', 'bazin_price', 'payout', 'cresc_5a', 'sector'],
            reits: ['ticker', 'price', 'dy', 'overall_score', 'signal', 'p_vp', 'p_fcf', 'market_cap', 'liquidity', 'sector'],
            etfs: ['ticker', 'price', 'dy', 'overall_score', 'signal', 'category', 'expense_ratio', 'aum', 'liquidity', 'asset_class']
        }
    };
    for (const [key, fields] of Object.entries(snapshot.fields)) {
        // Stale sections are yesterday's data; recording them again would fake a new observation.
        snapshot[key] = data.source.sections?.[key]?.stale ? [] : data[key].map(item => fields.map(field => item[field] ?? null));
    }
    const file = path.join(HISTORY_DIR, `${date}-us-results.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot));
    console.log(`💾 US history saved to: history-us/${path.basename(file)}`);
}

async function exportUsData() {
    console.log('🇺🇸 Starting Data Export for US Screener...');
    const data = await collectUsData();
    const staleKeys = Object.entries(data.source.sections).filter(([, s]) => s.stale).map(([key]) => key);

    if (SECTION_KEYS.every(key => staleKeys.includes(key))) {
        // Nothing new was collected: keep the existing file untouched and fail loudly.
        throw new Error('Every US data source failed; data-us.js was left unchanged.');
    }

    fs.writeFileSync(OUTPUT_FILE, `window.INVEST_DATA_US = ${JSON.stringify(data)};`);
    saveUsHistory(data);

    console.log('✅ US data exported successfully!');
    console.log(`📊 ${data.stocks.length} stocks, ${data.reits.length} REITs, ${data.etfs.length} ETFs`);
    console.log(`   Sources: ${JSON.stringify(data.source.sections)}`);
    console.log(`   Fed Funds ${data.economy.fedFunds}%, 10y Treasury ${data.economy.treasury10y}%, USD/BRL ${data.economy.dollar}`);
    console.log('Stock signals:', countBy(data.stocks, s => s.signal));
    console.log('REIT signals:', countBy(data.reits, r => r.signal));
    console.log('ETF categories:', countBy(data.etfs, e => e.category));
    if (data.source.degraded) {
        // GitHub Actions annotation: visible on the run page without failing the job.
        console.log(`::warning title=US data degraded::Fallback in use: ${JSON.stringify(data.source.sections)}`);
    }
    return data;
}

if (require.main === module) {
    exportUsData().catch(error => {
        console.error('❌ Error exporting US data:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { exportUsData, buildUsData, collectUsData, firstValid, loadPreviousData };
