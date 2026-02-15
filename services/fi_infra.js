
/**
 * FI-Infra Service
 * Scraped from Investidor10 (as Fundamentus misses Law 12.431 funds)
 */

async function getFIInfra(selicParam = null) {
    // Current list scraped from Investidor10
    // These are high-yield infrastructure funds (Law 12.431)
    const rawData = [
        { ticker: "CDII11", price: 106.64, dy: 16.29, p_vp: 1.03 },
        { ticker: "KDIF11", price: 127.29, dy: 12.18, p_vp: 1.01 },
        { ticker: "JURO11", price: 103.04, dy: 11.64, p_vp: 1.02 },
        { ticker: "IFRA11", price: 101.50, dy: 11.57, p_vp: 1.01 },
        { ticker: "BDIF11", price: 76.45, dy: 13.27, p_vp: 0.92 },
        { ticker: "CPTI11", price: 89.91, dy: 13.50, p_vp: 0.95 },
        { ticker: "IFRI11", price: 103.75, dy: 13.99, p_vp: 0.99 },
        { ticker: "BODB11", price: 8.02, dy: 12.88, p_vp: 0.93 },
        { ticker: "BINC11", price: 102.50, dy: 15.07, p_vp: 0.98 },
        { ticker: "JMBI11", price: 92.67, dy: 15.24, p_vp: 0.91 },
        { ticker: "XPID11", price: 52.96, dy: 13.20, p_vp: 0.56 },
        { ticker: "DIVS11", price: 104.06, dy: 12.68, p_vp: 1.04 },
        { ticker: "BIDB11", price: 79.91, dy: 16.21, p_vp: 0.97 },
        { ticker: "NUIF11", price: 94.50, dy: 14.87, p_vp: 0.94 },
        { ticker: "RBIF11", price: 79.83, dy: 14.20, p_vp: 0.89 },
        { ticker: "SNID11", price: 11.24, dy: 12.89, p_vp: 1.08 },
        { ticker: "VANG11", price: 100.57, dy: 11.93, p_vp: 1.00 }
    ];

    // Attempt to get Selic for scoring
    let selic = selicParam;
    if (!selic) {
        selic = 12.75;
        try {
            const selicResponse = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
            if (selicResponse.ok) {
                const selicData = await selicResponse.json();
                selic = parseFloat(selicData[0]?.valor || 12.75);
            }
        } catch (e) { }
    }

    return rawData.map(f => {
        // Scoring logic for Infra
        let score = 5;
        if (f.dy > selic) score += 2;
        if (f.p_vp < 1.0) score += 2;
        if (f.p_vp < 0.95) score += 1;
        if (f.dy > 15) score += 1;
        if (f.dy < 8) score -= 2;

        const strategies = [];
        if (f.dy > selic && f.p_vp < 1.0) strategies.push('INFRA_INCOME');
        if (f.dy > 12) strategies.push('DIVIDEND');

        const magicNumber = f.dy > 0 ? Math.ceil(1200 / f.dy) : 9999;
        const magicCost = magicNumber * f.price;

        return {
            ...f,
            segment: "Infraestrutura",
            type: "INFRA",
            score: Math.min(10, score),
            strategies,
            magicNumber,
            magicCost,
            selic,
            num_properties: 0,
            vacancy: 0,
            liquidity: 1000000, // Simulation based on typical popularity
            market_cap: 500000000 // Simulation
        };
    });
}

module.exports = { getFIInfra };
