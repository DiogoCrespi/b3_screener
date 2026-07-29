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
        function getPrevData() {
            try {
                if (fs.existsSync('data.js')) {
                    const prevSrc = fs.readFileSync('data.js', 'utf8');
                    const match = prevSrc.match(/window\.INVEST_DATA\s*=\s*(\{[\s\S]*?\});\s*$/m);
                    if (match) return JSON.parse(match[1]);
                }
            } catch (e) {}
            return null;
        }

        const prevData = getPrevData();

        let selic = await getSelicRate();
        if (selic === null || isNaN(selic)) {
            const prevSelic = prevData?.economy?.selic;
            if (typeof prevSelic === 'number' && prevSelic > 0) {
                console.warn(`⚠️ Selic API timeout. Reusing last recorded real Selic: ${prevSelic}%`);
                selic = prevSelic;
            } else {
                console.warn('⚠️ Selic API timeout and no previous data found. Defaulting to 10.75%.');
                selic = 10.75;
            }
        }

        let [dollar, stocks, rawStandardFiis, rawInfraFiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getBestStocks(selic, { metadataMap: {} }),
            getBestFIIs({}, null, selic), // Pass 1: Discovery from Fundamentus
            getFIInfra(selic),  // Pass 1: Discovery from hardcoded Infra list
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks(selic)
        ]);

        if (dollar === null || Number.isNaN(dollar)) {
            const prevDollar = prevData?.economy?.dollar;
            if (typeof prevDollar === 'number' && prevDollar > 0) {
                console.warn(`⚠️ Dollar API unavailable. Reusing last recorded real dollar rate: R$ ${prevDollar}`);
                dollar = prevDollar;
            } else {
                throw new Error('Dollar rate is unavailable and no previous valid rate exists.');
            }
        }

        // 2. Combine all discovered FIIs to fetch metadata
        const combinedRaw = [...rawStandardFiis, ...rawInfraFiis];
        const allFiiTickers = [...new Set(combinedRaw.map(f => f.ticker))];

        // 3. Select top-ranked stocks to fetch metadata (to save time/requests)
        const stockTickers = stocks.slice(0, 50).map(s => s.ticker);
        const allTickers = [...allFiiTickers, ...stockTickers];

        console.log(`🔍 Found ${allFiiTickers.length} FIIs and ${stockTickers.length} sample stocks. Fetching verified metadata from Investidor 10...`);

        // 4. Fetch verified metadata from Investidor 10
        let metadataMap = {};
        try {
            metadataMap = await getMultipleAssetMetadata(allTickers, 150);
        } catch (metaErr) {
            console.warn('⚠️ Could not fetch asset metadata from Investidor 10:', metaErr.message);
        }

        // 5. Second Pass: Re-process the combined list through the business logic
        console.log('⚖️  Re-processing all FIIs/Infras with verified metadata...');
        let finalFiis = await getBestFIIs(metadataMap, combinedRaw, selic);

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

        let finalStocks = deduplicatedStocks.sort((a, b) => {
            const order = { TOP_PICK: 0, OPPORTUNITY: 1, WATCHLIST: 2, REVIEW: 3, DISTRESSED: 4 };
            const isStarA = ['STAR_INCOME', 'STAR_GROWTH', 'STAR_VALUE'].includes(a.category);
            const isStarB = ['STAR_INCOME', 'STAR_GROWTH', 'STAR_VALUE'].includes(b.category);
            const aOrder = a.signal ? (order[a.signal] ?? 5) : (isStarA ? 0 : 1);
            const bOrder = b.signal ? (order[b.signal] ?? 5) : (isStarB ? 0 : 1);
            return aOrder - bOrder || (b.overall_score ?? b.score) - (a.overall_score ?? a.score);
        });

        // 🛡️ Fallback de segurança: Se a raspagem ao vivo retornou contagens anormais por instabilidade das fontes, recupera do data.js atual
        const MIN_STOCKS = 100;
        const MIN_FIIS = 50;

        if (finalStocks.length < MIN_STOCKS && fs.existsSync('data.js')) {
            console.warn(`⚠️ Only ${finalStocks.length} stocks fetched. Recovering previous stocks from data.js...`);
            try {
                const prevSrc = fs.readFileSync('data.js', 'utf8');
                const match = prevSrc.match(/window\.INVEST_DATA\s*=\s*(\{[\s\S]*?\});\s*$/m);
                if (match) {
                    const prevData = JSON.parse(match[1]);
                    if (Array.isArray(prevData.stocks) && prevData.stocks.length >= MIN_STOCKS) {
                        finalStocks = prevData.stocks;
                        console.log(`✅ Recovered ${finalStocks.length} stocks from existing data.js.`);
                    }
                }
            } catch (e) {
                console.error('Could not recover stocks from data.js:', e.message);
            }
        }

        if (finalFiis.length < MIN_FIIS && fs.existsSync('data.js')) {
            console.warn(`⚠️ Only ${finalFiis.length} FIIs fetched. Recovering previous FIIs from data.js...`);
            try {
                const prevSrc = fs.readFileSync('data.js', 'utf8');
                const match = prevSrc.match(/window\.INVEST_DATA\s*=\s*(\{[\s\S]*?\});\s*$/m);
                if (match) {
                    const prevData = JSON.parse(match[1]);
                    if (Array.isArray(prevData.fiis) && prevData.fiis.length >= MIN_FIIS) {
                        finalFiis = prevData.fiis;
                        console.log(`✅ Recovered ${finalFiis.length} FIIs from existing data.js.`);
                    }
                }
            } catch (e) {
                console.error('Could not recover FIIs from data.js:', e.message);
            }
        }

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
