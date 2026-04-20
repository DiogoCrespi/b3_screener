const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches metadata and full data for a FII/Fiagro/Infra/Stock from Investidor10
 * @param {string} ticker - Asset ticker (e.g., 'RZAG11', 'PETR4')
 * @returns {Promise<Object>} - Metadata object
 */
async function getAssetMetadata(ticker) {
    const isStock = !ticker.endsWith('11');
    const paths = isStock
        ? [`acoes/${ticker.toLowerCase()}/`]
        : [`fiis/${ticker.toLowerCase()}/`, `fiagros/${ticker.toLowerCase()}/`, `fi-infra/${ticker.toLowerCase()}/`];

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
                vacancy: null,
                data_com: null,
                data_pagamento: null
            };

            const parseVal = (v) => {
                if (!v) return 0;
                let text = v.replace('R$', '').replace(/\./g, '').replace(',', '.').replace('%', '').trim();
                let multiplier = 1;
                const upperText = text.toUpperCase();
                if (upperText.includes('B')) { // Handles B, Bilhão, Bilhões
                    multiplier = 1000000000;
                    text = text.replace(/[^0-9.]/g, '').trim();
                } else if (upperText.includes('M')) { // Handles M, Milhão, Milhões
                    multiplier = 1000000;
                    text = text.replace(/[^0-9.]/g, '').trim();
                } else if (upperText.includes('K')) {
                    multiplier = 1000;
                    text = text.replace(/[^0-9.]/g, '').trim();
                }
                return (parseFloat(text) * multiplier) || 0;
            };

            // Metadata scraping
            $('.desc').each((i, el) => {
                const name = $(el).find('.name').text().trim().toUpperCase();
                const value = $(el).find('.value span').text().trim();

                if (name === 'ÚLTIMO RENDIMENTO') metadata.last_dividend = parseVal(value);
                else if (name === 'TIPO DE FUNDO') metadata.type = value;
                else if (name === 'SEGMENTO') metadata.segment = value;
                else if (name === 'MANDATO') metadata.mandate = value;
                else if (name === 'VACÂNCIA') metadata.vacancy = parseVal(value);
                else if (name.includes('PATRIMÔNIO LÍQUIDO')) metadata.market_cap = parseVal(value); // Use as fallback for market_cap if needed
                else if (name.includes('VALOR DE MERCADO')) metadata.market_cap = parseVal(value); // Priority for market_cap
                else if (name.includes('PATRIMÔNIO LÍQUIDO')) metadata.market_cap = parseVal(value); // Use as fallback for market_cap if needed
                else if (name.includes('VALOR DE MERCADO')) metadata.market_cap = parseVal(value); // Priority for market_cap
            });

            // Scrape Dividend Dates from Table
            const dividendTable = $('table').filter((i, el) => {
                const text = $(el).text().toUpperCase();
                return text.includes('DATA COM') && text.includes('PAGAMENTO');
            }).first();

            if (dividendTable.length > 0) {
                const firstRow = dividendTable.find('tbody tr').first();
                const tds = firstRow.find('td');

                // Usually: Type, Data Com, Pagamento, Valor
                if (tds.length >= 3) {
                    metadata.data_com = $(tds.get(1)).text().trim();
                    metadata.data_pagamento = $(tds.get(2)).text().trim();
                }
            }

            // Fallback for Cards if Metadata is missing or for full data
            const parseCardValue = (label) => {
                try {
                    let valueText = '';
                    const card = $('._card').filter((i, el) => {
                        const headerText = $(el).find('._card-header span').text().trim().toUpperCase();
                        return headerText.includes(label.toUpperCase());
                    });

                    if (card.length > 0) {
                        const valueEl = card.find('._card-body span.value').length > 0
                            ? card.find('._card-body span.value')
                            : card.find('._card-body span');
                        valueText = valueEl.first().text().trim();
                    }

                    if (!valueText) {
                        const oldCard = $(`.kotacoes div._card-header span:contains('${label}')`).closest('.kotacoes');
                        valueText = oldCard.find('div._card-body span').text().trim();
                    }
                    
                    if (!valueText) return null; // Differentiate between not found and actual 0

                    return parseVal(valueText);
                } catch (e) { return null; }
            };

            metadata.price = parseCardValue('COTAÇÃO');
            metadata.dy = parseCardValue('DY');
            metadata.p_vp = parseCardValue('P/VP');
            metadata.liquidity = parseCardValue('LIQUIDEZ DIÁRIA');
            
            const vcncy = parseCardValue('VACÂNCIA');
            if (metadata.vacancy === null && vcncy !== null) {
                metadata.vacancy = vcncy;
            }

            if (metadata.type || metadata.price > 0 || metadata.data_com) {
                return metadata;
            }

        } catch (error) {
            if (error.response && error.response.status !== 404 && error.response.status !== 403) {
                console.warn(`Error fetching ${ticker} on path ${path}: ${error.message}`);
            }
        }
    }

    return {
        ticker: ticker.toUpperCase(),
        type: null, segment: null, mandate: null,
        price: 0, dy: 0, p_vp: 0, liquidity: 0, last_dividend: 0, vacancy: null,
        data_com: null, data_pagamento: null
    };
}

/**
 * Fetches metadata for multiple assets with rate limiting
 * @param {string[]} tickers - Array of asset tickers
 * @param {number} delayMs - Delay between requests
 * @returns {Promise<Object>} - Object mapping ticker to metadata
 */
async function getMultipleAssetMetadata(tickers, delayMs = 200) {
    const results = {};
    console.log(`📡 Fetching metadata for ${tickers.length} assets...`);

    const CONCURRENCY_LIMIT = 5;
    const queue = [...tickers];
    const total = tickers.length;
    let completed = 0;

    const worker = async () => {
        while (queue.length > 0) {
            const ticker = queue.shift();
            results[ticker] = await getAssetMetadata(ticker);

            completed++;
            if (completed % 10 === 0 || completed === total) {
                console.log(`   Progress: ${completed}/${total}...`);
            }

            if (queue.length > 0 && delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, tickers.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    return results;
}

module.exports = {
    getAssetMetadata,
    getFiiMetadata: getAssetMetadata, // Backward compatibility
    getMultipleFiiMetadata: getMultipleAssetMetadata, // Backward compatibility
    getMultipleAssetMetadata
};
