
const fs = require('fs');
const cheerio = require('cheerio');

const FUNDAMENTUS_URL = 'https://www.fundamentus.com.br/resultado.php';

async function fetchStockData() {
    try {
        console.log('Fetching data from Fundamentus...');
        const response = await fetch(FUNDAMENTUS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        return html;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

function parseData(html) {
    console.log('Parsing data...');
    const $ = cheerio.load(html);
    const stocks = [];

    $('#resultado tbody tr').each((i, el) => {
        const tds = $(el).find('td');

        // Helper to parse Brazilian number format (e.g., "1.234,56" -> 1234.56)
        const parseNumber = (text) => {
            if (!text) return 0;
            return parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', ''));
        };

        const ticker = $(tds[0]).text().trim();
        const cotacao = parseNumber($(tds[1]).text().trim());
        const p_l = parseNumber($(tds[2]).text().trim());
        const p_vp = parseNumber($(tds[3]).text().trim());
        const psr = parseNumber($(tds[4]).text().trim());
        const dividend_yield = parseNumber($(tds[5]).text().trim()); // This is a percentage
        const p_ativo = parseNumber($(tds[6]).text().trim());
        const p_cap_giro = parseNumber($(tds[7]).text().trim());
        const p_ebit = parseNumber($(tds[8]).text().trim());
        const p_ativ_circ_liq = parseNumber($(tds[9]).text().trim());
        const ev_ebit = parseNumber($(tds[10]).text().trim());
        const ev_ebitda = parseNumber($(tds[11]).text().trim());
        const mrg_ebit = parseNumber($(tds[12]).text().trim());
        const mrg_liq = parseNumber($(tds[13]).text().trim());
        const liq_corr = parseNumber($(tds[14]).text().trim());
        const roic = parseNumber($(tds[15]).text().trim());
        const roe = parseNumber($(tds[16]).text().trim());
        const liq_2meses = parseNumber($(tds[17]).text().trim());
        const patrimonio_liq = parseNumber($(tds[18]).text().trim());
        const div_brut_patr = parseNumber($(tds[19]).text().trim());
        const cresc_rec_5a = parseNumber($(tds[20]).text().trim());

        stocks.push({
            ticker,
            cotacao,
            p_l,
            p_vp,
            dividend_yield,
            roe,
            liq_2meses, // Liquidity to filter out illiquid stocks
            div_brut_patr // Debt/Equity
        });
    });

    return stocks;
}

function filterAndSort(stocks) {
    console.log('Filtering and sorting...');
    // Criteria for "Best Offers":
    // 1. liquidity > 100k
    // 2. P/VP > 0 (positive book value) and < 1.5 (undervalued or fair)
    // 3. Dividend Yield > 6% (good payer)
    // 4. P/L > 0 (profitable)

    return stocks
        .filter(s => s.liq_2meses > 100000)
        .filter(s => s.p_vp > 0 && s.p_vp < 1.2)
        .filter(s => s.dividend_yield > 6)
        .filter(s => s.p_l > 0 && s.p_l < 15)
        .filter(s => s.div_brut_patr < 1.0) // Debt < Equity (Safety)
        .map(s => {
            // Graham Formula: Fair Value = Sqrt(22.5 * LPA * VPA)
            // Or simpler: Fair Value = Price * Sqrt(22.5 / (P/L * P/VP))
            // We only calculate if P/L and P/VP are positive (already filtered)
            const graham_price = s.cotacao * Math.sqrt(22.5 / (s.p_l * s.p_vp));
            const upside = ((graham_price - s.cotacao) / s.cotacao) * 100;
            return { ...s, graham_price, upside };
        })
        .sort((a, b) => b.dividend_yield - a.dividend_yield); // Sort by Dividend Yield descending
}

function displayResults(stocks) {
    console.log('\n--- BEST OFFERS (Graham, Debt < 1, P/VP < 1.2, DY > 6%) ---');
    console.log('Sorted by Dividend Yield (High to Low)\n');

    console.log(
        'Ticker'.padEnd(8) +
        'Price'.padEnd(9) +
        'P/VP'.padEnd(8) +
        'P/L'.padEnd(8) +
        'DY(%)'.padEnd(9) +
        'Div/Pat'.padEnd(9) +
        'Graham'.padEnd(9) +
        'Upside'
    );
    console.log('-'.repeat(75));

    stocks.slice(0, 20).forEach(s => { // Show top 20
        console.log(
            s.ticker.padEnd(8) +
            s.cotacao.toFixed(2).padEnd(9) +
            s.p_vp.toFixed(2).padEnd(8) +
            s.p_l.toFixed(2).padEnd(8) +
            (s.dividend_yield + '%').padEnd(9) +
            s.div_brut_patr.toFixed(2).padEnd(9) +
            s.graham_price.toFixed(2).padEnd(9) +
            (s.upside.toFixed(0) + '%')
        );
    });
    console.log(`\nTotal matches: ${stocks.length}`);
}

async function main() {
    const html = await fetchStockData();
    if (html) {
        const stocks = parseData(html);
        console.log(`\nTotal stocks found: ${stocks.length}`);
        const bestStocks = filterAndSort(stocks);
        displayResults(bestStocks);
    }
}

main();
