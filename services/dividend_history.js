const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, '..', 'history');

/**
 * Scrapes the full dividend history for a given ticker from Investidor 10.
 * @param {string} ticker - Asset ticker (e.g., 'RZAG11', 'PETR4')
 * @returns {Promise<Array>} - Array of dividend objects
 */
async function getDividendHistory(ticker) {
    const isStock = !ticker.endsWith('11');
    const paths = isStock
        ? [`acoes/${ticker.toLowerCase()}/`]
        : [`fiis/${ticker.toLowerCase()}/`, `fiagros/${ticker.toLowerCase()}/`, `fi-infra/${ticker.toLowerCase()}/`];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://investidor10.com.br/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    };

    for (const p of paths) {
        try {
            const url = `https://investidor10.com.br/${p}`;
            const response = await axios.get(url, { headers, timeout: 15000 });
            const $ = cheerio.load(response.data);

            const dividends = [];

            // Find the table that contains "DATA COM" and "PAGAMENTO"
            const dividendTable = $('table').filter((i, el) => {
                const text = $(el).text().toUpperCase();
                return text.includes('DATA COM') && text.includes('PAGAMENTO');
            }).first();

            if (dividendTable.length > 0) {
                dividendTable.find('tbody tr').each((i, row) => {
                    const tds = $(row).find('td');
                    if (tds.length >= 4) {
                        const type = $(tds.get(0)).text().trim();
                        const data_com = $(tds.get(1)).text().trim();
                        const data_pagamento = $(tds.get(2)).text().trim();
                        const value_str = $(tds.get(3)).text().trim().replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                        const value = parseFloat(value_str) || 0;

                        if (data_com && data_com !== '-') {
                            dividends.push({
                                type,
                                data_com,
                                data_pagamento,
                                value
                            });
                        }
                    }
                });
            }

            if (dividends.length > 0) {
                return dividends;
            }
        } catch (error) {
            if (error.response && error.response.status !== 404 && error.response.status !== 403) {
                console.warn(`[History] Error fetching ${ticker} on path ${p}: ${error.message}`);
            }
        }
    }

    return [];
}

/**
 * Saves dividend history to a JSON file in the history directory.
 */
async function saveHistory(ticker, dividends) {
    if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }

    const filePath = path.join(HISTORY_DIR, `${ticker.toUpperCase()}.json`);
    const content = JSON.stringify({
        ticker: ticker.toUpperCase(),
        updatedAt: new Date().toISOString(),
        history: dividends
    }, null, 2);

    fs.writeFileSync(filePath, content);
    return filePath;
}

module.exports = { getDividendHistory, saveHistory };
