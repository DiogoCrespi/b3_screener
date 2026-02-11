const cheerio = require('cheerio');

const FII_URL = 'https://www.fundamentus.com.br/fii_resultado.php';

/**
 * Fetches and processes FII data.
 * @param {Object} externalMetadata - Optional metadata from external sources (mapping ticker -> meta)
 * @param {Array} baseList - Optional list of raw FII objects to process instead of fetching from Fundamentus
 */
async function getBestFIIs(externalMetadata = {}, baseList = null) {
    try {
        let fiis = [];

        if (baseList && Array.isArray(baseList)) {
            fiis = baseList;
        } else {
            const response = await fetch(FII_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            const $ = cheerio.load(html);

            $('#tabelaResultado tbody tr').each((i, el) => {
                const tds = $(el).find('td');
                const parseNumber = (text) => {
                    if (!text) return 0;
                    return parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', ''));
                };

                fiis.push({
                    ticker: $(tds[0]).text().trim(),
                    segment: $(tds[1]).text().trim(),
                    price: parseNumber($(tds[2]).text().trim()),
                    ffo_yield: parseNumber($(tds[3]).text().trim()),
                    dy: parseNumber($(tds[4]).text().trim()),
                    p_vp: parseNumber($(tds[5]).text().trim()),
                    market_cap: parseNumber($(tds[6]).text().trim()),
                    liquidity: parseNumber($(tds[7]).text().trim()),
                    num_properties: parseNumber($(tds[8]).text().trim()),
                    cap_rate: parseNumber($(tds[11]).text().trim()),
                    vacancy: parseNumber($(tds[12]).text().trim())
                });
            });
        }

        let selic = 12.75;
        try {
            const selicResponse = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
            if (selicResponse.ok) {
                const selicData = await selicResponse.json();
                selic = parseFloat(selicData[0]?.valor || 12.75);
            }
        } catch (e) {
            console.warn('⚠️  Could not fetch Selic for FIIs, using default 12.75%.');
        }

        const MIN_PAPER_DY = selic - 1.5;
        const MIN_BRICK_DY = 6.0;
        const GOOD_CAP_RATE = 8.0;
        const MAX_PAPER_PVP = 1.05;

        return fiis
            .filter(f => f.liquidity > 200000)
            .map(f => {
                const strategies = [];
                const meta = externalMetadata[f.ticker] || {};

                // 1. CLASSIFICATION LOGIC
                // Normalization helper (removes accents and toLowerCase)
                const norm = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

                const exType = norm(meta.type);
                const exMandate = norm(meta.mandate);
                const exSegment = norm(meta.segment);
                const segmentNorm = norm(f.segment);

                let type = 'OUTROS';

                // PRIORITY 1: INFRA & AGRO (Specific tax-advantaged categories)
                if (exType.includes('infra') || exSegment.includes('infra') || exMandate.includes('infra')) {
                    type = 'INFRA';
                } else if (exType.includes('fiagro') || exSegment.includes('fiagro') || exMandate.includes('agro') || exMandate.includes('rural')) {
                    type = 'AGRO';
                }
                // PRIORITY 2: MISTO / MULTI (Hybrid nature)
                else if (exType.includes('misto') || exType.includes('mista') ||
                    exType.includes('hibrido') || exMandate.includes('hibrido') ||
                    exSegment.includes('hibrido') || exMandate.includes('misto') ||
                    exType.includes('multimercado') || exType.includes('fundos de fundos')) {
                    type = 'MULTI';
                }
                // PRIORITY 3: PAPEL & TIJOLO (Core FII categories)
                else if (exType.includes('papel') || exMandate.includes('titulos') || exSegment.includes('recebiveis')) {
                    type = 'PAPEL';
                } else if (exType.includes('tijolo') || exMandate.includes('renda') || exSegment.includes('imoveis')) {
                    type = 'TIJOLO';
                } else {
                    // FALLBACK: Fundamentus Segment Analysis
                    const isTijolo = segmentNorm.includes('logistica') ||
                        segmentNorm.includes('shopping') ||
                        segmentNorm.includes('lajes') ||
                        segmentNorm.includes('escritorio') ||
                        segmentNorm.includes('hospital') ||
                        segmentNorm.includes('hotel') ||
                        segmentNorm.includes('residencial') ||
                        segmentNorm.includes('varejo');

                    const isAgro = segmentNorm.includes('agro') || segmentNorm.includes('fiagro') || segmentNorm.includes('rural');
                    const isInfra = segmentNorm.includes('infra') || segmentNorm.includes('energia') || segmentNorm.includes('saneamento');
                    const isMulti = segmentNorm.includes('multicategoria') || segmentNorm.includes('hibrido') || segmentNorm.includes('fundos') || segmentNorm.includes('mista');

                    if (isTijolo) type = 'TIJOLO';
                    else if (isAgro) type = 'AGRO';
                    else if (isInfra) type = 'INFRA';
                    else if (isMulti) type = 'MULTI';
                    else if (segmentNorm.includes('titulos') || segmentNorm.includes('recebiveis')) type = 'PAPEL';
                }

                // Explicitly check for known Fiagros/Infras if still "OUTROS"
                const KNOWN_FIAGROS = ['SNAG11', 'KNCA11', 'VGIA11', 'RURA11', 'FGAA11', 'RZAG11', 'OIAG11', 'AGRX11', 'NCRA11'];
                const KNOWN_INFRAS = ['BDIF11', 'JURO11', 'KDIF11', 'CPTI11', 'VIGT11', 'BIDB11', 'CDII11'];
                if (type === 'OUTROS') {
                    if (KNOWN_FIAGROS.includes(f.ticker)) type = 'AGRO';
                    if (KNOWN_INFRAS.includes(f.ticker)) type = 'INFRA';
                }

                // 2. STRATEGY RE-CALCULATION
                const isAgro = type === 'AGRO';
                const isInfra = type === 'INFRA';
                const isMulti = type === 'MULTI';
                const isTijolo = type === 'TIJOLO';
                const isPapel = type === 'PAPEL';

                if (isAgro && f.dy > (selic + 0.5) && f.p_vp < 1.15) strategies.push('AGRO_OPPORTUNITY');
                if (isInfra && f.dy > (selic - 1.5) && f.p_vp < 1.10) strategies.push('INFRA_INCOME'); // Infra usually has lower dy but tax-free
                if (isMulti && f.p_vp < 0.95 && f.dy > (selic - 2.5)) strategies.push('MULTI_DISCOUNT');

                const maxVacancy = f.p_vp < 0.80 ? 30 : 15;
                if (isTijolo && f.p_vp < 1.05 && f.p_vp > 0.55 && f.vacancy < maxVacancy && f.dy > 5.5) {
                    strategies.push('TIJOLO_VALUE');
                }

                const maxPaperPVP = f.liquidity > 2000000 ? 1.10 : MAX_PAPER_PVP;
                if (isPapel && f.dy > (selic - 3) && f.p_vp > 0.82 && f.p_vp <= maxPaperPVP) {
                    strategies.push('PAPEL_YIELD');
                }

                const safeYield = Math.max(8, selic * 0.6);
                if (f.p_vp >= 0.80 && f.p_vp <= 1.15 && f.vacancy < 10 && f.dy > safeYield && f.liquidity > 700000) {
                    strategies.push('SAFE_INCOME');
                }

                // 3. SCORING SYSTEM (RE-CALCULATED WITH CORRECT TYPE)
                // 3. SCORING SYSTEM (RE-CALCULATED WITH CORRECT TYPE)
                let score = 0;
                if (f.p_vp >= 0.85 && f.p_vp <= 1.05) score += 2;
                else if (f.p_vp < 0.85 && isTijolo && f.p_vp > 0.60) score += 1;

                if (isTijolo && f.cap_rate > GOOD_CAP_RATE) score += 2;
                if (isTijolo && f.cap_rate > 6 && f.cap_rate <= GOOD_CAP_RATE) score += 1;

                const effectiveYield = (isTijolo && f.ffo_yield > 0) ? f.ffo_yield : f.dy;
                // Infra and Agro get a small bonus for tax exemption (since we don't calculate tax-equivalent yield here)
                const taxBonus = (isInfra || isAgro) ? 1.5 : 0;

                // DY Capping for Score
                let effectiveDyForScore = effectiveYield;
                if (effectiveDyForScore > 16) {
                    effectiveDyForScore = 16;
                    strategies.push('HIGH_VOLATILITY');
                }

                const comparisonYield = effectiveDyForScore + taxBonus;

                if (comparisonYield > MIN_PAPER_DY) score += 4;
                else if (comparisonYield > 10) score += 3;
                else if (comparisonYield > 8) score += 2;
                else if (comparisonYield > 6) score += 1;

                if (f.vacancy < 5) score += 2;
                else if (f.vacancy < 15) score += 1;

                if (f.liquidity > 1000000) score += 2;
                else if (f.liquidity > 400000) score += 1;

                if (isPapel && f.p_vp < 0.85) score -= 3; // Penalize Paper below 0.85 (High Risk)
                if (f.vacancy > 25) score -= 2;
                if (f.dy < 0.1) score -= 5;

                score = Math.max(0, Math.min(10, score));

                // 4. MAGIC NUMBER
                const magicNumber = f.dy > 0 ? Math.ceil(1200 / f.dy) : 9999;
                const magicCost = magicNumber * f.price;

                return {
                    ...f, strategies, type, score, selic, magicNumber, magicCost,
                    last_dividend: meta.last_dividend || null,
                    external_segment: meta.segment || null
                };
            })
            // Filter: Allow more items in the re-classification stage
            .filter(f => f.strategies.length > 0 || f.score >= 5.5)
            .sort((a, b) => b.score - a.score || b.dy - a.dy);

    } catch (error) {
        console.error('Error fetching/parsing FIIs:', error.message);
        return [];
    }
}

module.exports = { getBestFIIs };
