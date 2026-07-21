const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { processFund, enrichFund, getBestFIIs } = require('./fiis');

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

describe('getBestFIIs service with Brapi failover', () => {
    let originalFetch;

    before(() => {
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
    });

    test('should fetch FIIs from Fundamentus when successful', async () => {
        global.fetch = async (url) => {
            if (url.includes('fii_resultado.php')) {
                return {
                    ok: true,
                    text: async () => `
                        <table id="tabelaResultado">
                            <tbody>
                                <tr>
                                    <td><a href="detalhes.php?papel=MXRF11">MXRF11</a></td>
                                    <td>Híbrido</td>
                                    <td>10.50</td>
                                    <td>12.0</td>
                                    <td>12.0</td>
                                    <td>1.02</td>
                                    <td>1200000000</td>
                                    <td>5000000</td>
                                    <td>0</td>
                                    <td>0</td>
                                    <td>0</td>
                                    <td>0</td>
                                    <td>0</td>
                                </tr>
                            </tbody>
                        </table>
                    `
                };
            }
            return { ok: false, status: 404 };
        };

        const result = await getBestFIIs({}, null, 10.75);
        assert.ok(result.length > 0);
        assert.strictEqual(result[0].ticker, 'MXRF11');
        assert.strictEqual(result[0].data_source, 'fundamentus');
    });

    test('should fallback to Brapi when Fundamentus fails', async () => {
        global.fetch = async (url) => {
            if (url.includes('fii_resultado.php')) {
                throw new Error('Fundamentus block (403)');
            }
            if (url.includes('api/quote/list')) {
                return {
                    ok: true,
                    json: async () => ({
                        stocks: [
                            {
                                stock: 'HGLG11',
                                sector: 'Industrial',
                                close: 160.0,
                                volume: 2000,
                                market_cap: 3000000000,
                                type: 'fund',
                                subType: 'fii'
                            }
                        ]
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const result = await getBestFIIs({}, null, 10.75);
        assert.ok(result.length > 0);
        assert.strictEqual(result[0].ticker, 'HGLG11');
        assert.strictEqual(result[0].data_source, 'brapi_fallback');
    });

    test('should handle failures gracefully when both fail', async () => {
        global.fetch = async (url) => {
            throw new Error('Connection refused');
        };

        const result = await getBestFIIs({}, null, 10.75);
        assert.deepStrictEqual(result, []);
    });
});
