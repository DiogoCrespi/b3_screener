const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getMultipleFiiMetadata } = require('./services/investidor10');
const { getFIInfra } = require('./services/fi_infra');
const { saveHistory } = require('./services/storage');

function filterAssets(assets, config) {
    return assets.filter(item => {
        const itemLiquidity = item.liq_2meses || item.liquidity || 0;
        const itemYield = item.dividend_yield || item.dy || 0;
        const itemP_VP = item.p_vp || 0;
        const itemScore = item.score || 0;
        const itemDebt = item.div_br_patrim || 0;
        const itemStrategies = item.strategies || [item.category].filter(Boolean);

        if (itemLiquidity < config.minLiquidity) return false;
        if (itemYield < config.minYield) return false;
        if (itemP_VP > config.maxP_VP || itemP_VP < config.minP_VP) return false;
        if (config.assetType === 'stock' && itemDebt > config.maxDebtEq) return false;
        if (itemScore < config.minScore) return false;
        if (config.excludedStrategies.some(strategy => itemStrategies.includes(strategy))) return false;
        return true;
    });
}

class Screener {
    constructor() {
        this.config = {
            assetType: 'stock', // default
            minLiquidity: 0,
            minYield: 0,
            maxP_VP: 999,
            minP_VP: 0,
            excludedStrategies: [],
            minScore: 0,
            maxDebtEq: 999
        };
    }

    assetType(type) {
        if (!['stock', 'fii'].includes(type.toLowerCase())) {
            throw new Error('Invalid asset type. Use "stock" or "fii".');
        }
        this.config.assetType = type.toLowerCase();
        return this;
    }

    minLiquidity(value) {
        this.config.minLiquidity = value;
        return this;
    }

    minYield(value) {
        this.config.minYield = value;
        return this;
    }

    maxP_VP(value) {
        this.config.maxP_VP = value;
        return this;
    }

    minP_VP(value) {
        this.config.minP_VP = value;
        return this;
    }

    maxDebtEq(value) {
        this.config.maxDebtEq = value;
        return this;
    }

    minScore(value) {
        this.config.minScore = value;
        return this;
    }

    excludeStrategies(strategies) {
        if (Array.isArray(strategies)) {
            this.config.excludedStrategies = strategies;
        }
        return this;
    }

    save(shouldSave = true) {
        this.config.shouldSave = shouldSave;
        return this;
    }

    setEconomy(dollar, selic) {
        this.config.economy = { dollar, selic };
        return this;
    }

    async run() {
        console.log(`\n🚀 Starting Screener for [${this.config.assetType.toUpperCase()}]...`);
        let assets = [];

        try {
            const selic = this.config.economy?.selic;
            if (this.config.assetType === 'stock') {
                assets = await getBestStocks(selic);
            } else if (this.config.assetType === 'fii') {
                // 1. First pass: Get FIIs from Fundamentus
                console.log('📊 Fetching basic FII data from Fundamentus and FI-Infra discovery...');
                const [standardList, infraList] = await Promise.all([
                    getBestFIIs({}, null, selic),
                    getFIInfra(selic)
                ]);
                const initialList = [...standardList, ...infraList];

                // 2. Filter to just the relevant ones to save time on scraping
                // We apply the liquidity filter here again just to be safe/efficient
                const candidates = initialList.filter(f => f.liquidity > (this.config.minLiquidity || 0));

                console.log(`🔍 Found ${candidates.length} candidate FIIs. Fetching metadata from Investidor10...`);

                // 3. Extract tickers and fetch metadata (batch size or delay handled by service)
                const tickers = candidates.map(f => f.ticker);
                // Reduce delay to 20ms for faster execution if we have many tickers, or keep 100ms
                const metadata = await getMultipleFiiMetadata(tickers, 50);

                // 4. Second pass: Re-run classification with metadata
                // We pass 'candidates' as baseList so we don't re-fetch from Fundamentus
                // Note: getBestFIIs expects metadata as first arg
                assets = await getBestFIIs(metadata, candidates, selic);
            }
        } catch (err) {
            console.error('Error fetching assets:', err);
            return [];
        }

        console.log(`\n📥 Total assets processed: ${assets.length} items.`);

        // Apply Filters
        const results = filterAssets(assets, this.config);
        console.log(`✅ Filtered down to: ${results.length} items.`);

        if (this.config.shouldSave) {
            saveHistory(results, this.config.assetType, this.config.economy);
        }

        console.log('\n');
        return results;
    }
}

module.exports = Screener;
module.exports.filterAssets = filterAssets;
