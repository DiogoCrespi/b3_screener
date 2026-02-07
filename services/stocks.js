
const cheerio = require('cheerio');

const FUNDAMENTUS_URL = 'https://www.fundamentus.com.br/resultado.php';

async function getBestStocks() {
    try {
        const response = await fetch(FUNDAMENTUS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const stocks = [];

        $('#resultado tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            const parseNumber = (text) => {
                if (!text) return 0;
                return parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', ''));
            };

            stocks.push({
                ticker: $(tds[0]).text().trim(),
                cotacao: parseNumber($(tds[1]).text().trim()),
                pl: parseNumber($(tds[2]).text().trim()),
                p_vp: parseNumber($(tds[3]).text().trim()),
                dividend_yield: parseNumber($(tds[5]).text().trim()),
                roe: parseNumber($(tds[16]).text().trim()),
                liq_2meses: parseNumber($(tds[17]).text().trim()),
                div_br_patrim: parseNumber($(tds[19]).text().trim()),
                liq_corr: parseNumber($(tds[14]).text().trim()),
                cresc_5a: parseNumber($(tds[20]).text().trim())
            });
        });

        // Get current Selic rate for dynamic filtering
        const selicResponse = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
        const selicData = await selicResponse.json();
        const selic = parseFloat(selicData[0]?.valor || 13.75); // Fallback to ~13.75% if API fails

        // Dynamic DY threshold: if Selic > 10%, accept DY > 4%, otherwise DY > 6%
        const minDY = selic > 10 ? 4 : 6;

        return stocks
            .filter(s => s.liq_2meses > 100000) // Liquidity > 100k
            .filter(s => s.roe > 10) // ✅ NEW: Quality filter - ROE > 10%
            .filter(s => s.p_vp > 0 && s.p_vp < 1.5) // ✅ UPDATED: More flexible P/VP (was 1.2)
            .filter(s => s.dividend_yield > minDY) // ✅ UPDATED: Dynamic DY based on Selic
            .filter(s => s.pl > 0 && s.pl < 15) // P/L reasonable
            .filter(s => s.div_br_patrim < 1.0) // Low debt
            .map(s => {
                const graham_price = s.cotacao * Math.sqrt(22.5 / (s.pl * s.p_vp));
                const upside = ((graham_price - s.cotacao) / s.cotacao) * 100;
                return { ...s, graham_price, upside, selic }; // Include Selic in output for reference
            })
            .sort((a, b) => b.dividend_yield - a.dividend_yield);

    } catch (error) {
        console.error('Error fetching/parsing stocks:', error.message);
        return [];
    }
}

module.exports = { getBestStocks };
