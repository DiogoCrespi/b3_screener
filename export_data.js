const fs = require('fs');
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getFIInfra } = require('./services/fi_infra');
const { getETFs } = require('./services/etfs');
const { getTesouroDirect, getPrivateBenchmarks } = require('./services/fixed_income');
const { getMultipleFiiMetadata } = require('./services/investidor10');

async function exportData() {
    console.log('🚀 Starting Data Export for B3 Screener...');

    try {
        // 1. Initial Data Fetch (Parallel)
        const [dollar, selic, stocks, rawStandardFiis, rawInfraFiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getSelicRate(),
            getBestStocks(),
            getBestFIIs(), // Pass 1: Discovery from Fundamentus
            getFIInfra(),  // Pass 1: Discovery from hardcoded Infra list
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks()
        ]);

        // 2. Combine all discovered FIIs to fetch metadata
        const combinedRaw = [...rawStandardFiis, ...rawInfraFiis];
        const allTickers = [...new Set(combinedRaw.map(f => f.ticker))];
        console.log(`🔍 Found ${allTickers.length} unique tickers. Fetching verified metadata from Investidor 10...`);

        // 3. Fetch verified metadata from Investidor 10
        const metadataMap = await getMultipleFiiMetadata(allTickers, 150);

        // 4. Second Pass: Re-process the combined list through the business logic
        // This ensures all assets (Standard, Infra, Agro) use the SAME scoring and classification rules
        console.log('⚖️  Re-processing all FIIs/Infras with verified metadata...');
        const finalFiis = await getBestFIIs(metadataMap, combinedRaw);

        const data = {
            updatedAt: new Date().toLocaleString('pt-BR'),
            economy: { dollar, selic },
            stocks: stocks,
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
            multi: finalFiis.filter(f => f.type === 'MULTI').length
        };

        console.log('✅ Data exported successfully!');
        console.log(`📊 Statistics: ${stats.total} Assets (${stats.tijolo} Tijolo, ${stats.papel} Papel, ${stats.agro} Agro, ${stats.infra} Infra, ${stats.multi} Multi)`);

    } catch (error) {
        console.error('❌ Error exporting data:', error);
    }
}

exportData();
