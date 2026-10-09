// services/us/nasdaq.js
// Fallback price source: Nasdaq's public screener download returns every listed
// stock (~7k) and ETF (~5k) in one request each, with no API key. It has no
// fundamentals, so it is used to reprice the last good fundamentals snapshot.
const STOCKS_URL = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true';
const ETFS_URL = 'https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'application/json'
};

// Nasdaq writes share classes as BRK/B; TradingView uses BRK.B.
const normalizeTicker = (symbol) => String(symbol || '').trim().toUpperCase().replace(/\//g, '.');

function parseNumber(text) {
    const value = parseFloat(String(text ?? '').replace(/[$,%\s]/g, ''));
    return Number.isFinite(value) ? value : null;
}

async function getJson(url, { fetchImpl = fetch, attempts = 3 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetchImpl(url, { signal: AbortSignal.timeout(60000), headers: HEADERS });
            if (!response.ok) throw new Error(`Nasdaq HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
    throw lastError;
}

function parseStockQuotes(json) {
    const quotes = new Map();
    for (const row of json?.data?.rows || []) {
        const price = parseNumber(row.lastsale);
        if (price > 0) quotes.set(normalizeTicker(row.symbol), { price, market_cap: parseNumber(row.marketCap) });
    }
    return quotes;
}

function parseEtfQuotes(json) {
    const quotes = new Map();
    for (const row of json?.data?.data?.rows || json?.data?.rows || []) {
        const price = parseNumber(row.lastSalePrice);
        if (price > 0) quotes.set(normalizeTicker(row.symbol), { price, variation_12m: parseNumber(row.oneYearPercentage) });
    }
    return quotes;
}

async function fetchNasdaqStockQuotes(options) {
    return parseStockQuotes(await getJson(STOCKS_URL, options));
}

async function fetchNasdaqEtfQuotes(options) {
    return parseEtfQuotes(await getJson(ETFS_URL, options));
}

module.exports = {
    normalizeTicker,
    parseNumber,
    parseStockQuotes,
    parseEtfQuotes,
    fetchNasdaqStockQuotes,
    fetchNasdaqEtfQuotes
};
