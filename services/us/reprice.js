// services/us/reprice.js
// Rebuilds yesterday's fundamentals at today's prices. Price-based ratios scale
// exactly with price because their denominators (earnings, book value, sales,
// dividends) only change with quarterly reports.
const scale = (value, factor) => (typeof value === 'number' && Number.isFinite(value) ? value * factor : value);
const inverse = (value, factor) => (typeof value === 'number' && Number.isFinite(value) ? value / factor : value);

function repriceWith(items, quotes, priceKeys, apply) {
    const repriced = [];
    for (const item of items || []) {
        const quote = quotes.get(item.ticker);
        const oldPrice = priceKeys.map(key => item[key]).find(v => v > 0);
        // Assets missing from today's listing are dropped rather than shown at a stale price.
        if (!quote || !(oldPrice > 0)) continue;
        repriced.push(apply(item, quote, quote.price / oldPrice));
    }
    const total = (items || []).length;
    return { items: repriced, coverage: total ? repriced.length / total : 0 };
}

function repriceStocks(items, quotes) {
    return repriceWith(items, quotes, ['cotacao'], (s, quote, f) => ({
        ...s,
        cotacao: quote.price,
        pl: scale(s.pl, f),
        p_vp: scale(s.p_vp, f),
        psr: scale(s.psr, f),
        ev_ebit: scale(s.ev_ebit, f), // approximation: debt and cash are held constant
        p_fcf: scale(s.p_fcf, f),
        dividend_yield: inverse(s.dividend_yield, f),
        market_cap: quote.market_cap > 0 ? quote.market_cap : scale(s.market_cap, f),
        variation_12m: null
    }));
}

function repriceEtfs(items, quotes) {
    return repriceWith(items, quotes, ['price'], (e, quote, f) => ({
        ...e,
        price: quote.price,
        dy: inverse(e.dy, f),
        high_52w: Math.max(e.high_52w || 0, quote.price),
        low_52w: e.low_52w > 0 ? Math.min(e.low_52w, quote.price) : e.low_52w,
        variation_12m: quote.variation_12m ?? null
    }));
}

module.exports = { repriceStocks, repriceEtfs };
