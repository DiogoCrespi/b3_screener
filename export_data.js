const fs = require('fs');
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getFIInfra } = require('./services/fi_infra');
const { getETFs } = require('./services/etfs');
const { getTesouroDirect, getPrivateBenchmarks } = require('./services/fixed_income');

async function exportData() {
    console.log('Fetching data for mobile app...');

    try {
        const [dollar, selic, stocks, baseFiis, infraFiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getSelicRate(),
            getBestStocks(),
            getBestFIIs(),
            getFIInfra(),
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks()
        ]);

        // Merge FIIs and Infras
        const fiis = [...baseFiis, ...infraFiis];

        // Fetch last dividends from Investidor10
        console.log('📊 Fetching last dividends from Investidor10...');
        const { getLastDividends } = require('./services/last_dividend');
        const tickers = fiis.map(f => f.ticker);
        const lastDividends = await getLastDividends(tickers, 200); // 200ms delay between requests

        // Add last_dividend to each FII
        fiis.forEach(fii => {
            fii.last_dividend = lastDividends[fii.ticker] || null;
        });
        console.log(`✅ Fetched last dividends for ${Object.keys(lastDividends).filter(k => lastDividends[k] !== null).length}/${fiis.length} FIIs`);

        const data = {
            updatedAt: new Date().toLocaleString('pt-BR'),
            economy: { dollar, selic },
            stocks: stocks,
            fiis: fiis,
            etfs,
            fixedIncome: {
                tesouro,
                private: privateFixed
            }
        };

        // Saving as a JS file that sets a global variable is the easiest way 
        // to load data locally without CORS issues (opening html file directly).
        const fileContent = `window.INVEST_DATA = ${JSON.stringify(data, null, 2)};`;

        fs.writeFileSync('data.js', fileContent);
        console.log('✅ Data exported to data.js successfully!');

    } catch (error) {
        console.error('❌ Error exporting data:', error);
    }
}

exportData();
