const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkFreshness } = require('./check-freshness');

describe('checkFreshness', () => {
    const now = new Date('2026-10-09T12:30:00Z');
    const setup = (us) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
        fs.mkdirSync(path.join(root, 'history'));
        fs.writeFileSync(path.join(root, 'history', '2026-10-09-stock-results.json'), '{}');
        if (us) fs.writeFileSync(path.join(root, 'data-us.js'), `window.INVEST_DATA_US = ${JSON.stringify(us)};`);
        return root;
    };

    test('passes when both markets were refreshed today', () => {
        const root = setup({ source: { collectedAt: '2026-10-09T12:10:00Z', sections: { stocks: { provider: 'tradingview' } } } });
        assert.deepStrictEqual(checkFreshness({ root, now }), { errors: [], warnings: [] });
    });

    test('warns on fallback sources and fails on stale sections', () => {
        const root = setup({ source: { collectedAt: '2026-10-09T12:10:00Z', sections: {
            stocks: { provider: 'nasdaq', stale: false }, etfs: { provider: 'cache', stale: true, since: '2026-10-08' }
        } } });
        const result = checkFreshness({ root, now });
        assert.strictEqual(result.warnings.length, 1);
        assert.match(result.errors[0], /etfs is stale/);
    });

    test('fails when the B3 snapshot or US file is old or missing', () => {
        const root = setup({ source: { collectedAt: '2026-10-08T12:10:00Z' } });
        assert.match(checkFreshness({ root, now }).errors[0], /24\.3h old/);
        fs.rmSync(path.join(root, 'history', '2026-10-09-stock-results.json'));
        fs.rmSync(path.join(root, 'data-us.js'));
        assert.strictEqual(checkFreshness({ root, now }).errors.length, 2);
    });
});
