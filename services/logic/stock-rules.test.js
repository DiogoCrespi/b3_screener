const { test, describe } = require('node:test');
const assert = require('node:assert');
const { analyzeStock } = require('./stock-rules');

describe('stock-rules logic', () => {
    describe('analyzeStock', () => {
        const defaultSelic = 10;
        const defaultStock = {
            ticker: 'TEST3',
            cotacao: 20,
            pl: 10,
            p_vp: 1,
            psr: 1,
            dividend_yield: 5,
            ev_ebit: 5,
            mrg_ebit: 20,
            mrg_liq: 15,
            roic: 12,
            roe: 14,
            liq_2meses: 2000000,
            div_br_patrim: 0.5,
            cresc_5a: 10,
            payout: 50
        };

        test('should calculate Graham Fair Value correctly', () => {
            // graham = cotacao * sqrt(22.5 / (pl * p_vp))
            // 20 * sqrt(22.5 / (10 * 1)) = 20 * sqrt(2.25) = 20 * 1.5 = 30
            const result = analyzeStock(defaultStock, defaultSelic);
            assert.strictEqual(result.graham_price, 30);
            assert.strictEqual(result.upside, 50); // (30-20)/20 * 100 = 50%
        });

        test('should handle zero or negative P/L or P/VP in Graham calculation', () => {
            const stockPLZero = { ...defaultStock, pl: 0 };
            assert.strictEqual(analyzeStock(stockPLZero, defaultSelic).graham_price, 0);

            const stockPLNeg = { ...defaultStock, pl: -5 };
            assert.strictEqual(analyzeStock(stockPLNeg, defaultSelic).graham_price, 0);

            const stockPVPZero = { ...defaultStock, p_vp: 0 };
            assert.strictEqual(analyzeStock(stockPVPZero, defaultSelic).graham_price, 0);
        });

        test('should calculate Bazin Price correctly', () => {
            // YIELD_THRESHOLD = max(6, 10 * 0.5) = 6
            // dps = (5/100) * 20 = 1
            // bazin_price = 1 / (6/100) = 16.666...
            const result = analyzeStock(defaultStock, defaultSelic);
            assert.ok(Math.abs(result.bazin_price - 16.666) < 0.01);
            assert.ok(Math.abs(result.bazin_upside - (-16.666)) < 0.01);
        });

        test('should use 6% as minimum Bazin yield threshold', () => {
            const lowSelic = 4; // threshold = max(6, 2) = 6
            const result = analyzeStock(defaultStock, lowSelic);
            assert.ok(Math.abs(result.bazin_price - 16.666) < 0.01);
        });

        test('should use half of Selic if it is above 12%', () => {
            const highSelic = 14; // threshold = max(6, 7) = 7
            // dps = 1, bazin = 1 / 0.07 = 14.28
            const result = analyzeStock(defaultStock, highSelic);
            assert.ok(Math.abs(result.bazin_price - 14.28) < 0.01);
        });

        describe('Strategies', () => {
            test('should identify QUALITY stocks', () => {
                const qualityStock = {
                    ...defaultStock,
                    mrg_liq: 11,
                    div_br_patrim: 0.8,
                    cresc_5a: 6,
                    roe: 16,
                    roic: 11
                };
                const result = analyzeStock(qualityStock, defaultSelic);
                assert.ok(result.strategies.includes('QUALITY'));
            });

            test('should identify DIVIDEND stocks', () => {
                const dividendStock = {
                    ...defaultStock,
                    dividend_yield: 8, // > threshold 6
                    mrg_liq: 11,
                    cresc_5a: 1,
                    payout: 80
                };
                const result = analyzeStock(dividendStock, defaultSelic);
                assert.ok(result.strategies.includes('DIVIDEND'));
            });

            test('should identify VALUE stocks', () => {
                const valueStock = {
                    ...defaultStock,
                    pl: 8,
                    p_vp: 0.8
                };
                const result = analyzeStock(valueStock, defaultSelic);
                assert.ok(result.strategies.includes('VALUE'));
            });

            test('should identify GROWTH stocks', () => {
                const growthStock = {
                    ...defaultStock,
                    cresc_5a: 16,
                    roe: 11
                };
                const result = analyzeStock(growthStock, defaultSelic);
                assert.ok(result.strategies.includes('GROWTH'));
            });

            test('should identify MAGIC stocks', () => {
                const magicStock = {
                    ...defaultStock,
                    roic: 16,
                    ev_ebit: 8
                };
                const result = analyzeStock(magicStock, defaultSelic);
                assert.ok(result.strategies.includes('MAGIC'));
            });

            test('should identify BAZIN safe stocks', () => {
                const bazinSafeStock = {
                    ...defaultStock,
                    dividend_yield: 7,
                    div_br_patrim: 0.5,
                    liq_2meses: 200000,
                    cresc_5a: 1
                };
                const result = analyzeStock(bazinSafeStock, defaultSelic);
                assert.ok(result.strategies.includes('BAZIN'));
            });

            test('should identify TURNAROUND stocks', () => {
                const turnaroundStock = {
                    ...defaultStock,
                    pl: -5,
                    mrg_ebit: 5,
                    cotacao: 5
                };
                const result = analyzeStock(turnaroundStock, defaultSelic);
                assert.ok(result.strategies.includes('TURNAROUND'));
            });
        });

        describe('Scoring System', () => {
            test('should accumulate points for various metrics', () => {
                const greatStock = {
                    ticker: 'GOOD3',
                    cotacao: 10,
                    pl: 5,
                    p_vp: 0.5,
                    ev_ebit: 4,
                    psr: 1,
                    roe: 12,
                    roic: 10,
                    mrg_liq: 15,
                    dividend_yield: 7,
                    cresc_5a: 10,
                    div_br_patrim: 0.5,
                    liq_2meses: 2000000,
                    payout: 40
                };
                const result = analyzeStock(greatStock, defaultSelic);
                assert.strictEqual(result.score, 10);
            });

            test('should penalize negative growth', () => {
                const badGrowthStock = { ...defaultStock, cresc_5a: -10 };
                const resultNormal = analyzeStock(defaultStock, defaultSelic);
                const resultBad = analyzeStock(badGrowthStock, defaultSelic);
                assert.strictEqual(resultBad.score, resultNormal.score - 3);
            });

            test('should penalize unsustainable payout', () => {
                const unsustainableStock = { ...defaultStock, payout: 110 };
                const result = analyzeStock(unsustainableStock, defaultSelic);
                const normalResult = analyzeStock(defaultStock, defaultSelic);
                // payout 50 gives +2. payout 110 gives -4. Difference is -6.
                assert.strictEqual(result.score, normalResult.score - 6);
            });
        });

        describe('Category', () => {
            test('should assign STAR category for high scoring stocks', () => {
                const starStock = {
                    ...defaultStock,
                    roe: 20,
                    roic: 20,
                    pl: 5,
                    p_vp: 0.8
                };
                const result = analyzeStock(starStock, defaultSelic);
                assert.strictEqual(result.category, 'STAR');
            });

            test('should NOT assign STAR if payout is unsustainable', () => {
                const highPayoutStock = {
                    ...defaultStock,
                    roe: 20,
                    payout: 110
                };
                const result = analyzeStock(highPayoutStock, defaultSelic);
                assert.notStrictEqual(result.category, 'STAR');
            });

            test('should assign OPPORTUNITY for decent but not star stocks', () => {
                const oppStock = {
                    ...defaultStock,
                    pl: 12,
                    p_vp: 1.5,
                    ev_ebit: 9,
                    psr: 2.5,
                    roe: 8,
                    roic: 8,
                    mrg_liq: 12,
                    liq_2meses: 500000,
                    div_br_patrim: 1.5,
                    cresc_5a: 5,
                    payout: 25,
                    dividend_yield: 5,
                    cotacao: 20
                };
                const result = analyzeStock(oppStock, defaultSelic);
                assert.strictEqual(result.category, 'OPPORTUNITY');
            });
        });

        test('should calculate PEG ratio correctly', () => {
            const result = analyzeStock(defaultStock, defaultSelic);
            assert.strictEqual(result.peg_ratio, 10 / 10);

            const noGrowthStock = { ...defaultStock, cresc_5a: 0 };
            assert.strictEqual(analyzeStock(noGrowthStock, defaultSelic).peg_ratio, 999);
        });
    });
});
