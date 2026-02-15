const { getBestFIIs } = require('./services/fiis');
const { getFIInfra } = require('./services/fi_infra');
const fs = require('fs');

async function exportBolaNeveCSV() {
    console.log('🔄 Fetching FII data...');

    // Fetch both regular FIIs and FI-Infra
    const [baseFiis, fiInfra] = await Promise.all([
        getBestFIIs(),
        getFIInfra()
    ]);

    // Merge the data
    const allFiis = [...baseFiis, ...fiInfra];

    console.log(`✅ Total FIIs: ${allFiis.length}`);

    // CSV Headers
    const headers = [
        'Ticker',
        'Tipo',
        'Segmento',
        'Preço',
        'DY (%)',
        'P/VP',
        'Liquidez Diária (R$)',
        'Vacância (%)',
        'Score',
        'Estratégias',
        'Número Mágico',
        'Custo Mágico (R$)',
        'Seção Bola de Neve'
    ];

    // Determine section for each FII
    function getSection(fii) {
        if (fii.type === 'AGRO' || fii.type === 'INFRA') {
            return 'Destaques (Fiagro & Infra)';
        } else if (fii.price < 15) {
            return 'Base R$ 10 (Acessíveis)';
        } else if (fii.price >= 15 && fii.price < 70) {
            return 'Base R$ 20 - R$ 50 (Intermediários)';
        } else {
            return 'Base R$ 100+ (Premium/Tradicionais)';
        }
    }

    // Format liquidity value
    function formatLiquidity(value) {
        if (!value || value === 0) return 'N/A';
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(2)}M`;
        } else if (value >= 1000) {
            return `${(value / 1000).toFixed(2)}K`;
        }
        return value.toFixed(2);
    }

    // Convert FIIs to CSV rows
    const rows = allFiis.map(fii => {
        return [
            fii.ticker,
            fii.type || 'N/A',
            fii.segment || 'N/A',
            fii.price.toFixed(2),
            fii.dy.toFixed(2),
            (fii.p_vp || fii.pvp || 0).toFixed(2),
            formatLiquidity(fii.liquidity),
            (fii.vacancy || 0).toFixed(2),
            fii.score || 0,
            (fii.strategies || []).join('; '),
            fii.magicNumber || 'N/A',
            fii.magicCost ? fii.magicCost.toFixed(2) : 'N/A',
            getSection(fii)
        ];
    });

    // Sort by section, then by price
    rows.sort((a, b) => {
        const sectionOrder = {
            'Destaques (Fiagro & Infra)': 0,
            'Base R$ 10 (Acessíveis)': 1,
            'Base R$ 20 - R$ 50 (Intermediários)': 2,
            'Base R$ 100+ (Premium/Tradicionais)': 3
        };

        const sectionA = sectionOrder[a[12]];
        const sectionB = sectionOrder[b[12]];

        if (sectionA !== sectionB) {
            return sectionA - sectionB;
        }

        // Within same section, sort by price
        return parseFloat(a[3]) - parseFloat(b[3]);
    });

    // Build CSV content
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
            if (typeof cell !== 'string') return cell;

            let processedCell = cell;
            // Prevent CSV Formula Injection by prepending ' to cells starting with =, +, -, @, \t, or \r
            const injectionChars = ['=', '+', '-', '@', '\t', '\r'];
            if (injectionChars.some(char => cell.startsWith(char))) {
                processedCell = `'${cell}`;
            }

            // Escape cells that contain commas or quotes
            if (processedCell.includes(',') || processedCell.includes('"')) {
                return `"${processedCell.replace(/"/g, '""')}"`;
            }
            return processedCell;
        }).join(','))
    ].join('\n');

    // Write to file
    const outputPath = 'bola_de_neve.csv';
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`\n✅ CSV exportado com sucesso: ${outputPath}`);
    console.log(`📊 Total de registros: ${rows.length}`);

    // Show summary by section
    const summary = {};
    rows.forEach(row => {
        const section = row[12];
        summary[section] = (summary[section] || 0) + 1;
    });

    console.log('\n📋 Resumo por seção:');
    Object.entries(summary).forEach(([section, count]) => {
        console.log(`   ${section}: ${count} FIIs`);
    });
}

exportBolaNeveCSV().catch(err => {
    console.error('❌ Erro ao exportar CSV:', err);
    process.exit(1);
});
