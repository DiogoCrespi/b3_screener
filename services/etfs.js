
async function getETFs() {
    // Automated fundamental data for ETFs is hard to get for free without scraping complex sites.
    // For now, we return a curated list of popular ETFs with static descriptions.
    // In a future version, we could scrape Investidor10 for daily prices.
    return [
        { ticker: 'IVVB11', name: 'S&P 500 Brazilian ETF', type: 'International' },
        { ticker: 'BOVA11', name: 'Ibovespa Index ETF', type: 'Index' },
        { ticker: 'SMAL11', name: 'Small Caps ETF', type: 'Small Caps' },
        { ticker: 'HASH11', name: 'Crypto Index ETF', type: 'Crypto' },
        { ticker: 'DIVO11', name: 'High Dividend ETF', type: 'Diversified' }
    ];
}

module.exports = { getETFs };
