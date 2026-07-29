const fs = require('fs');
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks, demoteDuplicateIssuerRecommendations } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getFIInfra } = require('./services/fi_infra');
const { getETFs } = require('./services/etfs');
const { getTesouroDirect, getPrivateBenchmarks } = require('./services/fixed_income');
const { getMultipleAssetMetadata } = require('./services/investidor10');
const { saveHistory } = require('./services/storage');
const { analyzeStock } = require('./services/logic/stock-rules');

const countBy = (items, selector) => items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
}, {});

async function exportData() {
    console.log('🚀 Starting Data Export for B3 Screener...');

    try {
        // 1. Initial Data Fetch
        // Fetch Selic first to avoid redundant requests in parallel calls
        let selic = await getSelicRate();
        if (selic === null || isNaN(selic)) {
            console.warn('⚠️ Central Bank API timeout for Selic. Using default 10.75% globally.');
            selic = 10.75;
        }
        const [dollar, stocks, rawStandardFiis, rawInfraFiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getBestStocks(selic, { metadataMap: {} }),
            getBestFIIs({}, null, selic), // Pass 1: Discovery from Fundamentus
            getFIInfra(selic),  // Pass 1: Discovery from hardcoded Infra list
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks(selic)
        ]);

        if (dollar === null || Number.isNaN(dollar)) {
            throw new Error('Dollar rate is unavailable; refusing to publish incomplete economy data.');
        }

        // 2. Combine all discovered FIIs to fetch metadata
        const combinedRaw = [...rawStandardFiis, ...rawInfraFiis];
        const allFiiTickers = [...new Set(combinedRaw.map(f => f.ticker))];

        // 3. Select top-ranked stocks to fetch metadata (to save time/requests)
        const stockTickers = stocks.slice(0, 50).map(s => s.ticker);
        const allTickers = [...allFiiTickers, ...stockTickers];

        console.log(`🔍 Found ${allFiiTickers.length} FIIs and ${stockTickers.length} sample stocks. Fetching verified metadata from Investidor 10...`);

        // 4. Fetch verified metadata from Investidor 10
        const metadataMap = await getMultipleAssetMetadata(allTickers, 150);

        // 5. Second Pass: Re-process the combined list through the business logic
        console.log('⚖️  Re-processing all FIIs/Infras with verified metadata...');
        const finalFiis = await getBestFIIs(metadataMap, combinedRaw, selic);

        // 6. Enrich stocks with metadata and re-analyze
        const enrichedStocks = stocks.map(s => {
            const meta = metadataMap[s.ticker] || {};
            const enriched = {
                ...s,
                data_com: meta.data_com || null,
                data_pagamento: meta.data_pagamento || null,
                divida_ebitda: meta.divida_ebitda !== undefined ? meta.divida_ebitda : null,
                dividends_last_3_years: meta.dividends_last_3_years !== undefined ? meta.dividends_last_3_years : 0
            };
            return analyzeStock(enriched, selic);
        });

        const deduplicatedStocks = demoteDuplicateIssuerRecommendations(enrichedStocks);

        const finalStocks = deduplicatedStocks.sort((a, b) => {
            const order = { TOP_PICK: 0, OPPORTUNITY: 1, WATCHLIST: 2, REVIEW: 3, DISTRESSED: 4 };
            const isStarA = ['STAR_INCOME', 'STAR_GROWTH', 'STAR_VALUE'].includes(a.category);
            const isStarB = ['STAR_INCOME', 'STAR_GROWTH', 'STAR_VALUE'].includes(b.category);
            const aOrder = a.signal ? (order[a.signal] ?? 5) : (isStarA ? 0 : 1);
            const bOrder = b.signal ? (order[b.signal] ?? 5) : (isStarB ? 0 : 1);
            return aOrder - bOrder || (b.overall_score ?? b.score) - (a.overall_score ?? a.score);
        });

        const data = {
            updatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            economy: { dollar, selic },
            stocks: finalStocks,
            fiis: finalFiis,
            etfs,
            fixedIncome: {
                tesouro,
                private: privateFixed
            }
        };

        const MIN_STOCKS = 100;
        const MIN_FIIS = 50;
        if (finalStocks.length < MIN_STOCKS) {
            console.error(`❌ CRITICAL: Only ${finalStocks.length} stocks fetched (minimum ${MIN_STOCKS}). Aborting to prevent overwriting with partial data.`);
            process.exit(1);
        }
        if (finalFiis.length < MIN_FIIS) {
            console.error(`❌ CRITICAL: Only ${finalFiis.length} FIIs fetched (minimum ${MIN_FIIS}). Aborting to prevent overwriting with partial data.`);
            process.exit(1);
        }

        const fileContent = `window.INVEST_DATA = ${JSON.stringify(data, null, 2)};`;
        fs.writeFileSync('data.js', fileContent);

        // --- Save History ---
        saveHistory(finalStocks, 'stock', { dollar, selic });
        saveHistory(finalFiis, 'fii', { dollar, selic });

        const stats = {
            total: finalFiis.length,
            infra: finalFiis.filter(f => f.type === 'INFRA').length,
            agro: finalFiis.filter(f => f.type === 'AGRO').length,
            papel: finalFiis.filter(f => f.type === 'PAPEL').length,
            tijolo: finalFiis.filter(f => f.type === 'TIJOLO').length,
            multi: finalFiis.filter(f => f.type === 'MULTI').length,
            etfs: etfs.length,
            stockSignals: countBy(finalStocks, stock => stock.signal || 'LEGACY'),
            stockCategories: countBy(finalStocks, stock => stock.category || 'NONE'),
            fundExposures: countBy(finalFiis, fund => fund.exposure || 'UNKNOWN')
        };

        console.log('✅ Data exported successfully!');
        console.log(`📊 Statistics: ${stats.total} FIIs, ${stats.etfs} ETFs (${stats.tijolo} Tijolo, ${stats.papel} Papel, ${stats.agro} Agro, ${stats.infra} Infra, ${stats.multi} Multi)`);
        console.log('Stock signals:', stats.stockSignals);
        console.log('Stock categories:', stats.stockCategories);
        console.log('Fund exposures:', stats.fundExposures);
        return data;

    } catch (error) {
        console.error('❌ Error exporting data:', error);
        throw error;
    }
}

if (require.main === module) {
    exportData().catch(() => {
        process.exitCode = 1;
    });
}

module.exports = { exportData };
