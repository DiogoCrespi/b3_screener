
// adapters/brapi-stock-adapter.js
const { parseB3Ticker } = require('../logic/analysis-utils');

/**
 * Adapter for Brapi.dev API
 * Fetches stock data from the Brapi.dev Brazilian stocks API
 */
class BrapiStockAdapter {
    constructor() {
        this.baseUrl = 'https://brapi.dev/api';
        this.token = process.env.MARKET_DATA_TOKEN || process.env.BRAPI_TOKEN;
    }

    async getStocks() {
        try {
            // Brapi.dev provides a list endpoint for all stocks
            // We'll fetch the list first, then get details for each
            const tokenQuery = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
            const listResponse = await fetch(`${this.baseUrl}/quote/list${tokenQuery}`, {
                signal: AbortSignal.timeout(15000)
            });

            if (!listResponse.ok) {
                throw new Error(`Brapi API error: ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const tickers = listData.stocks || [];

            // Fetch detailed fundamentals for all stocks
            // Brapi allows batch requests with comma-separated tickers
            const results = [];
            const BATCH_SIZE = 75; // Limit to avoid URL length issues

            for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
                const batch = tickers.slice(i, i + BATCH_SIZE);
                const tickerString = batch.join(',');

                try {
                    const tokenParam = this.token ? `&token=${encodeURIComponent(this.token)}` : '';
                    const detailsResponse = await fetch(`${this.baseUrl}/quote/${tickerString}?fundamental=true${tokenParam}`, {
                        signal: AbortSignal.timeout(15000)
                    });

                    if (!detailsResponse.ok) {
                        console.warn(`Brapi details error for batch starting with ${batch[0]}: ${detailsResponse.status}`);
                        continue;
                    }

                    const detailsData = await detailsResponse.json();
                    if (detailsData.results) {
                        results.push(...detailsData.results);
                    }
                } catch (batchError) {
                    console.error(`Error fetching batch starting with ${batch[0]}:`, batchError.message);
                    // Continue with next batch
                }
            }

            // Transform Brapi format to our internal format
            const transformedStocks = [];
            for (const stock of results) {
                const transformed = this.transformStock(stock);
                if (transformed !== null) {
                    transformedStocks.push(transformed);
                }
            }
            return transformedStocks;

        } catch (error) {
            console.error('Error in BrapiStockAdapter:', error.message);
            throw error;
        }
    }

    transformStock(brapiStock) {
        try {
            const fundamentals = brapiStock.summaryProfile || {};
            const price = brapiStock.regularMarketPrice || 0;
            const averageVolume = brapiStock.averageDailyVolume10Day || 0;
            const rawDebtToEquity = fundamentals.debtToEquity || 0;

            // Brapi uses different field names, we need to map them
            const dividend_yield = Math.round((fundamentals.dividendYield || 0) * 100 * 100) / 100; // Brapi returns as decimal
            const pl = fundamentals.trailingPE || 0;

            return {
                ...parseB3Ticker(brapiStock.symbol),
                ticker: brapiStock.symbol || '',
                cotacao: price,
                pl,
                p_vp: fundamentals.priceToBook || 0,
                psr: fundamentals.priceToSalesTrailing12Months || 0,
                dividend_yield,
                // Brapi exposes EV/EBITDA here, which is not interchangeable with EV/EBIT.
                ev_ebit: 0,
                mrg_ebit: Math.round((fundamentals.ebitdaMargins || 0) * 100 * 100) / 100,
                mrg_liq: Math.round((fundamentals.profitMargins || 0) * 100 * 100) / 100,
                // ROA and quarterly growth must not be scored as ROIC and five-year CAGR.
                roic: 0,
                roe: Math.round((fundamentals.returnOnEquity || 0) * 100 * 100) / 100,
                liq_2meses: averageVolume * price,
                div_br_patrim: rawDebtToEquity > 10 ? rawDebtToEquity / 100 : rawDebtToEquity,
                cresc_5a: 0,
                payout: (pl > 0 && dividend_yield > 0) ? (dividend_yield * pl) : 0,
                data_source: 'brapi',
                collected_at: new Date().toISOString(),
                unavailable_metrics: ['ev_ebit', 'roic', 'cresc_5a']
            };
        } catch (e) {
            console.warn(`Failed to transform stock ${brapiStock?.symbol || 'unknown'}:`, e.message);
            return null;
        }
    }
}

module.exports = BrapiStockAdapter;
