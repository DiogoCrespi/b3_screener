
// logic/stock-rules.js

/**
 * Analyzes a single stock and attaches strategies, scores, and categories.
 * @param {Object} s - Raw stock data (ticker, pl, p_vp, etc.)
 * @param {number} selic - Current Selic rate
 * @returns {Object} Enriched stock object
 */
function analyzeStock(s, selic) {
    const YIELD_THRESHOLD = Math.max(6, selic * 0.5);

    // Graham Fair Value
    let graham_fair_price = 0;
    if (s.pl > 0 && s.p_vp > 0) {
        graham_fair_price = s.cotacao * Math.sqrt(22.5 / (s.pl * s.p_vp));
    }
    const upside = graham_fair_price > 0 ? ((graham_fair_price - s.cotacao) / s.cotacao) * 100 : 0;

    // Bazin Price (Ceiling Price @ YIELD_THRESHOLD)
    const dps = (s.dividend_yield / 100) * s.cotacao;
    const bazin_price = dps / (YIELD_THRESHOLD / 100);
    const bazin_upside = bazin_price > 0 ? ((bazin_price - s.cotacao) / s.cotacao) * 100 : 0;

    // --- STRATEGY CLASSIFICATION ---
    const strategies = [];

    // 💎 Quality (Compounders): High ROE, Safe, Profitable, Good Margins, Growing
    // Flexible ROIC: Accept ROIC > 12 if ROE is exceptional (> 18)
    if (s.mrg_liq > 10 && s.div_br_patrim < 1 && s.cresc_5a > 5) {
        if ((s.roe > 15 && s.roic > 15) || (s.roe > 18 && s.roic > 12)) {
            strategies.push('QUALITY');
        }
    }

    // 💰 Dividends: High Yield, Low Risk, Sustainable
    // NEW: Reject if Payout > 100% (unsustainable dividend)
    if (s.dividend_yield > YIELD_THRESHOLD && s.mrg_liq > 10 && s.cresc_5a > 0) {
        if (!s.payout || s.payout <= 100) {
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

    // Efficiency & Profitability
    if (s.roe > 15) score++;
    if (s.roic > 15) score++;
    if (s.mrg_liq > 10) score++;

    // Growth & PEG
    const peg_ratio = (s.pl > 0 && s.cresc_5a > 0) ? (s.pl / s.cresc_5a) : 999;
    if (peg_ratio < 1) score++;

    // Dividends
    if (s.dividend_yield > YIELD_THRESHOLD) score++;

    // Health
    if (s.div_br_patrim < 1) score++;
    if (s.liq_2meses > 1000000) score++; // Liquidity Bonus

    // Upside Potential
    if (upside > 25 || bazin_upside > 20) score++;

    // Payout Ratio (Dividend Sustainability)
    if (s.payout > 0) {
        if (s.payout >= 30 && s.payout <= 60) score++; // Healthy payout
        if (s.payout > 80) score -= 2; // Risky/unsustainable
    }

    // Cap score at 10
    score = Math.min(score, 10);

    // Determine Main Category for UI (Star vs Opportunity)
    let category = null;

    if (score >= 7 || strategies.length >= 3) {
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
        // Placeholder for TURNAROUND
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
        category,
        peg_ratio
    };
}

module.exports = { analyzeStock };
