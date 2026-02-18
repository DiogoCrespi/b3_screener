const fs = require('fs');
const path = require('path');
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getFIInfra } = require('./services/fi_infra');
const { getETFs } = require('./services/etfs');
const { getTesouroDirect, getPrivateBenchmarks } = require('./services/fixed_income');
const { getMultipleAssetMetadata } = require('./services/investidor10');
const { getDividendHistory, saveHistory } = require('./services/dividend_history');

async function exportData() {
    console.log('🚀 Starting Data Export for B3 Screener...');
    // Create history directory if not exists
    const historyDir = path.join(__dirname, 'history');
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    try {
        // 1. Initial Data Fetch
        // Fetch Selic first to avoid redundant requests in parallel calls
        const selic = await getSelicRate();
        const [dollar, stocks, rawStandardFiis, rawInfraFiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getBestStocks(selic),
            getBestFIIs({}, null, selic), // Pass 1: Discovery from Fundamentus
            getFIInfra(selic),  // Pass 1: Discovery from hardcoded Infra list
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks(selic)
        ]);

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

        // 6. Enrich stocks with metadata (Dividend Dates)
        const finalStocks = stocks.map(s => {
            const meta = metadataMap[s.ticker] || {};
            return {
                ...s,
                data_com: meta.data_com || null,
                data_pagamento: meta.data_pagamento || null
            };
        });

        // 7. Fetch Dividend History for Top Assets (for Chart Analysis)
        console.log('📈 Fetching Dividend History for top assets...');
        const topStocks = finalStocks.filter(s => s.category === 'STAR').slice(0, 30);
        const topFiis = finalFiis.filter(f => f.category === 'STAR' || f.score >= 5).slice(0, 30);
        const historyCandidates = [...topStocks, ...topFiis];

        for (const asset of historyCandidates) {
            const historyPath = path.join(historyDir, `${asset.ticker}.json`);

            // Basic cache: skip if file exists and was updated in the last 24h
            let shouldUpdate = true;
            if (fs.existsSync(historyPath)) {
                const stats = fs.statSync(historyPath);
                const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
                if (ageHours < 24) shouldUpdate = false;
            }

            if (shouldUpdate) {
                console.log(`   History for ${asset.ticker}...`);
                const history = await getDividendHistory(asset.ticker);
                if (history.length > 0) {
                    await saveHistory(asset.ticker, history);
                }
                await new Promise(r => setTimeout(r, 500)); // Rate limit
            }
        }

        const data = {
            updatedAt: new Date().toLocaleString('pt-BR'),
            economy: { dollar, selic },
            stocks: finalStocks,
            fiis: finalFiis,
            etfs,
            fixedIncome: {
                tesouro,
                private: privateFixed
            }
        };

        if (stocks.length === 0 && finalFiis.length === 0) {
            console.error('❌ CRITICAL: No data fetched (0 stocks, 0 FIIs). Aborting save to prevent overwriting with empty data.');
            process.exit(1);
        }

        const fileContent = `window.INVEST_DATA = ${JSON.stringify(data, null, 2)};`;
        fs.writeFileSync('data.js', fileContent);

        const stats = {
            total: finalFiis.length,
            infra: finalFiis.filter(f => f.type === 'INFRA').length,
            agro: finalFiis.filter(f => f.type === 'AGRO').length,
            papel: finalFiis.filter(f => f.type === 'PAPEL').length,
            tijolo: finalFiis.filter(f => f.type === 'TIJOLO').length,
            multi: finalFiis.filter(f => f.type === 'MULTI').length,
            etfs: etfs.length
        };

        console.log('✅ Data exported successfully!');
        console.log(`📊 Statistics: ${stats.total} FIIs, ${stats.etfs} ETFs (${stats.tijolo} Tijolo, ${stats.papel} Papel, ${stats.agro} Agro, ${stats.infra} Infra, ${stats.multi} Multi)`);

    } catch (error) {
        console.error('❌ Error exporting data:', error);
    }
}

exportData();
