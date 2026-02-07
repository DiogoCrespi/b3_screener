
const cheerio = require('cheerio');

const FII_URL = 'https://www.fundamentus.com.br/fii_resultado.php';

async function getBestFIIs() {
    try {
        const response = await fetch(FII_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const fiis = [];

        $('#tabelaResultado tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            const parseNumber = (text) => {
                if (!text) return 0;
                return parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', ''));
            };

            // Columns based on Fundamentus FII table:
            // 0: Ticker, 1: Segment, 2: Price, 3: FFO Yield, 4: DY, 5: P/VP, 
            // 6: Market Cap, 7: Liquidity, 8: Properties, 9: Price/m2, 
            // 10: Rent/m2, 11: Cap Rate, 12: Vacancy
            fiis.push({
                ticker: $(tds[0]).text().trim(),
                segment: $(tds[1]).text().trim(),
                price: parseNumber($(tds[2]).text().trim()),
                ffo_yield: parseNumber($(tds[3]).text().trim()),
                dy: parseNumber($(tds[4]).text().trim()),
                p_vp: parseNumber($(tds[5]).text().trim()),
                market_cap: parseNumber($(tds[6]).text().trim()),
                liquidity: parseNumber($(tds[7]).text().trim()),
                num_properties: parseNumber($(tds[8]).text().trim()),
                cap_rate: parseNumber($(tds[11]).text().trim()),
                vacancy: parseNumber($(tds[12]).text().trim())
            });
        });

        return fiis
            .filter(f => f.liquidity > 50000) // Liquidity > 50k
            .filter(f => f.p_vp > 0.4 && f.p_vp < 1.2) // Fair price (not too cheap/distressed, not expensive)
            .filter(f => f.dy > 6) // Good yield
            .filter(f => f.vacancy < 15) // Physical vacancy < 15% (avoid empty properties)
            .sort((a, b) => b.dy - a.dy);

    } catch (error) {
        console.error('Error fetching/parsing FIIs:', error.message);
        return [];
    }
}

module.exports = { getBestFIIs };
