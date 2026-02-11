const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches the last dividend payment for a FII from Investidor10
 * @param {string} ticker - FII ticker (e.g., 'RZAG11')
 * @returns {Promise<number|null>} - Last dividend value or null if not found
 */
async function getLastDividend(ticker) {
    try {
        const url = `https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Find the "ÚLTIMO RENDIMENTO" card
        let lastDividend = null;

        $('.desc').each((i, el) => {
            const text = $(el).find('.name').text().trim();
            if (text === 'ÚLTIMO RENDIMENTO') {
                const valueText = $(el).find('.value span').text().trim();
                // Parse "R$ 0,12" to 0.12
                const numericValue = valueText
                    .replace('R$', '')
                    .replace(/\s/g, '')
                    .replace(',', '.');
                lastDividend = parseFloat(numericValue);
            }
        });

        return lastDividend;
    } catch (error) {
        console.warn(`⚠️  Could not fetch last dividend for ${ticker}:`, error.message);
        return null;
    }
}

/**
 * Fetches last dividends for multiple FIIs with rate limiting
 * @param {string[]} tickers - Array of FII tickers
 * @param {number} delayMs - Delay between requests (default: 500ms)
 * @returns {Promise<Object>} - Object mapping ticker to last dividend
 */
async function getLastDividends(tickers, delayMs = 500) {
    const results = {};

    for (const ticker of tickers) {
        results[ticker] = await getLastDividend(ticker);

        // Rate limiting to avoid overwhelming the server
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

module.exports = { getLastDividend, getLastDividends };
