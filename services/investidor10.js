const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches metadata for a FII from Investidor10
 * @param {string} ticker - FII ticker (e.g., 'RZAG11')
 * @returns {Promise<Object>} - Metadata object
 */
async function getFiiMetadata(ticker) {
    try {
        const url = `https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const metadata = {
            ticker: ticker.toUpperCase(),
            type: null,
            segment: null,
            mandate: null,
            last_dividend: null
        };

        $('.desc').each((i, el) => {
            const name = $(el).find('.name').text().trim().toUpperCase();
            const value = $(el).find('.value span').text().trim();

            if (name === 'ÚLTIMO RENDIMENTO') {
                const numericValue = value
                    .replace('R$', '')
                    .replace(/\s/g, '')
                    .replace(',', '.');
                metadata.last_dividend = parseFloat(numericValue);
            } else if (name === 'TIPO DE FUNDO') {
                metadata.type = value;
            } else if (name === 'SEGMENTO') {
                metadata.segment = value;
            } else if (name === 'MANDATO') {
                metadata.mandate = value;
            }
        });

        // Fallback for FIAGRO and FI-INFRA if "Tipo de fundo" is generic
        // Investidor 10 often lists them under specific URLs if they are not standard FIIs
        // But for many, the breadcrumbs or specific text on page identifies them.

        return metadata;
    } catch (error) {
        console.warn(`⚠️  Could not fetch metadata for ${ticker}:`, error.message);
        return {
            ticker: ticker.toUpperCase(),
            type: null,
            segment: null,
            mandate: null,
            last_dividend: null
        };
    }
}

/**
 * Fetches metadata for multiple FIIs with rate limiting
 * @param {string[]} tickers - Array of FII tickers
 * @param {number} delayMs - Delay between requests
 * @returns {Promise<Object>} - Object mapping ticker to metadata
 */
async function getMultipleFiiMetadata(tickers, delayMs = 200) {
    const results = {};
    console.log(`📡 Fetching metadata for ${tickers.length} assets...`);

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        if (i % 10 === 0 && i > 0) {
            console.log(`   Progress: ${i}/${tickers.length}...`);
        }

        results[ticker] = await getFiiMetadata(ticker);

        if (delayMs > 0 && i < tickers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

module.exports = { getFiiMetadata, getMultipleFiiMetadata };
