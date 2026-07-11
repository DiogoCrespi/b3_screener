function clamp(value, min = 0, max = 10) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function normalizeText(value) {
    let text = String(value || '');
    if (/[ÃÂâ]/.test(text)) {
        const repaired = Buffer.from(text, 'latin1').toString('utf8');
        if (!repaired.includes('�')) text = repaired;
    }
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function hasAny(text, terms) {
    return terms.some(term => text.includes(term));
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function parseB3Ticker(ticker) {
    const normalized = String(ticker || '').toUpperCase();
    const match = normalized.match(/^([A-Z]{4})(\d{1,2})$/);
    return {
        issuer_key: match ? match[1] : normalized,
        share_class: match ? match[2] : null
    };
}

module.exports = { clamp, normalizeText, hasAny, finiteNumber, parseB3Ticker };
