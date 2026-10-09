// services/us/ranking.js
// Turns rule-based signals into a ranking. The rules alone mark hundreds of US
// assets TOP_PICK (hundreds of regional banks pass the value filters), which says
// "passed the screen", not "best". Here every asset gets a 0-100 conviction score,
// TOP_PICK is limited to the best-ranked, sector-diversified names, and a Top 10
// is chosen for the home screen.
const tier = (value, steps) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    for (const [min, points] of steps) if (value >= min) return points;
    return 0;
};

const SIZE_STEPS = [[200e9, 10], [50e9, 8], [10e9, 6], [2e9, 4], [300e6, 2]];
const LIQUIDITY_STEPS = [[500e6, 10], [100e6, 8], [20e6, 6], [5e6, 4], [1e6, 2]];

// Score dominates; size and liquidity break ties towards established, tradable names.
function stockConviction(s) {
    const score = Number.isFinite(s.overall_score) ? s.overall_score : 0;
    return Number((score * 7 + tier(s.market_cap, SIZE_STEPS) * 1.5 + tier(s.liq_2meses, LIQUIDITY_STEPS) * 1.5).toFixed(2));
}

function reitConviction(r) {
    const score = Number.isFinite(r.overall_score) ? r.overall_score : 0;
    return Number((score * 8 + tier(r.market_cap, SIZE_STEPS) * 1 + tier(r.liquidity, LIQUIDITY_STEPS) * 1).toFixed(2));
}

// ETF scores already weigh cost, size and liquidity; AUM only separates the many 10s.
function etfConviction(e) {
    const score = Number.isFinite(e.overall_score) ? e.overall_score : 0;
    return Number((score * 9 + tier(e.aum, [[100e9, 10], [20e9, 8], [5e9, 6], [1e9, 4], [100e6, 2]]) * 1).toFixed(2));
}

const PROFILES = Object.freeze({
    stocks: {
        conviction: stockConviction,
        groupOf: s => s.sector || 'Outros',
        maxTopPicks: 50,
        maxPerGroup: 8,
        eligible: s => s.market_cap >= 2e9 && s.liq_2meses >= 5e6 && s.data_quality === 'COMPLETE',
        ineligibleWarning: 'SMALL_OR_ILLIQUID_FOR_TOP_PICK'
    },
    reits: {
        conviction: reitConviction,
        groupOf: r => r.industry || 'REIT',
        maxTopPicks: 15,
        maxPerGroup: 15,
        eligible: r => r.market_cap >= 2e9,
        ineligibleWarning: 'SMALL_OR_ILLIQUID_FOR_TOP_PICK'
    },
    etfs: {
        conviction: etfConviction,
        groupOf: e => e.category || 'OTHER',
        maxTopPicks: 40,
        maxPerGroup: 10,
        eligible: e => e.aum >= 1e9 && e.expense_ratio !== null && e.expense_ratio !== undefined,
        ineligibleWarning: 'SMALL_OR_UNKNOWN_COST_FOR_TOP_PICK',
        duplicateKeyOf: indexKey
    }
});

// ETFs tracking the same index (VOO, SPY, IVV) are one recommendation, not three.
const INDEX_PATTERNS = [
    [/s&p 500|core s&p us total/i, 'SP500'], [/nasdaq[- ]?100|invesco qqq/i, 'NDX'], [/total (stock|us stock|u\.s\. stock)? ?market|total world/i, 'TOTAL'],
    [/russell 2000|small[- ]cap/i, 'SMALL'], [/mid[- ]cap|s&p mid/i, 'MID'], [/emerging/i, 'EM'], [/developed|eafe|international/i, 'DEV'],
    [/aggregate|total bond|core bond/i, 'AGG'], [/treasury|t-bill|government/i, 'TSY'], [/gold/i, 'GOLD'], [/silver/i, 'SILVER'],
    [/growth/i, 'GROWTH'], [/value/i, 'VALUE'], [/dividend/i, 'DIVIDEND'], [/technology|\btech\b/i, 'TECH']
];
function indexKey(etf) {
    const found = INDEX_PATTERNS.find(([pattern]) => pattern.test(etf.name || ''));
    return found ? found[1] : etf.ticker;
}

const byConviction = (a, b) => b.conviction - a.conviction || (b.market_cap || b.aum || 0) - (a.market_cap || a.aum || 0);

/**
 * Adds `conviction` and `rank` to every item and keeps TOP_PICK only for the best
 * eligible names, at most `maxPerGroup` per sector/category. Demoted items become
 * WATCHLIST with a warning explaining why.
 */
function rankSection(items, key) {
    const profile = PROFILES[key];
    const ranked = items.map(item => ({ ...item, conviction: profile.conviction(item) })).sort(byConviction);
    const perGroup = new Map();
    let kept = 0;
    const out = ranked.map((item, index) => {
        const next = { ...item, rank: index + 1 };
        if (item.signal !== 'TOP_PICK') return next;
        const group = profile.groupOf(item);
        const groupCount = perGroup.get(group) || 0;
        let reason = null;
        if (!profile.eligible(item)) reason = profile.ineligibleWarning;
        else if (kept >= profile.maxTopPicks) reason = 'TOP_PICK_LIMIT';
        else if (groupCount >= profile.maxPerGroup) reason = 'SECTOR_CONCENTRATION_LIMIT';
        // Demoted to WATCHLIST, not OPPORTUNITY, so that list keeps its own meaning (cheap by valuation).
        if (reason) return { ...next, signal: 'WATCHLIST', warnings: [...(item.warnings || []), reason] };
        kept++;
        perGroup.set(group, groupCount + 1);
        return next;
    });
    return out;
}

/** Best TOP_PICKs by conviction, at most `perGroup` from the same sector/category. */
function pickTop(items, key, size = 10, perGroup = 2) {
    const profile = PROFILES[key];
    const counts = new Map();
    const seenKeys = new Set();
    const picked = [];
    for (const item of [...items].filter(i => i.signal === 'TOP_PICK').sort(byConviction)) {
        const group = profile.groupOf(item);
        const key = profile.duplicateKeyOf ? profile.duplicateKeyOf(item) : item.ticker;
        if ((counts.get(group) || 0) >= perGroup || seenKeys.has(key)) continue;
        counts.set(group, (counts.get(group) || 0) + 1);
        seenKeys.add(key);
        picked.push(item.ticker);
        if (picked.length === size) break;
    }
    return picked;
}

// Curated groups of ETFs with the same index or practically the same exposure. A list
// beats name matching here: names mislead ("Goldman" is not gold, gold miners are not
// gold, Brazil small caps are not US small caps), and a wrong swap is worse than none.
const EQUIVALENT_GROUPS = Object.freeze({
    'S&P 500': ['VOO', 'SPY', 'IVV', 'SPYM', 'SPLG'],
    'Nasdaq-100': ['QQQ', 'QQQM'],
    'Mercado total EUA': ['VTI', 'ITOT', 'SCHB', 'SPTM'],
    'Small caps EUA': ['IWM', 'VB', 'IJR', 'SCHA', 'VTWO', 'SPSM'],
    'Mid caps EUA': ['IJH', 'VO', 'SCHM', 'SPMD', 'MDY', 'IVOO'],
    'Desenvolvidos ex-EUA': ['VEA', 'IEFA', 'SCHF', 'SPDW', 'EFA'],
    'Emergentes': ['VWO', 'IEMG', 'SCHE', 'SPEM', 'EEM'],
    'Internacional total': ['VXUS', 'IXUS'],
    'Títulos agregados EUA': ['BND', 'AGG', 'SCHZ', 'SPAB'],
    'Ouro físico': ['GLD', 'IAU', 'GLDM', 'SGOL', 'IAUM', 'AAAU'],
    'Prata física': ['SLV', 'SIVR'],
    'Dividendos (Schwab)': ['SCHD'],
    'Ações globais': ['VT', 'ACWI']
});
const GROUP_OF = new Map(Object.entries(EQUIVALENT_GROUPS).flatMap(([group, tickers]) => tickers.map(t => [t, group])));
const MAX_PRICE_RATIO = 0.6; // the alternative must cost at most 60% of the share price

/**
 * For each ETF in a curated group, points to a cheaper equivalent (e.g. VOO -> SPYM)
 * so an expensive share is not a reason to give up the exposure. The alternative
 * must not be under review, and the best-ranked one wins.
 */
function addCheaperAlternatives(etfs) {
    return etfs.map(etf => {
        const group = GROUP_OF.get(etf.ticker);
        if (!group) return etf;
        const best = etfs
            .filter(peer => GROUP_OF.get(peer.ticker) === group && peer.ticker !== etf.ticker)
            .filter(peer => peer.price > 0 && peer.price <= etf.price * MAX_PRICE_RATIO)
            .filter(peer => peer.signal !== 'REVIEW' && peer.signal !== 'DISTRESSED')
            .sort(byConviction)[0];
        return best ? { ...etf, cheaper_alternative: best.ticker, equivalence_group: group } : { ...etf, equivalence_group: group };
    });
}

module.exports = { rankSection, pickTop, indexKey, addCheaperAlternatives, EQUIVALENT_GROUPS, stockConviction, reitConviction, etfConviction, PROFILES };
