
const fs = require('fs');
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getETFs } = require('./services/etfs');
const { getTesouroDirect, getPrivateBenchmarks } = require('./services/fixed_income');

async function exportData() {
    console.log('Fetching data for mobile app...');

    try {
        const [dollar, selic, stocks, fiis, etfs, tesouro, privateFixed] = await Promise.all([
            getDollarRate(),
            getSelicRate(),
            getBestStocks(),
            getBestFIIs(),
            getETFs(),
            getTesouroDirect(),
            getPrivateBenchmarks()
        ]);

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
