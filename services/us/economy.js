// services/us/economy.js
// US rates from FRED's public CSV download (no API key required).
const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=';
// Fallbacks: the primary publishers of each rate.
const NYFED_EFFR_URL = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json';
const TREASURY_XML_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=';
const FED_FUNDS_SERIES = 'DFF';   // Effective Federal Funds Rate (daily)
const TREASURY_10Y_SERIES = 'DGS10'; // 10-Year Treasury constant maturity (daily)

// Returns the most recent numeric observation; FRED marks missing days with '.'.
function parseFredCsv(csv) {
    const lines = String(csv || '').trim().split(/\r?\n/).slice(1);
    for (let i = lines.length - 1; i >= 0; i--) {
        const [date, raw] = lines[i].split(',');
        const value = parseFloat(raw);
        if (date && Number.isFinite(value)) return { date, value };
    }
    return null;
}

async function getFredSeries(seriesId, { fetchImpl = fetch, attempts = 3 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetchImpl(FRED_CSV_URL + seriesId, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);
            const point = parseFredCsv(await response.text());
            if (point) return point;
            throw new Error(`FRED series ${seriesId} has no numeric observations`);
        } catch (error) {
            if (attempt === attempts) {
                console.error(`Error fetching FRED ${seriesId}:`, error.message);
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return null;
}

async function getNyFedEffr({ fetchImpl = fetch } = {}) {
    try {
        const response = await fetchImpl(NYFED_EFFR_URL, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`NY Fed HTTP ${response.status}`);
        const rate = (await response.json())?.refRates?.[0]?.percentRate;
        return Number.isFinite(rate) ? rate : null;
    } catch (error) {
        console.error('Error fetching NY Fed EFFR:', error.message);
        return null;
    }
}

// Returns the last BC_10YEAR value of a Treasury yield-curve XML month.
function parseTreasuryXml(xml) {
    const values = [...String(xml || '').matchAll(/<d:BC_10YEAR[^>]*>([\d.]+)</g)].map(m => parseFloat(m[1]));
    return values.length ? values[values.length - 1] : null;
}

async function getTreasuryGov10y({ fetchImpl = fetch, now = new Date() } = {}) {
    // Early in a month the current month may have no data yet, so also try the previous one.
    const months = [0, 1].map(back => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    for (const month of months) {
        try {
            const response = await fetchImpl(TREASURY_XML_URL + month, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`Treasury HTTP ${response.status}`);
            const value = parseTreasuryXml(await response.text());
            if (value !== null) return value;
        } catch (error) {
            console.error(`Error fetching Treasury yields for ${month}:`, error.message);
        }
    }
    return null;
}

async function getFedFundsRate(options) {
    const point = await getFredSeries(FED_FUNDS_SERIES, options);
    if (point) return point.value;
    console.warn('⚠️  FRED unavailable for Fed Funds, trying NY Fed...');
    return getNyFedEffr(options);
}

async function getTreasury10y(options) {
    const point = await getFredSeries(TREASURY_10Y_SERIES, options);
    if (point) return point.value;
    console.warn('⚠️  FRED unavailable for 10y Treasury, trying Treasury.gov...');
    return getTreasuryGov10y(options);
}

module.exports = {
    parseFredCsv,
    parseTreasuryXml,
    getFredSeries,
    getNyFedEffr,
    getTreasuryGov10y,
    getFedFundsRate,
    getTreasury10y,
    FRED_CSV_URL
};
