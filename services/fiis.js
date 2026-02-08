
const cheerio = require('cheerio');

const FII_URL = 'https://www.fundamentus.com.br/fii_resultado.php';

async function getBestFIIs() {
    try {
        const response = await fetch(FII_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const fiis = [];

        $('#tabelaResultado tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            // Safe parse helper
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

        // Get current Selic rate
        let selic = 12.75; // Default fallback
        try {
            const selicResponse = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json');
            if (selicResponse.ok) {
                const selicData = await selicResponse.json();
                selic = parseFloat(selicData[0]?.valor || 12.75);
            }
        } catch (e) {
            console.warn('⚠️  Could not fetch Selic for FIIs, using default 12.75%.');
        }

        // Define Thresholds
        const MIN_PAPER_DY = selic - 1.5; // e.g. 11.25% if Selic is 12.75%
        const MIN_BRICK_DY = 6.0;         // Brick yields are lower but have appreciation
        const GOOD_CAP_RATE = 8.0;        // 8% Cap Rate is decent for Brick
        const MAX_PAPER_PVP = 1.05;       // Don't overpay for paper

        return fiis
            .filter(f => f.liquidity > 200000) // 2025 Standard: Higher liquidity for safety
            .map(f => {
                const strategies = [];

                // Normalize Segment
                const segmentNorm = f.segment ? f.segment.normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";

                // Identify Types
                // Tijolo: Explicit list of real estate types
                const isTijolo = segmentNorm.includes('Logistica') ||
                    segmentNorm.includes('Shopping') ||
                    segmentNorm.includes('Lajes') ||
                    segmentNorm.includes('Escritorio') ||
                    segmentNorm.includes('Hospital') ||
                    segmentNorm.includes('Hotel') ||
                    segmentNorm.includes('Residencial') ||
                    segmentNorm.includes('Varejo');

                // Papel/Income: Receivables, Securities, Hybrids, Multistrat, Others
                // "Multicategoria" and "Outros" often behave like Paper/Hedge Funds in Brazil
                const isPapel = segmentNorm.includes('Titulos') ||
                    segmentNorm.includes('Val. Mob') ||
                    segmentNorm.includes('Recebiveis') ||
                    segmentNorm.includes('Papel') ||
                    segmentNorm.includes('Multicategoria') ||
                    segmentNorm.includes('Outros');

                // Hybrids/Fund of Funds could be either, but usually behave more like Paper/Income or Mixed
                const isHybridOrOther = !isTijolo && !isPapel;

                // Explicit Category for UI
                let type = 'OUTROS';
                if (isTijolo) type = 'TIJOLO';
                if (isPapel) type = 'PAPEL';


                // --- STRATEGY CLASSIFICATION ---

                // 🧱 Brick Opportunities (Tijolo)
                // Tijolo is safer long term. We look for good assets at a discount.
                // Discount: P/VP < 0.95 (Margin of Safety), but > 0.60 (Avoid Zombie funds).
                // Quality: Vacancy < 10% (Tighter 2025 Standard).
                // Cap Rate Check: If available, should be decent (> 6%).
                const capRateOk = f.cap_rate === 0 || f.cap_rate > 6;

                if (isTijolo && f.p_vp < 0.95 && f.p_vp > 0.60 && f.vacancy < 10 && f.dy > MIN_BRICK_DY && capRateOk) {
                    strategies.push('TIJOLO_VALUE');
                }

                // 📄 Paper High Yield (Papel)
                // RISK CHECK: P/VP must be > 0.85. Below that implies default risk/insolvency.
                // Yield: Must be strictly attractive (> Selic - 1.5%). 
                // Trap Check: DY > 20% often means capital return or non-recurring.
                // Premium FIIs: Allow P/VP up to 1.10 if highly liquid and yielding above Selic
                const maxPaperPVP = f.liquidity > 2000000 && f.dy > selic ? 1.10 : MAX_PAPER_PVP;
                if (isPapel && f.dy > MIN_PAPER_DY && f.dy < 20 && f.p_vp > 0.85 && f.p_vp <= maxPaperPVP && f.liquidity > 500000) {
                    strategies.push('PAPEL_YIELD');
                }

                // 🛡️ Safe / Income (The "Pension" portfolio)
                // Balanced P/VP (0.85 - 1.10)
                // Good Liquidity, Good Yield, Low Vacancy
                const safeYield = Math.max(9, selic * 0.7); // At least 9% or 70% of Selic
                if (f.p_vp >= 0.85 && f.p_vp <= 1.10 && f.vacancy < 5 && f.dy > safeYield && f.liquidity > 1000000) {
                    strategies.push('SAFE_INCOME');
                }


                // --- SCORING SYSTEM (0-10) ---
                let score = 0;

                // Valuation
                if (f.p_vp >= 0.85 && f.p_vp <= 1.05) score += 2; // Fair price sweet spot
                else if (f.p_vp < 0.85 && isTijolo && f.p_vp > 0.60) score += 1; // Deep value (only good for brick)

                // Cap Rate Bonus (Brick only)
                if (isTijolo && f.cap_rate === 0) score -= 1; // No history/data available
                if (isTijolo && f.cap_rate > GOOD_CAP_RATE) score += 2;
                if (isTijolo && f.cap_rate > 6 && f.cap_rate <= GOOD_CAP_RATE) score += 1;

                // Yield (The main driver for FIIs)
                // Use FFO Yield for Tijolo (more reliable), DY for Papel
                const effectiveYield = isTijolo && f.ffo_yield > 0 ? f.ffo_yield : f.dy;

                if (effectiveYield > MIN_PAPER_DY) score += 2; // Beats Market/Selic equivalent
                else if (effectiveYield > 8) score += 1;

                // Quality & Risk
                if (f.vacancy < 5) score += 2;
                else if (f.vacancy < 10) score += 1;

                // Liquidity (Safety to exit)
                if (f.liquidity > 1000000) score += 2; // Very Liquid / Institutional
                else if (f.liquidity > 250000) score += 1;

                // Sector Bonus
                // Logistics, Malls, Agencies, and Hospitals have better long-term resilience
                if (segmentNorm.includes('Logistica') ||
                    segmentNorm.includes('Shopping') ||
                    segmentNorm.includes('Agencia') ||
                    segmentNorm.includes('Hospital')) {
                    score += 1;
                }

                // Penalty for High Risk Paper trading at premium or huge discount
                if (isPapel && f.p_vp < 0.80) score -= 3; // Likely default risk / High Stress
                if (isPapel && f.p_vp > 1.15) score -= 2; // Overpriced paper
                if (f.vacancy > 15) score -= 2; // High vacancy alert
                if (f.dy < 0.1) score -= 5; // Trap
                if (f.dy > 25) score -= 3; // Yield Trap likely

                // Ensure score is 0-10
                score = Math.max(0, Math.min(10, score));

                return { ...f, strategies, type, score, selic };
            })
            // Filter: Must have a strategy OR a decent score (>= 6) to show up
            .filter(f => f.strategies.length > 0 || f.score >= 6)
            .sort((a, b) => {
                // Sort by Score first, then DY
                return b.score - a.score || b.dy - a.dy;
            });

    } catch (error) {
        console.error('Error fetching/parsing FIIs:', error.message);
        return [];
    }
}

module.exports = { getBestFIIs };
