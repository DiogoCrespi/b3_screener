const fs = require('fs');
const path = require('path');

function generateUniverseExport() {
    console.log('📦 Gerando exportação oficial universe.json do b3_screener...');
    
    const dataJsPath = path.join(__dirname, 'data.js');
    if (!fs.existsSync(dataJsPath)) {
        throw new Error(`Arquivo data.js não encontrado em ${dataJsPath}`);
    }

    const content = fs.readFileSync(dataJsPath, 'utf-8');
    const jsonMatch = content.match(/window\.INVEST_DATA\s*=\s*(\{.*\});?/s);
    if (!jsonMatch) {
        throw new Error('Formato inválido em data.js');
    }

    const rawData = JSON.parse(jsonMatch[1].trim());
    const records = [];
    const nowIso = new Date().toISOString();

    // Processa Ações
    (rawData.stocks || []).forEach(s => {
        const price = Number(s.cotacao) || 0;
        if (price <= 0) return; // Rejeita preço <= 0

        const dyRaw = Number(s.dividend_yield) || 0;
        const dyDecimal = dyRaw > 1 ? dyRaw / 100.0 : dyRaw; // Normaliza porcentagens

        records.push({
            ticker: s.ticker,
            asset_class: "stock",
            price: price,
            avg_daily_volume_brl: Number(s.liq_2meses) || 0,
            sector: s.sector || s.segmento || "Outros",
            market_cap: Number(s.market_cap) || null,
            pe: Number(s.pl) || null,
            pvp: Number(s.p_vp) || null,
            ev_ebitda: Number(s.ev_ebit) || null,
            roe: s.roe ? (s.roe > 1 ? s.roe / 100.0 : s.roe) : null,
            roic: s.roic ? (s.roic > 1 ? s.roic / 100.0 : s.roic) : null,
            net_debt_ebitda: Number(s.div_br_patrim) || null,
            dividend_yield: dyDecimal,
            source: "b3_screener",
            as_of: s.collected_at || nowIso
        });
    });

    // Processa FIIs
    (rawData.fiis || []).forEach(f => {
        const price = Number(f.cotacao) || 0;
        if (price <= 0) return;

        const dyRaw = Number(f.dividend_yield) || 0;
        const dyDecimal = dyRaw > 1 ? dyRaw / 100.0 : dyRaw;

        records.push({
            ticker: f.ticker,
            asset_class: "fii",
            price: price,
            avg_daily_volume_brl: Number(f.liq_2meses) || 0,
            sector: f.segmento || "FII",
            market_cap: null,
            pe: null,
            pvp: Number(f.p_vp) || null,
            ev_ebitda: null,
            roe: null,
            roic: null,
            net_debt_ebitda: null,
            dividend_yield: dyDecimal,
            source: "b3_screener",
            as_of: f.collected_at || nowIso
        });
    });

    // Processa ETFs
    (rawData.etfs || []).forEach(e => {
        const price = Number(e.cotacao) || 0;
        if (price <= 0) return;

        records.push({
            ticker: e.ticker,
            asset_class: "etf",
            price: price,
            avg_daily_volume_brl: Number(e.liq_2meses) || 0,
            sector: "ETF",
            market_cap: null,
            pe: null,
            pvp: null,
            ev_ebitda: null,
            roe: null,
            roic: null,
            net_debt_ebitda: null,
            dividend_yield: 0.0,
            source: "b3_screener",
            as_of: nowIso
        });
    });

    const exportPayload = {
        schema_version: 1,
        generated_at: nowIso,
        records: records
    };

    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    const universePath = path.join(exportsDir, 'universe.json');
    fs.writeFileSync(universePath, JSON.stringify(exportPayload, null, 2), 'utf-8');
    console.log(`✅ universo exportado com sucesso (${records.length} registros válidos) para: ${universePath}`);
}

if (require.main === module) {
    generateUniverseExport();
}

module.exports = { generateUniverseExport };
