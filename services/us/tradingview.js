// services/us/tradingview.js
// Free US market data from the TradingView scanner endpoint (no API key).
// A single POST returns every listed asset with fundamentals, which plays the
// same role Fundamentus plays for B3.
const SCAN_URL = 'https://scanner.tradingview.com/america/scan';

const REIT_INDUSTRY = 'Real Estate Investment Trusts';
const MIN_MARKET_CAP = 300e6;

// TradingView exposes some ETF attributes as opaque ids. These were mapped by
// sampling well-known funds (SPY, BND, GLD, SSO, SH); unknown ids fall back to
// name heuristics so a remap on their side degrades instead of breaking.
const UNLEVERAGED_ID = '88ba1211175189c63246bb29132b1d2e';
const ASSET_CLASS_IDS = Object.freeze({
    c05f85d35d1cd0be6ebb2af4be16e06a: 'EQUITY',
    b6e443a6c4a8a2e7918c5dbf3d45c796: 'FIXED_INCOME',
    '8fe80395f389e29e3ea42210337f0350': 'COMMODITY'
});

const STOCK_COLUMNS = [
    'name', 'description', 'close', 'price_earnings_ttm', 'price_book_fq', 'price_sales_current',
    'dividends_yield', 'enterprise_value_to_ebit_ttm', 'operating_margin_ttm', 'net_margin_ttm',
    'return_on_invested_capital_fq', 'return_on_equity_fq', 'average_volume_30d_calc',
    'debt_to_equity_fq', 'total_revenue_5y_growth_fy', 'market_cap_basic',
    'dividend_payout_ratio_ttm', 'sector', 'industry', 'exchange', 'Perf.Y',
    'price_free_cash_flow_ttm'
];

const ETF_COLUMNS = [
    'name', 'description', 'close', 'dividends_yield', 'expense_ratio', 'aum',
    'average_volume_30d_calc', 'price_52_week_high', 'price_52_week_low', 'Perf.Y', 'Perf.3Y',
    'nav_discount_premium', 'asset_class', 'leverage', 'issuer', 'exchange'
];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scan(body, { attempts = 3, fetchImpl = fetch } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetchImpl(SCAN_URL, {
                method: 'POST',
                signal: AbortSignal.timeout(30000),
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error(`TradingView scanner HTTP ${response.status}`);
            const json = await response.json();
            if (!Array.isArray(json.data)) throw new Error('TradingView scanner returned no data array');
            return json.data;
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await wait(1000 * attempt);
        }
    }
    throw lastError;
}

// Turns positional rows into objects keyed by column name.
function rowsToObjects(rows, columns) {
    return rows.map(row => Object.fromEntries(columns.map((column, i) => [column, row.d[i]])));
}

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const numOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// TradingView reports cumulative 5y revenue growth; the rules expect a CAGR like Fundamentus.
function cumulativeToCagr(totalGrowthPct, years = 5) {
    if (typeof totalGrowthPct !== 'number' || !Number.isFinite(totalGrowthPct) || totalGrowthPct <= -100) return 0;
    return (Math.pow(1 + totalGrowthPct / 100, 1 / years) - 1) * 100;
}

function issuerKey(description, ticker) {
    const name = String(description || '').toUpperCase()
        .replace(/\b(CLASS|CL|SERIES)\s+[A-Z]\b.*$/, '')
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
    return name || ticker;
}

// Maps a scanner row to the field names used by the B3 stock rules.
function mapStock(row, collectedAt = new Date().toISOString()) {
    const price = num(row.close);
    const payout = numOrNull(row.dividend_payout_ratio_ttm);
    return {
        ticker: row.name,
        name: row.description || row.name,
        exchange: row.exchange || null,
        sector: row.sector || null,
        industry: row.industry || null,
        cotacao: price,
        pl: num(row.price_earnings_ttm),
        p_vp: num(row.price_book_fq),
        psr: num(row.price_sales_current),
        dividend_yield: num(row.dividends_yield),
        ev_ebit: num(row.enterprise_value_to_ebit_ttm),
        mrg_ebit: num(row.operating_margin_ttm),
        mrg_liq: num(row.net_margin_ttm),
        roic: num(row.return_on_invested_capital_fq),
        roe: num(row.return_on_equity_fq),
        liq_2meses: num(row.average_volume_30d_calc) * price, // avg daily dollar volume
        div_br_patrim: num(row.debt_to_equity_fq),
        cresc_5a: cumulativeToCagr(row.total_revenue_5y_growth_fy),
        payout: payout !== null && payout >= 0 && payout < 1000 ? payout : 0,
        market_cap: num(row.market_cap_basic),
        p_fcf: numOrNull(row.price_free_cash_flow_ttm),
        variation_12m: numOrNull(row['Perf.Y']),
        issuer_key: issuerKey(row.description, row.name),
        share_class: null,
        data_source: 'tradingview',
        collected_at: collectedAt
    };
}

function classifyEtf(row) {
    const text = `${row.name} ${row.description || ''}`;
    // The scanner's leverage id is authoritative. Names are only a fallback, and must
    // not match "Short-Term"/"Ultra-Short" bond funds, which are not leveraged.
    const leveraged = row.leverage
        ? row.leverage !== UNLEVERAGED_ID
        : /\b(-?\d(\.\d+)?x|ultrapro|leveraged|inverse|bear)\b/i.test(text);
    let assetClass = ASSET_CLASS_IDS[row.asset_class] || null;
    if (!assetClass) {
        if (/\b(bond|treasury|t-bill|income|municipal|credit|aggregate)\b/i.test(text)) assetClass = 'FIXED_INCOME';
        else if (/\b(gold|silver|oil|commodit)/i.test(text)) assetClass = 'COMMODITY';
        else assetClass = 'OTHER';
    }
    return { leveraged: Boolean(leveraged), asset_class: assetClass };
}

function mapEtf(row, collectedAt = new Date().toISOString()) {
    const price = num(row.close);
    const expense = numOrNull(row.expense_ratio);
    return {
        ticker: row.name,
        name: row.description || row.name,
        issuer: row.issuer || null,
        exchange: row.exchange || null,
        price,
        dy: num(row.dividends_yield),
        // Sanity bound: some funds come back with obviously wrong ratios (e.g. 10%).
        expense_ratio: expense !== null && expense >= 0 && expense <= 5 ? expense : null,
        aum: num(row.aum),
        liquidity: num(row.average_volume_30d_calc) * price,
        high_52w: num(row.price_52_week_high),
        low_52w: num(row.price_52_week_low),
        variation_12m: numOrNull(row['Perf.Y']),
        variation_3y: numOrNull(row['Perf.3Y']),
        nav_premium: numOrNull(row.nav_discount_premium),
        ...classifyEtf(row),
        data_source: 'tradingview',
        collected_at: collectedAt
    };
}

const primaryListing = [
    { left: 'is_primary', operation: 'equal', right: true },
    { left: 'market_cap_basic', operation: 'greater', right: MIN_MARKET_CAP }
];

async function fetchUsStocks(options) {
    const rows = await scan({
        columns: STOCK_COLUMNS,
        filter: [
            { left: 'type', operation: 'equal', right: 'stock' },
            { left: 'industry', operation: 'not_in_range', right: [REIT_INDUSTRY] },
            ...primaryListing
        ],
        range: [0, 10000],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }
    }, options);
    const collectedAt = new Date().toISOString();
    return rowsToObjects(rows, STOCK_COLUMNS).map(row => mapStock(row, collectedAt));
}

async function fetchUsReits(options) {
    const rows = await scan({
        columns: STOCK_COLUMNS,
        filter: [
            { left: 'type', operation: 'equal', right: 'stock' },
            { left: 'industry', operation: 'equal', right: REIT_INDUSTRY },
            ...primaryListing
        ],
        range: [0, 2000],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }
    }, options);
    const collectedAt = new Date().toISOString();
    return rowsToObjects(rows, STOCK_COLUMNS).map(row => mapStock(row, collectedAt));
}

async function fetchUsEtfs(options) {
    const rows = await scan({
        columns: ETF_COLUMNS,
        filter: [
            { left: 'typespecs', operation: 'has', right: ['etf'] },
            { left: 'aum', operation: 'greater', right: 100e6 }
        ],
        range: [0, 10000],
        sort: { sortBy: 'aum', sortOrder: 'desc' }
    }, options);
    const collectedAt = new Date().toISOString();
    return rowsToObjects(rows, ETF_COLUMNS).map(row => mapEtf(row, collectedAt));
}

module.exports = {
    SCAN_URL,
    scan,
    rowsToObjects,
    cumulativeToCagr,
    issuerKey,
    mapStock,
    mapEtf,
    classifyEtf,
    fetchUsStocks,
    fetchUsReits,
    fetchUsEtfs
};
