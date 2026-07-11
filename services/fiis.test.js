const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { processFund, enrichFund } = require('./fiis');

describe('FII processing pipeline', () => {
    test('keeps provenance while prioritizing valid external metadata', () => {
        const fund = { ticker: 'TEST11', price: 90, dy: 9, p_vp: 0.9, liquidity: 1000000, market_cap: 1000000000 };
        const enriched = enrichFund(fund, { price: 95, dy: 10, p_vp: 0 });
        assert.strictEqual(enriched.price, 95);
        assert.strictEqual(enriched.dy, 10);
        assert.strictEqual(enriched.p_vp, 0.9);
    });

    test('publishes classification and decision as separate dimensions', () => {
        const result = processFund({
            ticker: 'PSEC11', segment: 'Outros', price: 56, dy: 13.7,
            p_vp: 0.76, liquidity: 3200000, market_cap: 1300000000,
            num_properties: 0, vacancy: 0
        }, { ticker: 'PSEC11', segment: 'Títulos e Valores Mobiliários' }, 14.25);

        assert.strictEqual(result.exposure, 'REAL_ESTATE_CREDIT');
        assert.strictEqual(result.type, 'PAPEL');
        assert.strictEqual(result.signal, 'OPPORTUNITY');
        assert.ok(result.pillars);
        assert.deepStrictEqual(result.data_sources, ['fundamentus', 'investidor10']);
    });
});
