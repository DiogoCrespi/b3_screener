const { normalizeText, hasAny } = require('./analysis-utils');
const { KNOWN_FIAGROS, KNOWN_INFRAS } = require('../config/fii_lists');

const PHYSICAL_TERMS = [
    'logistica', 'log stica', 'industria', 'galpo', 'shopping', 'varejo', 'laje',
    'escritorio', 'escrit rios', 'hospital', 'hotel', 'residencial', 'educacional',
    'agencia bancaria', 'renda urbana', 'imoveis'
];
const CREDIT_TERMS = [
    'titulos e valores mobiliarios', 'titulos e val', 'recebiveis', 'cri',
    'credito imobiliario', 'credito estruturado'
];
const FOF_TERMS = ['fundo de fundos', 'fundos de fundos', 'fof', 'cotas de fii', 'cotas de fiis'];
const HYBRID_TERMS = ['hibrido', 'misto', 'multiestrategia', 'multimercado', 'multicategoria'];

function classifyFund(fund, metadata = {}) {
    const ticker = String(fund.ticker || metadata.ticker || '').toUpperCase();
    const source = {
        externalType: normalizeText(metadata.type),
        externalSegment: normalizeText(metadata.segment),
        mandate: normalizeText(metadata.mandate),
        baseSegment: normalizeText(fund.segment)
    };
    const combined = Object.values(source).join(' ');
    const reasons = [];

    let regulatoryClass = 'FII';
    if (KNOWN_INFRAS.includes(ticker) || hasAny(combined, ['fi-infra', 'fundo de infraestrutura'])) {
        regulatoryClass = 'FI_INFRA';
        reasons.push('Regulatory class identified as infrastructure.');
    } else if (KNOWN_FIAGROS.includes(ticker) || hasAny(combined, ['fiagro', 'agronegocio', 'agro'])) {
        regulatoryClass = 'FIAGRO';
        reasons.push('Regulatory class identified as agribusiness.');
    }

    // Segment describes the actual exposure more precisely than a generic mandate.
    const segmentText = `${source.externalSegment} ${source.baseSegment}`;
    let exposure = 'UNKNOWN';
    let confidence = 'LOW';

    if (hasAny(segmentText, FOF_TERMS)) {
        exposure = 'FUND_OF_FUNDS';
        confidence = 'HIGH';
        reasons.push('Fund-of-funds exposure found in segment.');
    } else if (hasAny(segmentText, CREDIT_TERMS)) {
        exposure = regulatoryClass === 'FIAGRO' ? 'AGRO_CREDIT'
            : regulatoryClass === 'FI_INFRA' ? 'INFRA_CREDIT'
                : 'REAL_ESTATE_CREDIT';
        confidence = 'HIGH';
        reasons.push('Credit exposure found in segment.');
    } else if (hasAny(segmentText, PHYSICAL_TERMS)) {
        exposure = regulatoryClass === 'FIAGRO' ? 'AGRO_LAND' : 'REAL_ESTATE_PHYSICAL';
        confidence = 'HIGH';
        reasons.push('Physical-asset exposure found in segment.');
    } else if (hasAny(combined, FOF_TERMS)) {
        exposure = 'FUND_OF_FUNDS';
        confidence = 'MEDIUM';
        reasons.push('Fund-of-funds exposure inferred from type or mandate.');
    } else if (hasAny(combined, CREDIT_TERMS)) {
        exposure = regulatoryClass === 'FIAGRO' ? 'AGRO_CREDIT'
            : regulatoryClass === 'FI_INFRA' ? 'INFRA_CREDIT'
                : 'REAL_ESTATE_CREDIT';
        confidence = 'MEDIUM';
        reasons.push('Credit exposure inferred from type or mandate.');
    } else if (hasAny(combined, HYBRID_TERMS)) {
        exposure = 'HYBRID';
        confidence = 'MEDIUM';
        reasons.push('Hybrid exposure declared without a more specific segment.');
    }

    const physicalEvidence = hasAny(segmentText, PHYSICAL_TERMS);
    const creditEvidence = hasAny(segmentText, CREDIT_TERMS);
    if (physicalEvidence && creditEvidence) {
        exposure = 'HYBRID';
        confidence = 'MEDIUM';
        reasons.push('Conflicting physical and credit evidence requires portfolio review.');
    }

    if (exposure === 'UNKNOWN' && regulatoryClass === 'FI_INFRA') {
        exposure = 'INFRA_CREDIT';
        confidence = 'LOW';
        reasons.push('Infrastructure credit assumed; detailed portfolio classification unavailable.');
    } else if (exposure === 'UNKNOWN' && regulatoryClass === 'FIAGRO') {
        exposure = 'AGRO_CREDIT';
        confidence = 'LOW';
        reasons.push('Agribusiness credit assumed; detailed portfolio classification unavailable.');
    } else if (exposure === 'UNKNOWN' && Number(fund.num_properties) > 0) {
        exposure = 'REAL_ESTATE_PHYSICAL';
        confidence = 'LOW';
        reasons.push('Physical exposure inferred only from reported property count.');
    }

    const legacyType = regulatoryClass === 'FIAGRO' ? 'AGRO'
        : regulatoryClass === 'FI_INFRA' ? 'INFRA'
            : exposure === 'REAL_ESTATE_PHYSICAL' ? 'TIJOLO'
                : exposure === 'REAL_ESTATE_CREDIT' ? 'PAPEL'
                    : ['FUND_OF_FUNDS', 'HYBRID'].includes(exposure) ? 'MULTI'
                        : 'OUTROS';

    return {
        regulatory_class: regulatoryClass,
        exposure,
        classification_confidence: confidence,
        classification_reasons: reasons,
        type: legacyType
    };
}

module.exports = { classifyFund };
