'use strict';
const fs = require('fs');
const path = require('path');

const DATA_JS = path.resolve(__dirname, '../data.js');

const THRESHOLDS = {
    stocks: { min: 100, label: 'stocks' },
    fiis:   { min: 50,  label: 'FIIs' },
    etfs:   { min: 5,   label: 'ETFs' },
};

function loadData() {
    if (!fs.existsSync(DATA_JS)) {
        throw new Error(`data.js not found at ${DATA_JS}`);
    }
    const src = fs.readFileSync(DATA_JS, 'utf8');
    // The file ends with: window.INVEST_DATA = {...};
    const jsonStart = src.indexOf('{');
    if (jsonStart === -1) {
        throw new Error('data.js does not contain a valid JSON object.');
    }
    try {
        return JSON.parse(src.slice(jsonStart, src.lastIndexOf('}') + 1));
    } catch (e) {
        throw new Error(`data.js JSON is malformed: ${e.message}`);
    }
}

function validate(data) {
    const errors = [];

    for (const [key, { min, label }] of Object.entries(THRESHOLDS)) {
        const arr = data[key];
        if (!Array.isArray(arr)) {
            errors.push(`"${key}" is missing or not an array.`);
        } else if (arr.length < min) {
            errors.push(`Only ${arr.length} ${label} found (minimum required: ${min}).`);
        }
    }

    const dollar = data && data.economy && data.economy.dollar;
    const selic  = data && data.economy && data.economy.selic;

    if (typeof dollar !== 'number' || dollar <= 0 || !isFinite(dollar)) {
        errors.push(`Invalid dollar rate: ${dollar}`);
    }
    if (typeof selic !== 'number' || selic <= 0 || !isFinite(selic)) {
        errors.push(`Invalid selic rate: ${selic}`);
    }

    if (!data || !data.updatedAt) {
        errors.push('"updatedAt" field is missing.');
    }

    return errors;
}

(function main() {
    console.log('Validating generated data.js...');
    let data;
    try {
        data = loadData();
    } catch (err) {
        console.error('LOAD ERROR: ' + err.message);
        process.exit(1);
    }

    const errors = validate(data);
    if (errors.length > 0) {
        console.error('VALIDATION FAILED:');
        errors.forEach(function(e) { console.error('  - ' + e); });
        process.exit(1);
    }

    const s = data.stocks.length;
    const f = data.fiis.length;
    const e = data.etfs.length;
    const d = data.economy.dollar.toFixed(4);
    const sl = data.economy.selic.toFixed(2);
    console.log('data.js is valid: ' + s + ' stocks, ' + f + ' FIIs, ' + e + ' ETFs | dollar=' + d + ', selic=' + sl + '% | updatedAt=' + data.updatedAt);
})();
