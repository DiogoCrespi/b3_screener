const axios = require('axios');
const cheerio = require('cheerio');

async function getETFs() {
    console.log('📡 Discovering ETFs from Investidor10...');
    const tickers = [];

    try {
        const response = await axios.get('https://investidor10.com.br/etfs/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Find tickers in the rankings table
        const table = $('#rankings');
        if (table.length > 0) {
            table.find('a[href*="/etfs/"]').each((i, el) => {
                const ticker = $(el).attr('href').split('/').filter(Boolean).pop().toUpperCase();
                if (/^[A-Z0-9]{4,6}11$/.test(ticker)) {
                    if (!tickers.includes(ticker)) tickers.push(ticker);
                }
            });
        }

        // Fallback for cases where table ID might be different or missing
        if (tickers.length === 0) {
            $('a[href*="/etfs/"]').each((i, el) => {
                const ticker = $(el).attr('href').split('/').filter(Boolean).pop().toUpperCase();
                if (/^[A-Z0-9]{4,6}11$/.test(ticker)) {
                    if (!tickers.includes(ticker) && ticker !== 'ETFS') {
                        tickers.push(ticker);
                    }
                }
            });
        }

        console.log(`✅ Found ${tickers.length} ETF tickers.`);

        // Fetch details for each ETF
        const etfData = [];
        console.log(`📡 Fetching detailed data for ${tickers.length} ETFs...`);

        // Limit to top 40 for performance and relevance (can be adjusted)
        const targetTickers = tickers.slice(0, 40);

        for (const ticker of targetTickers) {
            try {
                const detailUrl = `https://investidor10.com.br/etfs/${ticker.toLowerCase()}/`;
                const detailRes = await axios.get(detailUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $d = cheerio.load(detailRes.data);

                const data = {
                    ticker,
                    price: 0,
                    dy: 0,
                    market_cap: 0,
                    variation_12m: 0
                };

                // Parse price from the main cotacao card
                const cotacaoText = $d('.cotacao').text().trim();
                const priceMatch = cotacaoText.match(/R\$\s*([\d.,]+)/);
                if (priceMatch) {
                    data.price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
                }

                // Parse other metrics from card structure
                $d('._card').each((i, card) => {
                    const header = $d(card).find('._card-header').text().trim().toLowerCase();
                    const value = $d(card).find('._card-body-value').text().trim();

                    if (header.includes('dividend yield') || header.includes('dy')) {
                        data.dy = parseFloat(value.replace('%', '').replace(',', '.').trim()) || 0;
                    } else if (header.includes('patrimônio') || header.includes('valor de mercado')) {
                        data.market_cap = parseVal(value);
                    } else if (header.includes('valorização') && header.includes('12')) {
                        data.variation_12m = parseFloat(value.replace('%', '').replace(',', '.').trim()) || 0;
                    }
                });

                if (data.price > 0) {
                    etfData.push(data);
                }
            } catch (err) {
                console.error(`❌ Error fetching ${ticker}:`, err.message);
            }
        }

        return etfData;

    } catch (error) {
        console.error('❌ Error discovering ETFs:', error.message);
        return [];
    }
}

function parseVal(valStr) {
    if (!valStr) return 0;
    let clean = valStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    let multiplier = 1;
    if (clean.toUpperCase().includes('B')) {
        multiplier = 1000000000;
        clean = clean.replace(/B/i, '');
    } else if (clean.toUpperCase().includes('M')) {
        multiplier = 1000000;
        clean = clean.replace(/M/i, '');
    } else if (clean.toUpperCase().includes('K')) {
        multiplier = 1000;
        clean = clean.replace(/K/i, '');
    }
    return (parseFloat(clean) || 0) * multiplier;
}

module.exports = { getETFs };
