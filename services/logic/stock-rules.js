
// logic/stock-rules.js
const { clamp, finiteNumber } = require('./analysis-utils');

function buildStockDecision(s, yieldThreshold) {
    const price = finiteNumber(s.cotacao);
    const pl = finiteNumber(s.pl);
    const pvp = finiteNumber(s.p_vp);
    const roe = finiteNumber(s.roe);
    const roic = finiteNumber(s.roic);
    const margin = finiteNumber(s.mrg_liq);
    const growth = finiteNumber(s.cresc_5a);
    const debt = finiteNumber(s.div_br_patrim);
    const dy = finiteNumber(s.dividend_yield);
    const payout = finiteNumber(s.payout);
    const liquidity = finiteNumber(s.liq_2meses);
    const evEbit = finiteNumber(s.ev_ebit);
    const psr = finiteNumber(s.psr);
    const warnings = [];
    const blockers = [];

    if (price <= 0) blockers.push('INVALID_PRICE');
    if (pl <= 0) blockers.push('NON_POSITIVE_EARNINGS');
    if (pvp <= 0) blockers.push('NON_POSITIVE_EQUITY');
    if (roe <= 0) blockers.push('NON_POSITIVE_ROE');
    if (margin <= 0) blockers.push('NON_POSITIVE_MARGIN');
    if (dy > 25) warnings.push('EXTREME_TRAILING_YIELD');
    if (payout > 100) warnings.push('UNSUSTAINABLE_OR_NON_RECURRING_PAYOUT');
    if (debt < 0) warnings.push('NEGATIVE_OR_UNRELIABLE_DEBT_RATIO');
    if (growth < 0) warnings.push('NEGATIVE_FIVE_YEAR_GROWTH');
    if (liquidity <= 0) warnings.push('MISSING_LIQUIDITY');

    const required = [price, pl, pvp, roe, margin, liquidity];
    const missingCount = required.filter(value => !Number.isFinite(value) || value === 0).length;
    const dataQuality = missingCount >= 3 ? 'INSUFFICIENT' : missingCount > 0 ? 'PARTIAL' : 'COMPLETE';

    let eligibility = 'ELIGIBLE';
    if (dataQuality === 'INSUFFICIENT') eligibility = 'INSUFFICIENT_DATA';
    else if (blockers.length > 0) eligibility = 'DISTRESSED';
    else if (warnings.includes('EXTREME_TRAILING_YIELD') || warnings.includes('UNSUSTAINABLE_OR_NON_RECURRING_PAYOUT')) eligibility = 'REVIEW';

    let quality = 0;
    if (roe >= 20) quality += 3; else if (roe >= 12) quality += 2; else if (roe > 0) quality += 1;
    if (roic >= 15) quality += 2; else if (roic >= 8) quality += 1;
    if (margin >= 15) quality += 2; else if (margin >= 8) quality += 1;
    if (growth >= 10) quality += 2; else if (growth >= 3) quality += 1;
    if (debt >= 0 && debt <= 1.5) quality += 1;

    let valuation = 0;
    if (pl > 0 && pl <= 8) valuation += 3; else if (pl <= 12) valuation += 2; else if (pl <= 18) valuation += 1;
    if (pvp > 0 && pvp <= 1) valuation += 3; else if (pvp <= 1.8) valuation += 2; else if (pvp <= 3) valuation += 1;
    if (evEbit > 0 && evEbit <= 8) valuation += 2; else if (evEbit <= 12) valuation += 1;
    if (psr > 0 && psr <= 1.5) valuation += 2; else if (psr <= 3) valuation += 1;

    let income = 0;
    if (dy >= yieldThreshold && dy <= 16) income += 4; else if (dy >= 4 && dy <= 20) income += 2;
    if (payout >= 25 && payout <= 80) income += 3; else if (payout > 0 && payout <= 100) income += 1;
    if (growth > 0) income += 1;
    if (margin > 10) income += 1;
    if (dy > 25 || payout > 100) income -= 4;

    let safety = 0;
    if (liquidity >= 1000000) safety += 3; else if (liquidity >= 200000) safety += 2;
    if (debt >= 0 && debt <= 1) safety += 3; else if (debt <= 2) safety += 1;
    if (payout === 0 || payout <= 80) safety += 2;
    if (growth >= 0) safety += 1;
    if (pvp > 0 && roe > 0) safety += 1;
    if (warnings.length > 0) safety -= warnings.length;

    const pillars = {
        quality: clamp(quality),
        valuation: clamp(valuation),
        income: clamp(income),
        safety: clamp(safety)
    };
    const overall = clamp(
        pillars.quality * 0.35 + pillars.valuation * 0.30 +
        pillars.income * 0.20 + pillars.safety * 0.15
    );

    let signal = 'WATCHLIST';
    if (eligibility === 'INSUFFICIENT_DATA') signal = 'INSUFFICIENT_DATA';
    else if (eligibility === 'DISTRESSED') signal = 'DISTRESSED';
    else if (eligibility === 'REVIEW') signal = 'REVIEW';
    else if (overall >= 7 && pillars.quality >= 6 && pillars.safety >= 6) signal = 'TOP_PICK';
    else if (overall >= 5.5 && pillars.valuation >= 6 && pillars.safety >= 4) signal = 'OPPORTUNITY';

    return {
        eligibility,
        signal,
        risk_level: signal === 'DISTRESSED' ? 'CRITICAL'
            : eligibility === 'REVIEW' ? 'HIGH'
                : pillars.safety >= 7 ? 'LOW'
                    : pillars.safety >= 5 ? 'MEDIUM' : 'HIGH',
        data_quality: dataQuality,
        pillars,
        overall_score: Number(overall.toFixed(2)),
        blockers,
        warnings,
        payout_is_estimated: true
    };
}

/**
 * Analyzes a single stock and attaches strategies, scores, and categories.
 * @param {Object} s - Raw stock data (ticker, pl, p_vp, etc.)
 * @param {number} selic - Current Selic rate
 * @returns {Object} Enriched stock object
 */
function analyzeStock(s, selic) {
    // Robustness: Default selic if missing
    const safeSelic = (selic !== null && selic !== undefined && !isNaN(selic)) ? selic : 11.75;
    const YIELD_THRESHOLD = Math.max(6, safeSelic * 0.5);

    // Robustness: Ensure numeric values for calculations
    const cotacao = s.cotacao || 0;
    const pl = s.pl || 0;
    const p_vp = s.p_vp || 0;
    const dividend_yield = s.dividend_yield || 0;

    // Graham Fair Value
    let graham_fair_price = 0;
    if (pl > 0 && p_vp > 0) {
        graham_fair_price = cotacao * Math.sqrt(22.5 / (pl * p_vp));
    }
    const upside = (graham_fair_price > 0 && cotacao > 0) ? ((graham_fair_price - cotacao) / cotacao) * 100 : 0;

    // Bazin Price (Ceiling Price @ YIELD_THRESHOLD)
    const dps = (dividend_yield / 100) * cotacao;
    const bazin_price = YIELD_THRESHOLD > 0 ? dps / (YIELD_THRESHOLD / 100) : 0;
    const bazin_upside = (bazin_price > 0 && cotacao > 0) ? ((bazin_price - cotacao) / cotacao) * 100 : 0;

    // --- STRATEGY CLASSIFICATION ---
    const strategies = [];

    // 💎 Quality (Compounders): High ROE, Safe, Profitable, Good Margins, Growing
    // IMPROVED: Flexible ROIC logic to capture more quality companies
    // Option 1: ROE > 15 AND ROIC > 10 (capital-intensive companies like utilities)
    // Option 2: ROE > 12 AND ROIC > 15 (high efficiency companies)
    if (s.mrg_liq > 10 && s.div_br_patrim < 1 && s.cresc_5a > 5) {
        if ((s.roe > 15 && s.roic > 10) || (s.roe > 12 && s.roic > 15)) {
            strategies.push('QUALITY');
        }
    }

    // 💰 Dividends: High Yield, Low Risk, Sustainable
    // CRITICAL FIX: Perenne detection uses HIGH MARGIN, not low debt
    // Utilities (TAEE11, EGIE3) have high debt but predictable margins (15%+)
    // Insurers (BBSE3) have low debt but also high margins
    const isLikelyPerenne = s.mrg_liq > 15 && s.roe > 12; // High margin + stable ROE = Utility/Insurance
    const maxPayout = isLikelyPerenne ? 100 : 90;

    if (s.dividend_yield > YIELD_THRESHOLD && s.mrg_liq > 10 && s.cresc_5a > 0) {
        if (!s.payout || s.payout <= maxPayout) {
            strategies.push('DIVIDEND');
        }
    }

    // 📉 Discount/Value: Cheap P/L and P/VP
    if (s.pl > 0 && s.pl < 10 && s.p_vp > 0 && s.p_vp < 1.0) {
        strategies.push('VALUE');
    }

    // 🚀 Growth: High Revenue CAGR
    if (s.cresc_5a > 15 && s.roe > 10) {
        strategies.push('GROWTH');
    }

    // 🪄 Magic Formula (Greenblatt-ish)
    if (s.roic > 15 && s.ev_ebit > 0 && s.ev_ebit < 10) {
        strategies.push('MAGIC');
    }

    // 🐢 Bazin Safe (Legacy + New)
    if (s.dividend_yield > 6 && s.div_br_patrim < 1 && s.liq_2meses > 100000 && s.cresc_5a > -5) {
        strategies.push('BAZIN');
    }

    // --- SCORING SYSTEM (0-10) ---
    let score = 0;

    // Valuation
    if (s.pl < 10 && s.pl > 0) score++;
    if (s.p_vp < 1.0 && s.p_vp > 0) score++;
    if (s.ev_ebit < 8 && s.ev_ebit > 0) score++;

    // Valuation (PSR)
    if (s.psr < 2.0 && s.psr > 0) score++;

    // Efficiency & Profitability (Graduated ROE scoring)
    if (s.roe > 15) score += 2; // Excellent ROE
    else if (s.roe > 10) score += 1; // Good ROE (mature sectors)
    if (s.roic > 15) score++;
    if (s.mrg_liq > 10) score++;

    // Growth & PEG (Peter Lynch)
    const peg_ratio = (s.pl > 0 && s.cresc_5a > 0) ? (s.pl / s.cresc_5a) : 999;
    if (peg_ratio < 0.5) score += 2; // Super bargain (Peter Lynch "dream stock")
    else if (peg_ratio < 1) score++; // Fair value growth

    // Dividends (Capped at 16%)
    let effectiveDy = s.dividend_yield;
    if (effectiveDy > 16) {
        effectiveDy = 16;
        strategies.push('HIGH_VOLATILITY'); // Alert tag for extremely high yields
    }
    if (effectiveDy > YIELD_THRESHOLD) score++;

    // Trend / Innovation Check (Proxy: Revenue contraction 5y)
    // "Lucro Atual < Lucro 5 Anos Atrás" -> Using Revenue Growth < 0 as proxy
    if (s.cresc_5a < 0) {
        score -= 3;
    }

    // Health
    if (s.div_br_patrim < 1) score++;
    if (s.liq_2meses > 1000000) score++; // Liquidity Bonus

    // Upside Potential
    if (upside > 25 || bazin_upside > 20) score++;

    // Payout Ratio (Dividend Sustainability) - CRITICAL FIX: Stronger penalties
    if (s.payout > 0) {
        if (s.payout >= 30 && s.payout <= 60) score += 2; // Ideal range
        else if (s.payout > 60 && s.payout <= 80) score += 1; // Acceptable
        else if (s.payout > 150) score -= 5; // Red flag (likely capital return, not dividend)
        else if (s.payout > 100) score -= 4; // Unsustainable (paying more than earning)
        else if (s.payout > 90) score -= 2; // High risk
        else if (s.payout > 80 && !isLikelyPerenne) score -= 1; // Risky for non-perennes
    }

    // Cap score at 10
    score = Math.min(score, 10);

    // Determine Main Category for UI (Star vs Opportunity)
    let category = null;

    // CRITICAL: Disqualify from STAR if payout > 100% (likely one-time distribution)
    const isUnsustainablePayout = s.payout > 100;

    if ((score >= 7 || strategies.length >= 3) && !isUnsustainablePayout) {
        category = 'STAR';
    } else {
        // Refined Opportunity Logic
        if (s.pl > 0 && s.div_br_patrim < 2.5 && (s.roe > 5 || (s.dividend_yield > 4))) {
            if (s.p_vp < 0.95 || s.pl < 9 || s.ev_ebit < 10) {
                category = 'OPPORTUNITY';
            }
        }
    }

    // Turnaround Candidates context
    if (s.pl < 0 && s.mrg_ebit > 0 && s.cotacao > 2) {
        strategies.push('TURNAROUND');
        if (!category) category = 'OPPORTUNITY';
    }

    const decision = buildStockDecision(s, YIELD_THRESHOLD);

    // Compute new Star categories
    const isStarIncome =
        decision.eligibility === 'ELIGIBLE' &&
        decision.overall_score >= 6.5 &&
        decision.pillars.quality >= 5 &&
        decision.pillars.safety >= 5 &&
        dividend_yield >= YIELD_THRESHOLD &&
        s.payout > 0 && s.payout <= 100 &&
        s.div_br_patrim >= 0 && s.div_br_patrim <= 1.5;

    const isStarGrowth =
        decision.eligibility === 'ELIGIBLE' &&
        decision.overall_score >= 6.5 &&
        decision.pillars.quality >= 6 &&
        s.cresc_5a >= 8 &&
        s.roe >= 12 &&
        s.roic >= 10;

    const isStarValue =
        decision.eligibility === 'ELIGIBLE' &&
        decision.overall_score >= 6.5 &&
        decision.pillars.safety >= 5 &&
        pl > 0 && pl <= 12 &&
        p_vp > 0 && p_vp <= 1.5 &&
        upside > 0 &&
        s.div_br_patrim >= 0 && s.div_br_patrim <= 1.5;

    // --- SPECIALIZED SCORE FORMULAS ---

    // 1. Income Score
    // Weight: 50% DY, 30% Bazin margin, 20% P/VP.
    let score_dy = 0;
    if (dividend_yield >= 12) score_dy = 10;
    else if (dividend_yield >= 8) score_dy = 8 + (dividend_yield - 8) * 0.5;
    else if (dividend_yield >= 6) score_dy = 6 + (dividend_yield - 6) * 1.0;
    else score_dy = dividend_yield * 1.0;

    let score_bazin_margin = 0;
    if (bazin_upside >= 50) score_bazin_margin = 10;
    else if (bazin_upside >= 0) score_bazin_margin = 7 + (bazin_upside / 50) * 3;
    else if (bazin_upside >= -20) score_bazin_margin = 5 + (bazin_upside + 20) / 20 * 2;
    else score_bazin_margin = 0;

    let score_pvp_income = 0;
    if (p_vp <= 1.0) score_pvp_income = 10;
    else if (p_vp <= 1.5) score_pvp_income = 7 + (1.5 - p_vp) / 0.5 * 3;
    else if (p_vp <= 2.0) score_pvp_income = 4 + (2.0 - p_vp) / 0.5 * 3;
    else score_pvp_income = 0;

    const score_income = Math.round((0.5 * score_dy + 0.3 * score_bazin_margin + 0.2 * score_pvp_income) * 100) / 100;

    // 2. Growth Score
    // Weight: 50% CAGR cresc_5a, 50% ROE. ROE >= 15% for max score.
    const cresc5a = s.cresc_5a || 0;
    let score_cagr = 0;
    if (cresc5a >= 20) score_cagr = 10;
    else if (cresc5a >= 10) score_cagr = 7 + (cresc5a - 10) * 0.3;
    else if (cresc5a >= 5) score_cagr = 4 + (cresc5a - 5) * 0.6;
    else score_cagr = Math.max(0, cresc5a);

    const roeVal = s.roe || 0;
    let score_roe_growth = 0;
    if (roeVal >= 20) score_roe_growth = 10;
    else if (roeVal >= 15) score_roe_growth = 8 + (roeVal - 15) * 0.4;
    else if (roeVal >= 10) score_roe_growth = 5 + (roeVal - 10) * 0.6;
    else score_roe_growth = Math.max(0, roeVal);

    const score_growth = Math.round((0.5 * score_cagr + 0.5 * score_roe_growth) * 100) / 100;

    // 3. Value Score
    // Weight: 50% P/VP, 50% Graham Upside.
    let score_pvp_value = 0;
    if (p_vp <= 0.5) score_pvp_value = 10;
    else if (p_vp <= 1.0) score_pvp_value = 7 + (1.0 - p_vp) / 0.5 * 3;
    else if (p_vp <= 1.5) score_pvp_value = 4 + (1.5 - p_vp) / 0.5 * 3;
    else score_pvp_value = 0;

    let score_graham_value = 0;
    if (upside >= 100) score_graham_value = 10;
    else if (upside >= 50) score_graham_value = 8 + (upside - 50) * 0.04;
    else if (upside >= 0) score_graham_value = 5 + upside * 0.06;
    else score_graham_value = 0;

    let base_value_score = 0.5 * score_pvp_value + 0.5 * score_graham_value;

    // Safety lock: Se Dividendos nos últimos 3 anos == 0 OU Se Dívida/Ebitda > 3.5, aplique uma penalidade de -3.0 pontos
    const divEbitda = s.divida_ebitda !== undefined ? s.divida_ebitda : null;
    const div3y = s.dividends_last_3_years !== undefined ? s.dividends_last_3_years : null;
    const hasNoRecentDividends = (div3y !== null && div3y === 0);
    const hasHighDebtRatio = (divEbitda !== null && divEbitda > 3.5);

    if (hasNoRecentDividends || hasHighDebtRatio) {
        base_value_score = Math.max(0, base_value_score - 3.0);
    }

    const score_value = Math.round(base_value_score * 100) / 100;

    let signal = decision.signal;
    category = null;

    if (isStarIncome || isStarGrowth || isStarValue) {
        signal = 'TOP_PICK';
        if (isStarIncome) category = 'STAR_INCOME';
        else if (isStarGrowth) category = 'STAR_GROWTH';
        else category = 'STAR_VALUE';
    } else if (decision.signal === 'OPPORTUNITY') {
        category = 'OPPORTUNITY';
    }

    return {
        ...s,
        graham_price: graham_fair_price,
        upside,
        bazin_price,
        bazin_upside,
        selic,
        score,
        strategies,
        peg_ratio,
        ...decision,
        signal,
        category,
        is_star_income: isStarIncome,
        is_star_growth: isStarGrowth,
        is_star_value: isStarValue,
        score_income,
        score_growth,
        score_value
    };
}

module.exports = { analyzeStock, buildStockDecision };

