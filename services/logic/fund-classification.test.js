const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyFund } = require('./fund-classification');

describe('fund classification', () => {
    test('classifies PSEC11 as credit instead of physical real estate', () => {
        const result = classifyFund(
            { ticker: 'PSEC11', segment: 'Outros', num_properties: 0 },
            { segment: 'Títulos e Valores Mobiliários' }
        );
        assert.strictEqual(result.regulatory_class, 'FII');
        assert.strictEqual(result.exposure, 'REAL_ESTATE_CREDIT');
        assert.strictEqual(result.type, 'PAPEL');
        assert.strictEqual(result.classification_confidence, 'HIGH');
    });

    test('keeps a logistics fund physical even with a multicategory mandate', () => {
        const result = classifyFund(
            { ticker: 'XPLG11', segment: 'Logística', num_properties: 20 },
            { segment: 'Logístico / Indústria / Galpões', mandate: 'Multicategoria' }
        );
        assert.strictEqual(result.exposure, 'REAL_ESTATE_PHYSICAL');
        assert.strictEqual(result.type, 'TIJOLO');
    });

    test('normalizes mojibake without turning physical funds into hybrid funds', () => {
        const result = classifyFund(
            { ticker: 'MCLO11', segment: 'Logï¿½stica', num_properties: 4 },
            { segment: 'LogÃ­stico / IndÃºstria / GalpÃµes', mandate: 'Títulos e Valores Mobiliários' }
        );
        assert.strictEqual(result.exposure, 'REAL_ESTATE_PHYSICAL');
        assert.strictEqual(result.type, 'TIJOLO');
    });

    test('does not mistake the CRI letters inside escritorios for credit exposure', () => {
        const result = classifyFund(
            { ticker: 'HGRE11', segment: 'Escritï¿½rios', num_properties: 12 },
            { segment: 'Lajes Corporativas', mandate: 'Títulos e Valores Mobiliários' }
        );
        assert.strictEqual(result.exposure, 'REAL_ESTATE_PHYSICAL');
        assert.strictEqual(result.type, 'TIJOLO');
    });

    test('does not treat an isolated property count as physical when credit evidence is explicit', () => {
        const result = classifyFund(
            { ticker: 'RECR11', segment: 'Multicategoria', num_properties: 1 },
            { segment: 'Títulos e Valores Mobiliários' }
        );
        assert.strictEqual(result.exposure, 'REAL_ESTATE_CREDIT');
        assert.strictEqual(result.type, 'PAPEL');
    });

    test('separates FIAGRO and FI-Infra regulatory classes', () => {
        assert.strictEqual(classifyFund({ ticker: 'RURA11' }, { segment: 'Fiagros' }).regulatory_class, 'FIAGRO');
        assert.strictEqual(classifyFund({ ticker: 'JURO11' }, { segment: 'Fundo de Infraestrutura (FI-Infra)' }).regulatory_class, 'FI_INFRA');
    });

    test('marks genuinely conflicting evidence as hybrid', () => {
        const result = classifyFund(
            { ticker: 'TEST11', segment: 'Títulos e Valores Mobiliários', num_properties: 2 },
            { segment: 'Logístico / Indústria / Galpões' }
        );
        assert.strictEqual(result.exposure, 'HYBRID');
        assert.strictEqual(result.classification_confidence, 'MEDIUM');
    });
});
