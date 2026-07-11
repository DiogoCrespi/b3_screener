const { clamp, finiteNumber } = require('./analysis-utils');

function analyzeFund(fund, classification, selic) {
    const price = finiteNumber(fund.price);
    const pvp = finiteNumber(fund.p_vp);
    const dy = finiteNumber(fund.dy);
    const liquidity = finiteNumber(fund.liquidity);
    const marketCap = finiteNumber(fund.market_cap);
    const vacancy = fund.vacancy === null || fund.vacancy === undefined ? null : finiteNumber(fund.vacancy);
    const exposure = classification.exposure;
    const blockers = [];
    const warnings = [];

    if (price <= 0) blockers.push('INVALID_PRICE');
    if (pvp <= 0) blockers.push('INVALID_PVP');
    if (liquidity <= 0) blockers.push('MISSING_LIQUIDITY');
    if (exposure === 'UNKNOWN') warnings.push('UNKNOWN_EXPOSURE');
    if (marketCap <= 0) warnings.push('MISSING_MARKET_CAP');
    if (dy > 25) warnings.push('EXTREME_TRAILING_YIELD');
    if (['REAL_ESTATE_CREDIT', 'AGRO_CREDIT', 'INFRA_CREDIT'].includes(exposure) && pvp > 0 && pvp < 0.75) {
        warnings.push('DEEP_CREDIT_DISCOUNT');
    }
    if (exposure === 'REAL_ESTATE_PHYSICAL' && pvp > 0 && pvp < 0.60) {
        warnings.push('DEEP_PHYSICAL_DISCOUNT');
    }
    if (exposure === 'REAL_ESTATE_PHYSICAL' && vacancy !== null && vacancy > 20) {
        warnings.push('HIGH_VACANCY');
    }

    let eligibility = blockers.length ? 'INSUFFICIENT_DATA' : 'ELIGIBLE';
    if (warnings.includes('EXTREME_TRAILING_YIELD') || warnings.includes('DEEP_CREDIT_DISCOUNT') || warnings.includes('DEEP_PHYSICAL_DISCOUNT')) eligibility = 'REVIEW';

    let valuation = 0;
    if (exposure === 'REAL_ESTATE_PHYSICAL') {
        if (pvp >= 0.75 && pvp <= 0.95) valuation = 9;
        else if (pvp > 0.95 && pvp <= 1.05) valuation = 7;
        else if (pvp >= 0.65 && pvp < 0.75) valuation = 5;
        else if (pvp > 0 && pvp < 0.65) valuation = 2;
        else valuation = 4;
    } else if (['REAL_ESTATE_CREDIT', 'AGRO_CREDIT', 'INFRA_CREDIT'].includes(exposure)) {
        if (pvp >= 0.90 && pvp <= 1.03) valuation = 9;
        else if (pvp >= 0.82 && pvp < 0.90) valuation = 6;
        else if (pvp > 0 && pvp < 0.82) valuation = 2;
        else valuation = 5;
    } else {
        if (pvp >= 0.80 && pvp <= 1.0) valuation = 8;
        else if (pvp > 0 && pvp < 0.80) valuation = 5;
        else valuation = 4;
    }

    const peerYieldTarget = classification.regulatory_class === 'FII'
        ? Math.max(8, finiteNumber(selic) - 3)
        : Math.max(9, finiteNumber(selic) - 1.5);
    let income = 0;
    if (dy >= peerYieldTarget && dy <= 16) income = 9;
    else if (dy >= peerYieldTarget - 2 && dy <= 20) income = 7;
    else if (dy > 0 && dy < peerYieldTarget - 2) income = 4;
    else if (dy > 20) income = 2;

    let liquidityScore = 0;
    if (liquidity >= 4000000) liquidityScore = 10;
    else if (liquidity >= 1500000) liquidityScore = 8;
    else if (liquidity >= 800000) liquidityScore = 6;
    else if (liquidity >= 400000) liquidityScore = 4;
    else if (liquidity > 0) liquidityScore = 2;

    let safety = 5;
    if (marketCap >= 2000000000) safety += 3;
    else if (marketCap >= 1000000000) safety += 2;
    else if (marketCap > 0 && marketCap < 400000000) safety -= 2;
    if (classification.classification_confidence === 'HIGH') safety += 1;
    else if (classification.classification_confidence === 'LOW') safety -= 2;
    if (exposure === 'REAL_ESTATE_PHYSICAL' && vacancy !== null) {
        if (vacancy <= 5) safety += 1;
        else if (vacancy > 15) safety -= 3;
    }
    safety -= warnings.length;

    const pillars = {
        valuation: clamp(valuation),
        income: clamp(income),
        liquidity: clamp(liquidityScore),
        safety: clamp(safety)
    };
    const overall = clamp(
        pillars.valuation * 0.25 + pillars.income * 0.25 +
        pillars.liquidity * 0.20 + pillars.safety * 0.30
    );

    let signal = 'WATCHLIST';
    if (eligibility === 'INSUFFICIENT_DATA') signal = 'INSUFFICIENT_DATA';
    else if (eligibility === 'REVIEW') signal = 'REVIEW';
    else if (overall >= 7.5 && pillars.safety >= 7 && liquidity >= 1000000 && marketCap >= 1000000000) signal = 'TOP_PICK';
    else if (overall >= 6 && pillars.safety >= 5) signal = 'OPPORTUNITY';

    return {
        eligibility,
        signal,
        risk_level: signal === 'REVIEW' ? 'HIGH'
            : pillars.safety >= 7 ? 'LOW'
                : pillars.safety >= 5 ? 'MEDIUM' : 'HIGH',
        data_quality: blockers.length ? 'INSUFFICIENT' : warnings.includes('MISSING_MARKET_CAP') ? 'PARTIAL' : 'COMPLETE',
        pillars,
        overall_score: Number(overall.toFixed(2)),
        blockers,
        warnings,
        yield_is_trailing: true
    };
}

module.exports = { analyzeFund };
