const { test, describe } = require('node:test');
const assert = require('node:assert');
const { analyzeStock } = require('../logic/stock-rules');
const { cumulativeToCagr, mapStock, mapEtf, rowsToObjects, issuerKey, scan } = require('./tradingview');
const { parseFredCsv, getFedFundsRate } = require('./economy');
const { analyzeReit, analyzeEtf, bySignalThenScore } = require('./fund-rules');
const { buildUsData } = require('../../export_data_us');

const baseStock = {
    ticker: 'TEST', cotacao: 100, pl: 18, p_vp: 2, psr: 2, dividend_yield: 2.5, ev_ebit: 14,
    mrg_ebit: 25, mrg_liq: 18, roic: 16, roe: 22, liq_2meses: 50e6, div_br_patrim: 0.5, cresc_5a: 9, payout: 45
};

describe('US market profile in stock rules', () => {
    test('B3 output is unchanged when no market is given', () => {
        assert.deepStrictEqual(analyzeStock(baseStock, 10), analyzeStock(baseStock, 10, { market: 'B3' }));
        assert.strictEqual(analyzeStock(baseStock, 10).market, undefined);
    });

    test('US profile keeps raw ratios in the output', () => {
        const result = analyzeStock(baseStock, 3.88, { market: 'US' });
        assert.strictEqual(result.pl, 18);
        assert.strictEqual(result.dividend_yield, 2.5);
        assert.strictEqual(result.market, 'US');
        assert.strictEqual(result.payout_is_estimated, false);
    });

    test('US profile judges multiples relative to US norms', () => {
        const b3 = analyzeStock(baseStock, 3.88);
        const us = analyzeStock(baseStock, 3.88, { market: 'US' });
        assert.ok(us.pillars.valuation > b3.pillars.valuation);
    });

    test('Graham uses raw P/L and P/VP; Bazin uses the US yield threshold', () => {
        const us = analyzeStock(baseStock, 3.88, { market: 'US' });
        assert.ok(Math.abs(us.graham_price - 100 * Math.sqrt(22.5 / 36)) < 1e-9);
        // threshold = max(6, 3.88 * 0.5) * 0.4 = 2.4% -> DPS 2.5 / 2.4%
        assert.ok(Math.abs(us.yield_threshold - 2.4) < 1e-9);
        assert.ok(Math.abs(us.bazin_price - 2.5 / 0.024) < 1e-9);
    });
});

describe('TradingView mapping', () => {
    test('cumulativeToCagr converts 5y cumulative growth', () => {
        assert.ok(Math.abs(cumulativeToCagr(100) - (Math.pow(2, 0.2) - 1) * 100) < 1e-9);
        assert.strictEqual(cumulativeToCagr(null), 0);
        assert.strictEqual(cumulativeToCagr(-100), 0);
    });

    test('rowsToObjects keys positional rows by column', () => {
        assert.deepStrictEqual(rowsToObjects([{ s: 'X:A', d: ['A', 1] }], ['name', 'close']), [{ name: 'A', close: 1 }]);
    });

    test('mapStock produces B3 rule fields with dollar liquidity', () => {
        const stock = mapStock({
            name: 'KO', description: 'Coca-Cola Company (The)', close: 80, price_earnings_ttm: 25,
            average_volume_30d_calc: 1000, total_revenue_5y_growth_fy: 61.05,
            dividend_payout_ratio_ttm: 70, dividends_yield: 3
        }, 'now');
        assert.strictEqual(stock.ticker, 'KO');
        assert.strictEqual(stock.pl, 25);
        assert.strictEqual(stock.liq_2meses, 80000);
        assert.ok(Math.abs(stock.cresc_5a - 10) < 0.01);
        assert.strictEqual(stock.payout, 70);
        assert.strictEqual(stock.p_vp, 0);
    });

    test('issuerKey groups share classes of the same company', () => {
        assert.strictEqual(issuerKey('Alphabet Inc. Class A', 'GOOGL'), issuerKey('Alphabet Inc. Class C', 'GOOG'));
        assert.strictEqual(issuerKey('', 'XYZ'), 'XYZ');
    });

    test('mapEtf rejects implausible expense ratios and flags leverage', () => {
        const ivv = mapEtf({ name: 'IVV', description: 'iShares Core S&P 500 ETF', close: 700, expense_ratio: 10, leverage: '88ba1211175189c63246bb29132b1d2e', asset_class: 'c05f85d35d1cd0be6ebb2af4be16e06a' });
        assert.strictEqual(ivv.expense_ratio, null);
        assert.strictEqual(ivv.leveraged, false);
        assert.strictEqual(ivv.asset_class, 'EQUITY');
        const tqqq = mapEtf({ name: 'TQQQ', description: 'ProShares UltraPro QQQ', close: 50, leverage: 'other-id' });
        assert.strictEqual(tqqq.leveraged, true);
        const bond = mapEtf({ name: 'XBND', description: 'Example Treasury Bond ETF', close: 50 });
        assert.strictEqual(bond.asset_class, 'FIXED_INCOME');
    });

    test('short-term bond funds are not mistaken for leveraged or inverse funds', () => {
        const unlevered = '88ba1211175189c63246bb29132b1d2e';
        assert.strictEqual(mapEtf({ name: 'VGSH', description: 'Vanguard Short-Term Treasury ETF', leverage: unlevered }).leveraged, false);
        assert.strictEqual(mapEtf({ name: 'VUSB', description: 'Vanguard Ultra-Short Bond ETF' }).leveraged, false);
        assert.strictEqual(mapEtf({ name: 'XLEV', description: 'Example Daily 3X Bull ETF' }).leveraged, true);
        assert.strictEqual(mapEtf({ name: 'XINV', description: 'Example Inverse S&P 500 ETF' }).leveraged, true);
    });

    test('scan retries and surfaces HTTP errors', async () => {
        let calls = 0;
        const fetchImpl = async () => { calls++; return { ok: false, status: 503 }; };
        await assert.rejects(scan({}, { fetchImpl, attempts: 2 }), /HTTP 503/);
        assert.strictEqual(calls, 2);
    });
});

describe('FRED economy', () => {
    test('parseFredCsv returns the latest numeric observation', () => {
        assert.deepStrictEqual(parseFredCsv('observation_date,DFF\n2026-10-06,3.88\n2026-10-07,.\n'), { date: '2026-10-06', value: 3.88 });
        assert.strictEqual(parseFredCsv('observation_date,DFF\n'), null);
    });

    test('getFedFundsRate returns null when FRED fails', async () => {
        const fetchImpl = async () => ({ ok: false, status: 500 });
        const original = console.error;
        console.error = () => {};
        try {
            assert.strictEqual(await getFedFundsRate({ fetchImpl, attempts: 1 }), null);
        } finally {
            console.error = original;
        }
    });
});

describe('US fund rules', () => {
    const reit = { ticker: 'O', cotacao: 60, p_vp: 1.3, p_fcf: 14, dividend_yield: 7.5, div_br_patrim: 0.8, market_cap: 50e9, liq_2meses: 300e6, cresc_5a: 8 };

    test('analyzeReit rewards yield spread over Treasuries', () => {
        const result = analyzeReit(reit, 4.5);
        assert.strictEqual(result.type, 'REIT');
        assert.strictEqual(result.signal, 'TOP_PICK');
        assert.ok(Math.abs(result.yield_spread - 3) < 1e-9);
    });

    test('analyzeReit marks non-paying REITs as distressed and extreme yields for review', () => {
        assert.strictEqual(analyzeReit({ ...reit, dividend_yield: 0 }, 4.5).signal, 'DISTRESSED');
        assert.strictEqual(analyzeReit({ ...reit, dividend_yield: 20 }, 4.5).signal, 'REVIEW');
    });

    test('analyzeEtf favours cheap, large, liquid funds and isolates leverage', () => {
        const core = analyzeEtf({ ticker: 'VOO', name: 'Vanguard S&P 500 ETF', expense_ratio: 0.03, aum: 1e12, liquidity: 5e9, variation_3y: 80, dy: 1.1, asset_class: 'EQUITY', leveraged: false });
        assert.strictEqual(core.category, 'CORE');
        assert.strictEqual(core.signal, 'TOP_PICK');
        const lev = analyzeEtf({ ticker: 'TQQQ', name: 'ProShares UltraPro QQQ', expense_ratio: 0.84, aum: 2e10, liquidity: 5e9, variation_3y: 300, dy: 0.5, asset_class: 'EQUITY', leveraged: true });
        assert.strictEqual(lev.category, 'LEVERAGED');
        assert.strictEqual(lev.signal, 'REVIEW');
    });

    test('bySignalThenScore orders by signal first', () => {
        const sorted = [{ signal: 'WATCHLIST', overall_score: 9 }, { signal: 'TOP_PICK', overall_score: 7 }].sort(bySignalThenScore);
        assert.strictEqual(sorted[0].signal, 'TOP_PICK');
    });
});

describe('buildUsData', () => {
    test('filters illiquid assets and strips per-item provenance', () => {
        const data = buildUsData({
            fedFunds: 3.88, treasury10y: 4.5, dollar: 5,
            stocks: [{ ...baseStock, data_source: 'tradingview', collected_at: 'now' }, { ...baseStock, ticker: 'ILLQ', liq_2meses: 10 }],
            reits: [{ ticker: 'O', cotacao: 60, p_vp: 1.3, p_fcf: 14, dividend_yield: 7.5, div_br_patrim: 0.8, market_cap: 50e9, liq_2meses: 300e6 }],
            etfs: [{ ticker: 'VOO', name: 'Vanguard S&P 500 ETF', expense_ratio: 0.03, aum: 1e12, liquidity: 5e9, variation_3y: 80, dy: 1.1, asset_class: 'EQUITY', leveraged: false }]
        });
        assert.deepStrictEqual(data.stocks.map(s => s.ticker), ['TEST']);
        assert.strictEqual(data.stocks[0].collected_at, undefined);
        assert.strictEqual(data.market, 'US');
        assert.strictEqual(data.reits.length, 1);
        assert.strictEqual(data.etfs.length, 1);
    });
});

describe('Nasdaq price fallback', () => {
    const { parseNumber, parseStockQuotes, parseEtfQuotes } = require('./nasdaq');
    const { repriceStocks, repriceEtfs } = require('./reprice');

    test('parses Nasdaq rows and normalises share-class tickers', () => {
        assert.strictEqual(parseNumber('$1,169.09'), 1169.09);
        assert.strictEqual(parseNumber('-0.37%'), -0.37);
        assert.strictEqual(parseNumber(''), null);
        const quotes = parseStockQuotes({ data: { rows: [{ symbol: 'BRK/B', lastsale: '$500.00', marketCap: '1000000.00' }, { symbol: 'X', lastsale: '' }] } });
        assert.deepStrictEqual(quotes.get('BRK.B'), { price: 500, market_cap: 1000000 });
        assert.strictEqual(quotes.has('X'), false);
        const etfs = parseEtfQuotes({ data: { data: { rows: [{ symbol: 'VOO', lastSalePrice: '$700.5', oneYearPercentage: '15.2%' }] } } });
        assert.deepStrictEqual(etfs.get('VOO'), { price: 700.5, variation_12m: 15.2 });
    });

    test('repriceStocks scales price ratios and inverts yield', () => {
        const quotes = new Map([['KO', { price: 110, market_cap: null }]]);
        const { items, coverage } = repriceStocks([
            { ticker: 'KO', cotacao: 100, pl: 20, p_vp: 5, psr: 4, ev_ebit: 18, p_fcf: 25, dividend_yield: 3.3, market_cap: 400e9 },
            { ticker: 'GONE', cotacao: 10, pl: 5 }
        ], quotes);
        assert.strictEqual(coverage, 0.5);
        assert.strictEqual(items.length, 1);
        const ko = items[0];
        assert.strictEqual(ko.cotacao, 110);
        assert.ok(Math.abs(ko.pl - 22) < 1e-9);
        assert.ok(Math.abs(ko.p_vp - 5.5) < 1e-9);
        assert.ok(Math.abs(ko.dividend_yield - 3) < 1e-9);
        assert.ok(Math.abs(ko.market_cap - 440e9) < 1);
    });

    test('repriceEtfs updates price, yield and 1y return', () => {
        const { items } = repriceEtfs([{ ticker: 'VOO', price: 500, dy: 1.2, high_52w: 520, low_52w: 400, variation_12m: 5 }],
            new Map([['VOO', { price: 600, variation_12m: 18 }]]));
        assert.strictEqual(items[0].price, 600);
        assert.ok(Math.abs(items[0].dy - 1) < 1e-9);
        assert.strictEqual(items[0].high_52w, 600);
        assert.strictEqual(items[0].variation_12m, 18);
    });
});

describe('Treasury.gov fallback', () => {
    const { parseTreasuryXml } = require('./economy');
    test('parseTreasuryXml returns the latest 10y yield', () => {
        const xml = '<m:properties><d:BC_10YEAR m:type="Edm.Double">5.28</d:BC_10YEAR></m:properties><m:properties><d:BC_10YEAR m:type="Edm.Double">5.22</d:BC_10YEAR></m:properties>';
        assert.strictEqual(parseTreasuryXml(xml), 5.22);
        assert.strictEqual(parseTreasuryXml(''), null);
    });
});

describe('collectUsData redundancy', () => {
    const { collectUsData } = require('../../export_data_us');
    const quiet = async (fn) => {
        const { warn, log } = console;
        console.warn = () => {};
        console.log = () => {};
        try { return await fn(); } finally { console.warn = warn; console.log = log; }
    };
    const many = (count, make) => Array.from({ length: count }, (_, i) => make(i));
    const stocks = many(1100, i => ({ ...baseStock, ticker: `S${i}`, issuer_key: `S${i}` }));
    const reits = many(60, i => ({ ticker: `R${i}`, cotacao: 50, p_vp: 1.2, p_fcf: 14, dividend_yield: 6, div_br_patrim: 1, market_cap: 5e9, liq_2meses: 10e6 }));
    const etfs = many(320, i => ({ ticker: `E${i}`, name: `Fund ${i}`, price: 100, expense_ratio: 0.1, aum: 1e9, liquidity: 10e6, variation_3y: 20, dy: 1, asset_class: 'EQUITY', leveraged: false }));
    const fail = async () => { throw new Error('down'); };
    const rates = { fedFunds: async () => 3.88, treasury10y: async () => 4.5, dollar: async () => 5 };

    const quotesFor = (items, key, factor = 1.1) => async () => new Map(items.map(i => [i.ticker, { price: i[key] * factor, market_cap: null, variation_12m: 3 }]));

    test('uses TradingView when it works', async () => {
        const data = await quiet(() => collectUsData({ previous: null, sources: {
            ...rates, tvEquities: async () => ({ stocks, reits }), tvEtfs: async () => etfs, nasdaqStockQuotes: fail, nasdaqEtfQuotes: fail
        } }));
        assert.strictEqual(data.source.sections.stocks.provider, 'tradingview');
        assert.strictEqual(data.source.degraded, false);
    });

    test('falls back to Nasdaq prices over the last good fundamentals', async () => {
        const previous = await quiet(() => collectUsData({ previous: null, sources: {
            ...rates, tvEquities: async () => ({ stocks, reits }), tvEtfs: async () => etfs
        } }));
        const data = await quiet(() => collectUsData({ previous, sources: {
            ...rates, tvEquities: fail, tvEtfs: async () => etfs.slice(0, 10),
            nasdaqStockQuotes: quotesFor([...previous.stocks, ...previous.reits], 'cotacao'),
            nasdaqEtfQuotes: quotesFor(previous.etfs, 'price')
        } }));
        assert.strictEqual(data.source.sections.stocks.provider, 'nasdaq');
        assert.strictEqual(data.source.sections.etfs.provider, 'nasdaq');
        assert.strictEqual(data.source.sections.stocks.fundamentalsSince, previous.source.collectedAt);
        assert.strictEqual(data.source.degraded, true);
        assert.ok(Math.abs(data.stocks[0].cotacao - previous.stocks[0].cotacao * 1.1) < 1e-6);
    });

    test('rejects a reprice when too few assets are found on Nasdaq', async () => {
        const previous = { source: { collectedAt: 'x' }, economy: rates, stocks: [{ ticker: 'A', cotacao: 1 }], reits: [{ ticker: 'R', cotacao: 1 }], etfs: [{ ticker: 'E', price: 1 }] };
        const data = await quiet(() => collectUsData({ previous, sources: {
            ...rates, tvEquities: fail, tvEtfs: fail, nasdaqStockQuotes: async () => new Map(), nasdaqEtfQuotes: async () => new Map()
        } }));
        assert.strictEqual(data.source.sections.stocks.provider, 'cache');
        assert.strictEqual(data.source.sections.stocks.stale, true);
    });

    test('keeps last good data, marked stale, when every live source fails', async () => {
        const previous = { source: { collectedAt: '2026-10-07T12:00:00Z' }, economy: { fedFunds: 4, treasury10y: 4.4, dollar: 5.1 }, stocks: [{ ticker: 'OLD' }], reits: [{ ticker: 'OLDR' }], etfs: [{ ticker: 'OLDE' }] };
        const data = await quiet(() => collectUsData({ previous, sources: {
            fedFunds: async () => null, treasury10y: async () => null, dollar: async () => null,
            tvEquities: fail, tvEtfs: async () => etfs, nasdaqStockQuotes: fail, nasdaqEtfQuotes: fail
        } }));
        assert.deepStrictEqual(data.stocks, [{ ticker: 'OLD' }]);
        assert.strictEqual(data.source.sections.stocks.stale, true);
        assert.strictEqual(data.source.sections.stocks.since, '2026-10-07T12:00:00Z');
        assert.strictEqual(data.source.sections.etfs.stale, false);
        assert.strictEqual(data.economy.fedFunds, 4);
        assert.strictEqual(data.source.sections.fedFunds.stale, true);
    });

    test('fails when nothing works and there is no previous data', async () => {
        await assert.rejects(quiet(() => collectUsData({ previous: null, sources: {
            ...rates, tvEquities: fail, tvEtfs: fail, nasdaqStockQuotes: fail, nasdaqEtfQuotes: fail
        } })), /no previous data/);
    });
});
