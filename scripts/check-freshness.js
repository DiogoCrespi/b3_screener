'use strict';
// Fails (exit 1) when today's run did not refresh the market data, so a broken
// scraper turns the workflow red instead of silently publishing old data.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAX_US_AGE_HOURS = 6;

function readJsAssignment(file) {
    const src = fs.readFileSync(file, 'utf8');
    return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
}

function checkFreshness({ root = ROOT, now = new Date() } = {}) {
    const errors = [];
    const warnings = [];
    const today = now.toISOString().split('T')[0];

    const b3History = path.join(root, 'history', `${today}-stock-results.json`);
    if (!fs.existsSync(b3History)) errors.push(`B3: no snapshot for ${today} (history/${today}-stock-results.json missing).`);

    const usFile = path.join(root, 'data-us.js');
    if (!fs.existsSync(usFile)) {
        errors.push('US: data-us.js not found.');
    } else {
        try {
            const us = readJsAssignment(usFile);
            const ageHours = (now - new Date(us.source?.collectedAt)) / 36e5;
            if (!(ageHours <= MAX_US_AGE_HOURS)) errors.push(`US: data-us.js is ${Number.isFinite(ageHours) ? ageHours.toFixed(1) + 'h' : 'of unknown age'} old.`);
            for (const [key, section] of Object.entries(us.source?.sections || {})) {
                if (section.stale) errors.push(`US: ${key} is stale (all sources failed, data from ${section.since}).`);
                else if (section.provider !== 'tradingview') warnings.push(`US: ${key} served by fallback "${section.provider}".`);
            }
        } catch (error) {
            errors.push(`US: data-us.js unreadable (${error.message}).`);
        }
    }
    return { errors, warnings };
}

if (require.main === module) {
    const { errors, warnings } = checkFreshness();
    warnings.forEach(w => console.log(`::warning title=Fallback source::${w}`));
    errors.forEach(e => console.log(`::error title=Stale market data::${e}`));
    if (errors.length) process.exitCode = 1;
    else console.log('✅ B3 and US data refreshed today.');
}

module.exports = { checkFreshness };
