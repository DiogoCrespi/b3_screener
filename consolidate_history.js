const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, 'history');
const OUTPUT_DIR = __dirname;

function consolidate() {
    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));
    
    const fiisFiles = files.filter(f => f.includes('fii')).sort();
    const stocksFiles = files.filter(f => f.includes('stock')).sort();

    function processFiles(fileList, type) {
        const history = {}; // ticker -> [ { date, price, variation } ]
        
        fileList.forEach((filename, index) => {
            const filePath = path.join(HISTORY_DIR, filename);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const date = content.date.split('T')[0];
            const items = content.items || [];

            items.forEach(item => {
                const ticker = item.ticker;
                const price = type === 'fii' ? item.price : item.cotacao;

                if (!history[ticker]) {
                    history[ticker] = [];
                }

                let variation = 0;
                if (history[ticker].length > 0) {
                    const lastPrice = history[ticker][history[ticker].length - 1].price;
                    if (lastPrice && lastPrice !== 0) {
                        variation = ((price - lastPrice) / lastPrice) * 100;
                    }
                }

                history[ticker].push({
                    date,
                    price,
                    variation: parseFloat(variation.toFixed(2))
                });
            });
        });

        // Clean up: only keep tickers that have more than 1 entry (variation makes sense)
        // Or keep all? User said "daily variation", so entries with 0 variation are fine too.
        
        return history;
    }

    console.log('Processing FIIs...');
    const fiiHistory = processFiles(fiisFiles, 'fii');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'consolidated_fiis.json'), JSON.stringify(fiiHistory, null, 2));
    exportCSV(fiiHistory, 'consolidated_fiis.csv');

    console.log('Processing Stocks...');
    const stockHistory = processFiles(stocksFiles, 'stock');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'consolidated_stocks.json'), JSON.stringify(stockHistory, null, 2));
    exportCSV(stockHistory, 'consolidated_stocks.csv');

    console.log('Success! Files generated: JSON and CSV for FIIs and Stocks.');
}

function exportCSV(history, filename) {
    const tickers = Object.keys(history).sort();
    if (tickers.length === 0) return;

    // Get all unique dates
    const datesSet = new Set();
    tickers.forEach(t => {
        history[t].forEach(h => datesSet.add(h.date));
    });
    const dates = Array.from(datesSet).sort();

    // Create header: Ticker, Date1 Price, Date1 Var, Date2 Price, Date2 Var, ...
    let csv = 'Ticker,' + dates.map(d => `${d} (Price),${d} (Var)`).join(',') + '\n';

    tickers.forEach(ticker => {
        let row = ticker;
        dates.forEach(date => {
            const entry = history[ticker].find(h => h.date === date);
            if (entry) {
                row += `,${entry.price},${entry.variation}%`;
            } else {
                row += ',,';
            }
        });
        csv += row + '\n';
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, filename), csv);
}

consolidate();
