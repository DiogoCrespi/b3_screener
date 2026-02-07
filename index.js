
const { getDollarRate, getSelicRate } = require('./services/economy');
const { getBestStocks } = require('./services/stocks');
const { getBestFIIs } = require('./services/fiis');
const { getETFs } = require('./services/etfs');

async function main() {
    console.clear();
    console.log('--- B3 SCREENER DASHBOARD ---\n');
    console.log('Fetching data... please wait.');

    const [dollar, selic, stocks, fiis, etfs] = await Promise.all([
        getDollarRate(),
        getSelicRate(),
        getBestStocks(),
        getBestFIIs(),
        getETFs()
    ]);

    console.clear();
    console.log('================================================================================');
    console.log(` 🇧🇷 B3 DASHBOARD | 💵 USD: R$ ${dollar?.toFixed(2) || 'N/A'} | 📈 SELIC: ${selic || 'N/A'}% `);
    console.log('================================================================================\n');

    // --- STOCKS ---
    console.log('--- 🏢 TOP STOCKS (Graham & Debt Filter) ---');
    console.log('Criteria: P/VP < 1.2, DY > 6%, Debt/Eq < 1, Liq > 100k');
    console.log('-'.repeat(80));
    console.log(
        'Ticker'.padEnd(8) + 'Price'.padEnd(9) + 'P/VP'.padEnd(8) +
        'DY(%)'.padEnd(9) + 'Debt/Eq'.padEnd(9) + 'Graham'.padEnd(9) + 'Upside'
    );
    console.log('-'.repeat(80));

    if (stocks.length > 0) {
        stocks.slice(0, 10).forEach(s => {
            console.log(
                s.ticker.padEnd(8) +
                s.cotacao.toFixed(2).padEnd(9) +
                s.p_vp.toFixed(2).padEnd(8) +
                (s.dividend_yield + '%').padEnd(9) +
                s.div_brut_patr.toFixed(2).padEnd(9) +
                s.graham_price.toFixed(2).padEnd(9) +
                (s.upside.toFixed(0) + '%')
            );
        });
        console.log(`... and ${stocks.length - 10} more matches.`);
    } else {
        console.log('No stocks found matching criteria.');
    }
    console.log('\n');

    // --- FIIs ---
    console.log('--- 🏘️  TOP FIIs (Real Estate) ---');
    console.log('Criteria: DY > 6%, P/VP 0.4-1.2, Vacancy < 15%, Liq > 50k');
    console.log('-'.repeat(80));
    console.log(
        'Ticker'.padEnd(8) + 'Price'.padEnd(9) + 'P/VP'.padEnd(8) +
        'DY(%)'.padEnd(9) + 'Vacancy'.padEnd(9) + 'Liquidity'
    );
    console.log('-'.repeat(80));

    if (fiis.length > 0) {
        fiis.slice(0, 10).forEach(f => {
            console.log(
                f.ticker.padEnd(8) +
                f.price.toFixed(2).padEnd(9) +
                f.p_vp.toFixed(2).padEnd(8) +
                (f.dy + '%').padEnd(9) +
                (f.vacancy + '%').padEnd(9) +
                f.liquidity.toLocaleString('pt-BR')
            );
        });
        console.log(`... and ${fiis.length - 10} more matches.`);
    } else {
        console.log('No FIIs found matching criteria.');
    }
    console.log('\n');

    // --- ETFs ---
    console.log('--- 📊 POPULAR ETFs ---');
    console.log('-'.repeat(80));
    etfs.forEach(e => {
        console.log(`${e.ticker.padEnd(8)} | ${e.name} (${e.type})`);
    });
    console.log('\n');
    console.log('================================================================================');
}

main();
