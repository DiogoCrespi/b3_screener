
// services/stocks.js
const FundamentusStockAdapter = require('./adapters/fundamentus-stock-adapter');
const BrapiStockAdapter = require('./adapters/brapi-stock-adapter');
const { analyzeStock } = require('./logic/stock-rules');
const { getSelicRate } = require('./economy');

function demoteDuplicateIssuerRecommendations(stocks) {
    const selectedIssuers = new Set();
    return stocks.map(stock => {
        if (stock.signal !== 'TOP_PICK' || !stock.issuer_key) return stock;
        if (!selectedIssuers.has(stock.issuer_key)) {
            selectedIssuers.add(stock.issuer_key);
            return stock;
        }
        return {
            ...stock,
            signal: 'WATCHLIST',
            category: null,
            warnings: [...(stock.warnings || []), 'DUPLICATE_ISSUER_SHARE_CLASS']
        };
    });
}

async function getBestStocks(selicParam = null, dependencies = {}) {
    // Inject dependencies for testing
    const {
        FundamentusAdapter = FundamentusStockAdapter,
        BrapiAdapter = BrapiStockAdapter,
        stockAnalyzer = analyzeStock,
        selicFetcher = getSelicRate
    } = dependencies;

    let rawStocks = [];

    // 1. Fetch Data (Adapter Pattern with Failover)
    try {
        const fundamentusAdapter = new FundamentusAdapter();
        rawStocks = await fundamentusAdapter.getStocks();
    } catch (fundamentusError) {
        console.warn('⚠️  Fundamentus failed:', fundamentusError.message);
        console.log('🔄 Switching to Brapi.dev backup...');

        try {
            const brapiAdapter = new BrapiAdapter();
            rawStocks = await brapiAdapter.getStocks();
            console.log(`✅ Successfully fetched ${rawStocks.length} stocks from Brapi.dev`);
        } catch (brapiError) {
            console.error('❌ Both data sources failed!');
            console.error('Fundamentus:', fundamentusError.message);
            console.error('Brapi:', brapiError.message);
            return [];
        }
    }

    try {

        // 2. Get Context (Selic)
        let selic = selicParam;
        if (!selic) {
            const fetchedSelic = await selicFetcher();
            if (fetchedSelic !== null) {
                selic = fetchedSelic;
            } else {
                console.warn('⚠️  Could not fetch Selic, using default 12.75%.');
                selic = 12.75;
            }
        }

        // 3. Apply Business Logic (Strategy Pattern)
        const enrichedStocks = rawStocks
            .filter(s => s.liq_2meses > 200000) // Basic liquidity filter
            .map(s => stockAnalyzer(s, selic))   // Apply rules/scoring
            .filter(s => s.signal ? s.signal !== 'INSUFFICIENT_DATA' : s.category !== null)
            .sort((a, b) => {
                const order = { TOP_PICK: 0, OPPORTUNITY: 1, WATCHLIST: 2, REVIEW: 3, DISTRESSED: 4 };
                const aOrder = a.signal ? (order[a.signal] ?? 5) : (a.category === 'STAR' ? 0 : 1);
                const bOrder = b.signal ? (order[b.signal] ?? 5) : (b.category === 'STAR' ? 0 : 1);
                return aOrder - bOrder || (b.overall_score ?? b.score) - (a.overall_score ?? a.score);
            });

        // CRITICAL: Differentiated liquidity for STARS vs OPPORTUNITIES
        // STARS need 300k+ (captures quality small caps), OPPORTUNITIES can have 200k+ (value investing tolerance)
        const deduplicatedStocks = demoteDuplicateIssuerRecommendations(enrichedStocks);
        const stars = deduplicatedStocks.filter(s => s.category === 'STAR' && s.liq_2meses > 300000);
        const opportunities = deduplicatedStocks.filter(s => s.category === 'OPPORTUNITY');
        const review = deduplicatedStocks.filter(s => !['STAR', 'OPPORTUNITY'].includes(s.category));

        return [...stars, ...opportunities, ...review];

    } catch (error) {
        console.error('Error in stock analysis/filtering:', error.message);
        return [];
    }
}

module.exports = { getBestStocks, demoteDuplicateIssuerRecommendations };
