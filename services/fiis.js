const cheerio = require('cheerio');
const { getSelicRate } = require('./economy');
const { classifyFund } = require('./logic/fund-classification');
const { analyzeFund } = require('./logic/fund-analysis');

const FII_URL = 'https://www.fundamentus.com.br/fii_resultado.php';

function parseNumber(text) {
    if (!text) return 0;
    return parseFloat(String(text).replace(/\./g, '').replace(',', '.').replace('%', '')) || 0;
}

async function fetchFundamentusFunds() {
    const response = await fetch(FII_URL, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const $ = cheerio.load(await response.text());
    const funds = [];
    const collectedAt = new Date().toISOString();
    $('#tabelaResultado tbody tr').each((index, element) => {
        const cells = $(element).find('td');
        funds.push({
            ticker: $(cells[0]).text().trim(),
            segment: $(cells[1]).text().trim(),
            price: parseNumber($(cells[2]).text()),
            ffo_yield: parseNumber($(cells[3]).text()),
            dy: parseNumber($(cells[4]).text()),
            p_vp: parseNumber($(cells[5]).text()),
            market_cap: parseNumber($(cells[6]).text()),
            liquidity: parseNumber($(cells[7]).text()),
            num_properties: parseNumber($(cells[8]).text()),
            cap_rate: parseNumber($(cells[11]).text()),
            vacancy: parseNumber($(cells[12]).text()),
            data_source: 'fundamentus',
            collected_at: collectedAt
        });
    });
    return funds;
}

function enrichFund(fund, metadata) {
    return {
        ...fund,
        vacancy: metadata.vacancy ?? fund.vacancy,
        dy: metadata.dy > 0 ? metadata.dy : fund.dy,
        p_vp: metadata.p_vp > 0 ? metadata.p_vp : fund.p_vp,
        price: metadata.price > 0 ? metadata.price : fund.price,
        liquidity: metadata.liquidity > 0 ? metadata.liquidity : fund.liquidity,
        market_cap: metadata.market_cap > 0 ? metadata.market_cap : fund.market_cap
    };
}

function processFund(fund, metadata, selic) {
    const enriched = enrichFund(fund, metadata);
    const classification = classifyFund(enriched, metadata);
    const decision = analyzeFund(enriched, classification, selic);
    const strategies = [];

    if (classification.exposure === 'REAL_ESTATE_PHYSICAL' && enriched.p_vp < 0.90) {
        strategies.push('PHYSICAL_VALUE');
    }
    if (classification.exposure.includes('CREDIT') && enriched.dy > 11 && enriched.p_vp >= 0.90) {
        strategies.push('CREDIT_CARRY');
    }
    strategies.push(...decision.warnings);

    const magicNumber = enriched.dy > 0 ? Math.ceil(1200 / enriched.dy) : null;
    const category = decision.signal === 'TOP_PICK' ? 'STAR'
        : decision.signal === 'OPPORTUNITY' ? 'OPPORTUNITY' : 'STANDARD';

    return {
        ...enriched,
        ...classification,
        ...decision,
        type: classification.type,
        score: decision.overall_score,
        category,
        strategies,
        selic,
        magicNumber,
        magicCost: magicNumber ? magicNumber * enriched.price : null,
        last_dividend: metadata.last_dividend || null,
        external_segment: metadata.segment || null,
        data_com: metadata.data_com || null,
        data_pagamento: metadata.data_pagamento || null,
        data_sources: metadata.ticker ? ['fundamentus', 'investidor10'] : ['fundamentus']
    };
}

async function getBestFIIs(externalMetadata = {}, baseList = null, selicParam = null) {
    try {
        const funds = Array.isArray(baseList) ? baseList : await fetchFundamentusFunds();
        const selic = selicParam ?? await getSelicRate() ?? 12.75;

        return funds
            .map(fund => processFund(fund, externalMetadata[fund.ticker] || {}, selic))
            .filter(fund => fund.liquidity > 200000)
            .filter(fund => fund.eligibility !== 'INSUFFICIENT_DATA')
            .sort((a, b) => b.overall_score - a.overall_score || b.dy - a.dy);
    } catch (error) {
        console.error('Error fetching/parsing FIIs:', error.message);
        return [];
    }
}

module.exports = { getBestFIIs, processFund, enrichFund, parseNumber };
