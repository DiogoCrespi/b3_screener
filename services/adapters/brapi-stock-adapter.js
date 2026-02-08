
// adapters/brapi-stock-adapter.js

/**
 * Adapter for Brapi.dev API
 * Fetches stock data from the Brapi.dev Brazilian stocks API
 */
class BrapiStockAdapter {
    constructor() {
        this.baseUrl = 'https://brapi.dev/api';
    }

    async getStocks() {
        try {
            // Brapi.dev provides a list endpoint for all stocks
            // We'll fetch the list first, then get details for each
            const listResponse = await fetch(`${this.baseUrl}/quote/list`);

            if (!listResponse.ok) {
                throw new Error(`Brapi API error: ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const tickers = listData.stocks || [];

            // Fetch detailed fundamentals for all stocks
            // Brapi allows batch requests with comma-separated tickers
            const tickerString = tickers.slice(0, 100).join(','); // Limit to avoid URL length issues

            const detailsResponse = await fetch(`${this.baseUrl}/quote/${tickerString}?fundamental=true`);

            if (!detailsResponse.ok) {
                throw new Error(`Brapi details error: ${detailsResponse.status}`);
            }

            const detailsData = await detailsResponse.json();
            const results = detailsData.results || [];

            // Transform Brapi format to our internal format
            return results.map(stock => this.transformStock(stock)).filter(s => s !== null);

        } catch (error) {
            console.error('Error in BrapiStockAdapter:', error.message);
            throw error;
        }
    }

    transformStock(brapiStock) {
        try {
            const fundamentals = brapiStock.summaryProfile || {};
            const price = brapiStock.regularMarketPrice || 0;

            // Brapi uses different field names, we need to map them
            return {
                ticker: brapiStock.symbol || '',
                cotacao: price,
                pl: fundamentals.trailingPE || 0,
                p_vp: fundamentals.priceToBook || 0,
                psr: fundamentals.priceToSalesTrailing12Months || 0,
                dividend_yield: (fundamentals.dividendYield || 0) * 100, // Brapi returns as decimal
                ev_ebit: fundamentals.enterpriseToEbitda || 0,
                mrg_ebit: (fundamentals.ebitdaMargins || 0) * 100,
                mrg_liq: (fundamentals.profitMargins || 0) * 100,
                roic: fundamentals.returnOnAssets || 0, // Approximation
                roe: (fundamentals.returnOnEquity || 0) * 100,
                liq_2meses: brapiStock.averageDailyVolume10Day || 0,
                div_br_patrim: fundamentals.debtToEquity || 0,
                cresc_5a: (fundamentals.earningsQuarterlyGrowth || 0) * 100 // Approximation
            };
        } catch (e) {
            console.warn(`Failed to transform stock ${brapiStock.symbol}:`, e.message);
            return null;
        }
    }
}

module.exports = BrapiStockAdapter;
