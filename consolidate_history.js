/**
 * consolidate_history.js
 * Processa os arquivos JSON diários de history/ e gera arquivos consolidados
 * com histórico de preços, variações, e métricas fundamentalistas por ativo.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, 'history');
const OUTPUT_DIR = __dirname;

// ─── Campos extras a capturar por tipo ────────────────────────────────────────

const FII_EXTRA_FIELDS = ['score', 'category', 'dy', 'ffo_yield', 'p_vp', 'market_cap',
    'liquidity', 'vacancy', 'cap_rate', 'last_dividend', 'external_segment', 'type'];

const STOCK_EXTRA_FIELDS = ['score', 'category', 'dividend_yield', 'pl', 'p_vp', 'psr',
    'ev_ebit', 'mrg_ebit', 'mrg_liq', 'roic', 'roe', 'liq_2meses',
    'graham_price', 'upside', 'bazin_price', 'bazin_upside', 'cresc_5a'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrai data YYYY-MM-DD do nome do arquivo como fallback */
function dateFromFilename(filename) {
    const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

/** Soma dos valores de um array (ignorando null/undefined/NaN) */
function safeAvg(arr) {
    const nums = arr.filter(v => v != null && !isNaN(v));
    if (!nums.length) return null;
    return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Processa uma lista de arquivos JSON e retorna um objeto indexado por ticker.
 * Cada ticker contém um array de entradas diárias + estatísticas resumidas.
 *
 * @param {string[]} fileList - nomes dos arquivos ordenados
 * @param {'fii'|'stock'} type
 * @returns {Object} history map
 */
function processFiles(fileList, type) {
    const history = {}; // ticker -> { entries: [...], stats: {...} }
    const extraFields = type === 'fii' ? FII_EXTRA_FIELDS : STOCK_EXTRA_FIELDS;
    const priceKey = type === 'fii' ? 'price' : 'cotacao';

    let processedFiles = 0;
    let skippedFiles = 0;

    for (const filename of fileList) {
        const filePath = path.join(HISTORY_DIR, filename);
        let content;

        try {
            content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            console.warn(`  ⚠  Erro ao ler ${filename}: ${err.message}`);
            skippedFiles++;
            continue;
        }

        // Data: prefere content.date, fallback para nome do arquivo
        const rawDate = content.date ? content.date.split('T')[0] : dateFromFilename(filename);
        if (!rawDate) {
            console.warn(`  ⚠  Não foi possível determinar a data de ${filename}`);
            skippedFiles++;
            continue;
        }

        const items = Array.isArray(content.items) ? content.items : [];

        for (const item of items) {
            const ticker = item.ticker;
            if (!ticker) continue;

            const price = item[priceKey];
            if (price == null || isNaN(price)) continue;

            if (!history[ticker]) {
                history[ticker] = { entries: [] };
            }

            const entries = history[ticker].entries;

            // Deduplicar: pula se já existe entrada para esta data
            if (entries.some(e => e.date === rawDate)) continue;

            // Variação vs. entrada anterior
            let variation = 0;
            if (entries.length > 0) {
                const lastPrice = entries[entries.length - 1].price;
                if (lastPrice && lastPrice !== 0) {
                    variation = ((price - lastPrice) / lastPrice) * 100;
                }
            }

            // Captura campos extras
            const extra = {};
            for (const field of extraFields) {
                if (item[field] !== undefined) extra[field] = item[field];
            }

            entries.push({
                date: rawDate,
                price: parseFloat(price.toFixed(4)),
                variation: parseFloat(variation.toFixed(4)),
                ...extra
            });
        }

        processedFiles++;
    }

    console.log(`  ✓ ${processedFiles} arquivo(s) processado(s), ${skippedFiles} ignorado(s).`);

    // Calcular estatísticas por ticker
    for (const ticker of Object.keys(history)) {
        const entries = history[ticker].entries;
        const prices = entries.map(e => e.price).filter(Boolean);
        const variations = entries.map(e => e.variation);
        const scores = entries.map(e => e.score).filter(v => v != null);

        const firstPrice = prices[0] ?? null;
        const lastPrice = prices[prices.length - 1] ?? null;
        const totalVariation = (firstPrice && lastPrice && firstPrice !== 0)
            ? parseFloat(((lastPrice - firstPrice) / firstPrice * 100).toFixed(4))
            : 0;

        history[ticker].stats = {
            totalDays: entries.length,
            firstDate: entries[0]?.date ?? null,
            lastDate: entries[entries.length - 1]?.date ?? null,
            firstPrice,
            lastPrice,
            minPrice: prices.length ? parseFloat(Math.min(...prices).toFixed(4)) : null,
            maxPrice: prices.length ? parseFloat(Math.max(...prices).toFixed(4)) : null,
            totalVariation,
            avgDailyVariation: safeAvg(variations),
            avgScore: safeAvg(scores),
        };
    }

    return history;
}

// ─── Exportadores ─────────────────────────────────────────────────────────────

/**
 * Salva o JSON consolidado com entries + stats por ticker.
 */
function exportJSON(history, filename) {
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, JSON.stringify(history, null, 2), 'utf8');
    console.log(`  → ${filename} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

/**
 * Exporta CSV com formato:
 * Ticker | TotalDias | PrimeiroPreco | UltimoPreco | VarTotal | ... | DataN Price | DataN Var
 */
function exportCSV(history, filename) {
    const tickers = Object.keys(history).sort();
    if (!tickers.length) return;

    // Coletar todas as datas únicas
    const datesSet = new Set();
    for (const ticker of tickers) {
        for (const e of history[ticker].entries) datesSet.add(e.date);
    }
    const dates = Array.from(datesSet).sort();

    // Cabeçalho
    const statHeaders = ['TotalDias', 'PrimeiroPreco', 'UltimoPreco', 'VarTotal%', 'VarDiariaMedia%', 'MinPreco', 'MaxPreco', 'ScoreMedio'];
    const dateHeaders = dates.flatMap(d => [`${d} (Preco)`, `${d} (Var%)`]);
    const header = ['Ticker', ...statHeaders, ...dateHeaders].join(',');

    const rows = [header];

    for (const ticker of tickers) {
        const { entries, stats } = history[ticker];

        const statValues = [
            stats.totalDays,
            stats.firstPrice ?? '',
            stats.lastPrice ?? '',
            stats.totalVariation ?? '',
            stats.avgDailyVariation ?? '',
            stats.minPrice ?? '',
            stats.maxPrice ?? '',
            stats.avgScore ?? '',
        ];

        const dateValues = dates.flatMap(date => {
            const entry = entries.find(e => e.date === date);
            return entry ? [entry.price, entry.variation] : ['', ''];
        });

        rows.push([ticker, ...statValues, ...dateValues].join(','));
    }

    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, rows.join('\n'), 'utf8');
    console.log(`  → ${filename} (${tickers.length} ativos, ${dates.length} datas)`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function consolidate() {
    console.log('====================================');
    console.log(' B3 Screener — Consolidação Histórica');
    console.log('====================================\n');

    const allFiles = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json')).sort();

    const fiisFiles = allFiles.filter(f => f.includes('fii'));
    const stocksFiles = allFiles.filter(f => f.includes('stock'));

    console.log(`📁 ${fiisFiles.length} arquivo(s) de FIIs encontrado(s).`);
    const fiiHistory = processFiles(fiisFiles, 'fii');
    exportJSON(fiiHistory, 'consolidated_fiis.json');
    exportCSV(fiiHistory, 'consolidated_fiis.csv');

    console.log('');

    console.log(`📁 ${stocksFiles.length} arquivo(s) de Stocks encontrado(s).`);
    const stockHistory = processFiles(stocksFiles, 'stock');
    exportJSON(stockHistory, 'consolidated_stocks.json');
    exportCSV(stockHistory, 'consolidated_stocks.csv');

    console.log('\n✅ Consolidação concluída com sucesso!');
    console.log('====================================\n');
}

consolidate();
