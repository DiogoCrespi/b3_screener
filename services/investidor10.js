const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches metadata for a FII from Investidor10
 * @param {string} ticker - FII ticker (e.g., 'RZAG11')
 * @returns {Promise<Object>} - Metadata object
 */
/**
 * Fetches metadata and full data for a FII/Fiagro/Infra from Investidor10
 * @param {string} ticker - FII ticker (e.g., 'RZAG11')
 * @returns {Promise<Object>} - Metadata object with optional full data
 */
async function getFiiMetadata(ticker) {
    const paths = [`fiis/${ticker.toLowerCase()}/`, `fiagros/${ticker.toLowerCase()}/`, `fi-infra/${ticker.toLowerCase()}/`];

    // Common headers to bypass WAF
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://investidor10.com.br/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    };

    for (const path of paths) {
        try {
            const url = `https://investidor10.com.br/${path}`;
            const response = await axios.get(url, { headers, timeout: 10000 });

            const $ = cheerio.load(response.data);
            const metadata = {
                ticker: ticker.toUpperCase(),
                type: null,
                segment: null,
                mandate: null,
                price: 0,
                dy: 0,
                p_vp: 0,
                liquidity: 0,
                last_dividend: 0,
                vacancy: 0
            };

            // Metadata scraping
            $('.desc').each((i, el) => {
                const name = $(el).find('.name').text().trim().toUpperCase();
                const value = $(el).find('.value span').text().trim();

                const parseVal = (v) => parseFloat(v.replace('R$', '').replace(/\./g, '').replace(',', '.').replace('%', '').trim()) || 0;

                if (name === 'ÚLTIMO RENDIMENTO') metadata.last_dividend = parseVal(value);
                else if (name === 'TIPO DE FUNDO') metadata.type = value;
                else if (name === 'SEGMENTO') metadata.segment = value;
                else if (name === 'MANDATO') metadata.mandate = value;
            });

            // Fallback for Cards if Metadata is missing or for full data
            const parseCardValue = (label) => {
                // Find the card with the specific label inside _card-header -> span
                // Then get the value from _card-body -> span
                try {
                    const card = $(`.kotacoes div._card-header span:contains('${label}')`).closest('.kotacoes');
                    const valText = card.find('div._card-body span').text().trim();
                    return parseFloat(valText.replace('R$', '').replace(/\./g, '').replace(',', '.').replace('%', '').trim()) || 0;
                } catch (e) { return 0; }
            };

            metadata.price = parseCardValue('Cotação Atual');
            metadata.dy = parseCardValue('Dividend Yield');
            metadata.p_vp = parseCardValue('P/VP');
            metadata.liquidity = parseCardValue('Liquidez Diária');
            metadata.vacancy = parseCardValue('Vacância');

            // If we found a valid type or price, assume success and return
            if (metadata.type || metadata.price > 0) {
                return metadata;
            }

        } catch (error) {
            // Ignore 404/403 and try next path
            if (error.response && error.response.status !== 404 && error.response.status !== 403) {
                console.warn(`Error fetching ${ticker} on path ${path}: ${error.message}`);
            }
        }
    }

    // Return empty if all failed
    return {
        ticker: ticker.toUpperCase(),
        type: null, segment: null, mandate: null,
        price: 0, dy: 0, p_vp: 0, liquidity: 0, last_dividend: 0, vacancy: 0
    };
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
