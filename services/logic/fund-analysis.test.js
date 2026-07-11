const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeFund } = require('./fund-analysis');

const physical = { regulatory_class: 'FII', exposure: 'REAL_ESTATE_PHYSICAL', classification_confidence: 'HIGH' };
const credit = { regulatory_class: 'FII', exposure: 'REAL_ESTATE_CREDIT', classification_confidence: 'HIGH' };

describe('fund analysis', () => {
    test('scores a liquid, large physical fund without mixing credit thresholds', () => {
        const result = analyzeFund({ price: 100, p_vp: 0.88, dy: 10, liquidity: 5000000, market_cap: 2500000000, vacancy: 3 }, physical, 14.25);
        assert.strictEqual(result.signal, 'TOP_PICK');
        assert.ok(result.pillars.valuation >= 8);
        assert.strictEqual(result.risk_level, 'LOW');
    });

    test('sends deeply discounted credit funds to review', () => {
        const result = analyzeFund({ price: 70, p_vp: 0.68, dy: 18, liquidity: 2000000, market_cap: 800000000 }, credit, 14.25);
        assert.strictEqual(result.signal, 'REVIEW');
        assert.ok(result.warnings.includes('DEEP_CREDIT_DISCOUNT'));
    });

    test('does not reward extreme trailing yield', () => {
        const result = analyzeFund({ price: 10, p_vp: 0.9, dy: 54, liquidity: 2000000, market_cap: 1000000000 }, credit, 14.25);
        assert.strictEqual(result.signal, 'REVIEW');
        assert.ok(result.pillars.income <= 2);
    });

    test('requires market cap for a top pick', () => {
        const result = analyzeFund({ price: 100, p_vp: 0.98, dy: 13, liquidity: 5000000, market_cap: 0 }, credit, 14.25);
        assert.notStrictEqual(result.signal, 'TOP_PICK');
        assert.strictEqual(result.data_quality, 'PARTIAL');
    });
});
