const fs = require('fs');
const path = require('path');

function loadGeneratedData() {
    const raw = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
    return JSON.parse(raw.replace(/^window\.INVEST_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
}

function countBy(items, selector) {
    return items.reduce((counts, item) => {
        const key = selector(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function audit(data) {
    const errors = [];
    const topIssuerKeys = new Set();

    for (const stock of data.stocks || []) {
        if (stock.signal !== 'TOP_PICK') continue;
        if (stock.eligibility !== 'ELIGIBLE') errors.push(`${stock.ticker}: TOP_PICK is not eligible.`);
        if (stock.p_vp <= 0 || stock.roe <= 0) errors.push(`${stock.ticker}: TOP_PICK has non-positive equity metrics.`);
        if (stock.dividend_yield > 25 || stock.payout > 100) errors.push(`${stock.ticker}: TOP_PICK has extraordinary or unsustainable income.`);
        if (!stock.issuer_key) errors.push(`${stock.ticker}: TOP_PICK is missing issuer identity.`);
        else if (topIssuerKeys.has(stock.issuer_key)) errors.push(`${stock.ticker}: duplicate TOP_PICK issuer ${stock.issuer_key}.`);
        else topIssuerKeys.add(stock.issuer_key);
    }

    for (const fund of data.fiis || []) {
        if (!fund.regulatory_class || !fund.exposure || !fund.classification_confidence) {
            errors.push(`${fund.ticker}: incomplete fund classification.`);
        }
        if (fund.signal !== 'TOP_PICK') continue;
        if (fund.eligibility !== 'ELIGIBLE') errors.push(`${fund.ticker}: fund TOP_PICK is not eligible.`);
        if (fund.market_cap < 1000000000) errors.push(`${fund.ticker}: fund TOP_PICK has insufficient or missing market cap.`);
        if (fund.dy > 25) errors.push(`${fund.ticker}: fund TOP_PICK has extreme trailing yield.`);
        if (fund.exposure === 'UNKNOWN') errors.push(`${fund.ticker}: fund TOP_PICK has unknown exposure.`);
    }

    return {
        errors,
        summary: {
            stocks: (data.stocks || []).length,
            funds: (data.fiis || []).length,
            stockSignals: countBy(data.stocks || [], item => item.signal || 'MISSING'),
            fundSignals: countBy(data.fiis || [], item => item.signal || 'MISSING'),
            fundExposures: countBy(data.fiis || [], item => item.exposure || 'MISSING')
        }
    };
}

const result = audit(loadGeneratedData());
console.log(JSON.stringify(result.summary, null, 2));
if (result.errors.length) {
    console.error('Generated-data audit failed:');
    result.errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Generated-data audit passed.');
}

module.exports = { audit };
