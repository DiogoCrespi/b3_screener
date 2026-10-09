// services/us/fund-rules.js
// Scoring for US REITs and ETFs. Outputs follow the signal/pillars/overall_score
// shape used by the B3 rules so both dashboards speak the same vocabulary.
const { clamp } = require('../logic/analysis-utils');

const tier = (value, steps, fallback = 0) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    for (const [test, points] of steps) if (test(value)) return points;
    return fallback;
};

/**
 * REITs pay out most of their cash by law, so net-income payout above 100% is
 * normal and is not penalised. Without free FFO data, P/FCF is the cash proxy.
 */
function analyzeReit(reit, treasury10y) {
    const rf = Number.isFinite(treasury10y) ? treasury10y : 4.5;
    const dy = reit.dividend_yield || 0;
    const pvp = reit.p_vp || 0;
    const pfcf = reit.p_fcf;
    const debt = reit.div_br_patrim;
    const warnings = [];
    const blockers = [];

    if (!(reit.cotacao > 0)) blockers.push('INVALID_PRICE');
    if (!(pvp > 0)) blockers.push('NON_POSITIVE_EQUITY');
    if (!(dy > 0)) blockers.push('NO_DIVIDENDS');
    if (dy > 15) warnings.push('EXTREME_TRAILING_YIELD');
    if (debt > 3) warnings.push('HIGH_LEVERAGE');
    if (typeof pfcf === 'number' && pfcf <= 0) warnings.push('NEGATIVE_FREE_CASH_FLOW');

    const spread = dy - rf;
    const income = clamp(tier(spread, [[v => v >= 2, 9], [v => v >= 1, 7], [v => v >= 0, 5], [v => v >= -1, 3]], 1)
        + (reit.cresc_5a > 3 ? 1 : 0));
    const valuation = clamp(
        tier(pvp, [[v => v > 0 && v <= 1, 5], [v => v <= 1.5, 4], [v => v <= 2.5, 2], [v => v <= 4, 1]], 0)
        + tier(pfcf, [[v => v > 0 && v <= 12, 5], [v => v > 0 && v <= 18, 3], [v => v > 0 && v <= 25, 2]], 0));
    const safety = clamp(
        tier(debt, [[v => v >= 0 && v <= 1, 4], [v => v >= 0 && v <= 2, 2]], 0)
        + tier(reit.market_cap, [[v => v >= 10e9, 3], [v => v >= 2e9, 2], [v => v >= 500e6, 1]], 0)
        + tier(reit.liq_2meses, [[v => v >= 20e6, 3], [v => v >= 5e6, 2], [v => v >= 1e6, 1]], 0)
        - warnings.length);
    const overall = clamp(income * 0.4 + valuation * 0.35 + safety * 0.25);

    let signal = 'WATCHLIST';
    if (blockers.length > 0) signal = 'DISTRESSED';
    else if (warnings.includes('EXTREME_TRAILING_YIELD')) signal = 'REVIEW';
    else if (overall >= 6.5 && safety >= 6 && income >= 5) signal = 'TOP_PICK';
    else if (overall >= 5.5 && valuation >= 6) signal = 'OPPORTUNITY';

    return {
        ...reit,
        type: 'REIT',
        price: reit.cotacao,
        dy,
        liquidity: reit.liq_2meses,
        yield_spread: spread,
        signal,
        pillars: { income, valuation, safety },
        overall_score: Number(overall.toFixed(2)),
        risk_level: signal === 'DISTRESSED' ? 'CRITICAL' : safety >= 7 ? 'LOW' : safety >= 5 ? 'MEDIUM' : 'HIGH',
        blockers,
        warnings
    };
}

// Broad US equity: market-cap indexes plus plain size/style funds (growth, value).
const CORE_PATTERN = /s&p (500|mid|small)|total (stock )?market|total world|broad market|nasdaq[- ]?100|russell (1000|2000|3000|mid|top)|dow jones industrial|core s&p|msci usa\b|(large|mid|small|mega)[- ]cap|morningstar (growth|value)|equal weight/i;
const INTL_PATTERN = /international|emerging|developed|ex[- ]us|europe|japan|china|india|world ex|eafe|acwi/i;
const DIVIDEND_PATTERN = /dividend|income|yield|premium/i;

function etfCategory(etf) {
    if (etf.leveraged) return 'LEVERAGED';
    if (etf.asset_class === 'FIXED_INCOME') return 'BOND';
    if (etf.asset_class === 'COMMODITY') return 'COMMODITY';
    const name = etf.name || '';
    if (DIVIDEND_PATTERN.test(name) || etf.dy >= 4) return 'DIVIDEND';
    if (INTL_PATTERN.test(name)) return 'INTERNATIONAL';
    if (CORE_PATTERN.test(name)) return 'CORE';
    return 'SECTOR_THEME';
}

function analyzeEtf(etf) {
    const cost = tier(etf.expense_ratio, [[v => v <= 0.1, 10], [v => v <= 0.2, 8], [v => v <= 0.5, 6], [v => v <= 1, 3]], etf.expense_ratio === null ? 5 : 1);
    const size = tier(etf.aum, [[v => v >= 10e9, 10], [v => v >= 1e9, 8], [v => v >= 500e6, 6]], 4);
    const liquidity = tier(etf.liquidity, [[v => v >= 50e6, 10], [v => v >= 5e6, 8], [v => v >= 1e6, 6]], 3);
    const performance = tier(etf.variation_3y, [[v => v >= 40, 10], [v => v >= 20, 8], [v => v >= 0, 6]], etf.variation_3y === null ? 5 : 3);
    const overall = clamp(cost * 0.35 + size * 0.25 + liquidity * 0.2 + performance * 0.2);
    const category = etfCategory(etf);
    const warnings = [];
    if (etf.leveraged) warnings.push('LEVERAGED_OR_INVERSE');
    if (typeof etf.nav_premium === 'number' && Math.abs(etf.nav_premium) > 2) warnings.push('NAV_PREMIUM_DISCOUNT');

    let signal = 'WATCHLIST';
    if (etf.leveraged) signal = 'REVIEW';
    else if (overall >= 8 && cost >= 6) signal = 'TOP_PICK';
    else if (overall >= 6.5) signal = 'OPPORTUNITY';

    return {
        ...etf,
        category,
        signal,
        pillars: { cost, size, liquidity, performance },
        overall_score: Number(overall.toFixed(2)),
        warnings
    };
}

const SIGNAL_ORDER = Object.freeze({ TOP_PICK: 0, OPPORTUNITY: 1, WATCHLIST: 2, REVIEW: 3, DISTRESSED: 4, INSUFFICIENT_DATA: 5 });

// Within a signal, the ranking's conviction (when present) orders assets; otherwise the score.
function bySignalThenScore(a, b) {
    return (SIGNAL_ORDER[a.signal] ?? 6) - (SIGNAL_ORDER[b.signal] ?? 6)
        || (b.conviction ?? b.overall_score) - (a.conviction ?? a.overall_score);
}

module.exports = { analyzeReit, analyzeEtf, etfCategory, bySignalThenScore, SIGNAL_ORDER };
