(() => {
  'use strict';

  const data = window.B3_HISTORY_DATA;
  if (!data) {
    document.body.innerHTML = '<main class="page-shell"><h1>Histórico indisponível</h1><p>Execute <code>npm run build:history</code> para gerar history-data.js.</p><a href="./index.html">Voltar ao screener</a></main>';
    return;
  }

  const $ = selector => document.querySelector(selector);
  const metricCatalog = {
    stock: {
      price: ['Preço', 'R$', 2], dy: ['Dividend Yield', '%', 2], score: ['Score', '', 2],
      pvp: ['P/VP', 'x', 2], roe: ['ROE', '%', 2], roic: ['ROIC', '%', 2],
      liquidity: ['Liquidez', 'R$', 0], graham: ['Preço Graham', 'R$', 2], bazin: ['Preço Bazin', 'R$', 2],
      payout: ['Payout', '%', 2], growth: ['Crescimento 5a', '%', 2]
    },
    fund: {
      price: ['Preço', 'R$', 2], dy: ['Dividend Yield', '%', 2], score: ['Score', '', 2],
      pvp: ['P/VP', 'x', 2], liquidity: ['Liquidez', 'R$', 0], marketCap: ['Valor de mercado', 'R$', 0],
      vacancy: ['Vacância', '%', 2], ffoYield: ['FFO Yield', '%', 2], capRate: ['Cap Rate', '%', 2]
    }
  };
  const state = { type: 'stock', ticker: '', compare: '', metric: 'price', period: 'all' };
  const tooltip = $('#chartTooltip');
  let toastTimer;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  const labelMap = {
    'STAR_GROWTH': 'Estrela (Crescimento)',
    'STAR_INCOME': 'Estrela (Dividendos)',
    'STAR_VALUE': 'Estrela (Valor)',
    'STAR': 'Estrela',
    'OPPORTUNITY': 'Oportunidade',
    'UNDER_REVIEW': 'Sob Revisão',
    'NEUTRAL': 'Neutro',
    'TOP_PICK': 'Top Pick',
    'REAL_ESTATE_PHYSICAL': 'Tijolo (Físico)',
    'REAL_ESTATE_CREDIT': 'Papel (Recebíveis)',
    'AGRO_CREDIT': 'Fiagro (Crédito)',
    'AGRO_LAND': 'Fiagro (Terra)',
    'INFRA_CREDIT': 'FI-Infra',
    'FUND_OF_FUNDS': 'Fundo de Fundos (FoF)',
    'HYBRID': 'Híbrido',
    'UNKNOWN': 'Não Classificado'
  };

  function translateLabel(val) {
    return labelMap[val] || val;
  }

  function fieldIndex(type, field) { return data.fields[type].indexOf(field); }
  function formatDate(date) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
  function compact(value) { return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
  function formatValue(type, metric, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/D';
    const [, suffix, digits] = metricCatalog[type][metric] || [metric, '', 2];
    if ((metric === 'liquidity' || metric === 'marketCap') && Math.abs(value) >= 1000) return `${suffix} ${compact(value)}`.trim();
    const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    return suffix === 'R$' ? `R$ ${number}` : suffix === 'x' ? `${number}x` : `${number}${suffix}`;
  }
  function validNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
  function percentChange(first, last) { return validNumber(first) && validNumber(last) && first !== 0 ? ((last / first) - 1) * 100 : null; }
  function signed(value, suffix = '%') { return validNumber(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}` : 'N/D'; }

  function decodeSeries(type, ticker) {
    const source = data.series[type][ticker];
    if (!source) return [];
    return source.d.map((dateIndex, index) => {
      const point = { dateIndex, date: data.dates[dateIndex] };
      data.fields[type].forEach((field, fieldPosition) => { point[field] = source.v[index][fieldPosition]; });
      return point;
    });
  }

  function filterPeriod(points, period = state.period) {
    if (period === 'all' || !points.length) return points;
    const last = new Date(`${points.at(-1).date}T12:00:00Z`);
    const threshold = new Date(last);
    threshold.setUTCDate(threshold.getUTCDate() - Number(period));
    return points.filter(point => new Date(`${point.date}T12:00:00Z`) >= threshold);
  }

  function metricValues(points, metric) { return points.map(point => point[metric]).filter(validNumber); }
  function firstLastValid(points, metric) {
    const valid = points.filter(point => validNumber(point[metric]));
    return valid.length ? [valid[0], valid.at(-1)] : [null, null];
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function readQuery() {
    const params = new URLSearchParams(location.search);
    const type = params.get('type');
    if (type === 'stock' || type === 'fund') state.type = type;
    const tickers = Object.keys(data.series[state.type]);
    const requested = params.get('ticker');
    state.ticker = tickers.includes(requested) ? requested : (state.type === 'stock' && tickers.includes('PETR4') ? 'PETR4' : tickers.sort((a, b) => data.series[state.type][b].d.length - data.series[state.type][a].d.length)[0]);
    const metric = params.get('metric');
    if (metricCatalog[state.type][metric]) state.metric = metric;
    const period = params.get('period');
    if (['30', '90', 'all'].includes(period)) state.period = period;
    const compare = params.get('compare');
    if (tickers.includes(compare) && compare !== state.ticker) state.compare = compare;
  }

  function writeQuery() {
    const params = new URLSearchParams({ type: state.type, ticker: state.ticker, metric: state.metric, period: state.period });
    if (state.compare) params.set('compare', state.compare);
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  }

  function renderSummary() {
    const meta = data.meta;
    const accepted = meta.accepted.stock + meta.accepted.fund;
    $('#summaryGrid').innerHTML = [
      ['Período', `${formatDate(meta.range.from)} → ${formatDate(meta.range.to)}`, `${data.dates.length} datas canônicas`],
      ['Ativos', `${meta.assets.stock + meta.assets.fund}`, `${meta.assets.stock} ações · ${meta.assets.fund} fundos`],
      ['Snapshots válidos', `${accepted}`, `${meta.accepted.stock} ações · ${meta.accepted.fund} fundos`],
      ['Qualidade', `${meta.rejected.length} rejeitados`, `${((accepted / meta.sourceFiles) * 100).toFixed(1)}% de aproveitamento`]
    ].map(([label, value, detail]) => `<article class="stat-card"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="stat-detail">${detail}</span></article>`).join('');
    $('#freshness').innerHTML = `<strong>Atualizado até ${formatDate(meta.range.to)}</strong><br>Artefato v${meta.version}, gerado a partir de ${meta.sourceFiles} snapshots.`;
  }

  function populateControls() {
    document.querySelectorAll('#assetType button').forEach(button => button.classList.toggle('active', button.dataset.type === state.type));
    const tickers = Object.keys(data.series[state.type]).sort();
    const globalAssets = [
      ...Object.keys(data.series.stock).map(ticker => ({ ticker, type: 'stock', label: 'Ação' })),
      ...Object.keys(data.series.fund).map(ticker => ({ ticker, type: 'fund', label: 'Fundo' }))
    ].sort((a, b) => a.ticker.localeCompare(b.ticker));
    $('#assetOptions').innerHTML = globalAssets.map(asset => `<option value="${escapeHTML(asset.ticker)}" label="${asset.label}"></option>`).join('');
    $('#assetSearch').value = state.ticker;
    $('#assetSearch').placeholder = `Buscar entre ${globalAssets.length} ações e fundos`;
    $('#compareAsset').innerHTML = `<option value="">Sem comparação</option>${tickers.filter(ticker => ticker !== state.ticker).map(ticker => `<option value="${escapeHTML(ticker)}" ${ticker === state.compare ? 'selected' : ''}>${escapeHTML(ticker)}</option>`).join('')}`;
    const metrics = metricCatalog[state.type];
    if (!metrics[state.metric]) state.metric = 'price';
    $('#metricSelect').innerHTML = Object.entries(metrics).map(([key, [label]]) => `<option value="${key}" ${key === state.metric ? 'selected' : ''}>${label}</option>`).join('');
    $('#periodSelect').value = state.period;
  }

  function renderAsset() {
    const allPoints = decodeSeries(state.type, state.ticker);
    const points = filterPeriod(allPoints);
    const latest = allPoints.at(-1) || {};
    const [firstMetric, lastMetric] = firstLastValid(points, state.metric);
    const values = metricValues(points, state.metric);
    const variation = percentChange(firstMetric?.[state.metric], lastMetric?.[state.metric]);
    $('#assetKind').textContent = state.type === 'stock' ? 'Ação listada' : (translateLabel(latest.fundType) || 'Fundo listado');
    $('#assetTitle').textContent = state.ticker;
    $('#assetRange').textContent = points.length ? `${formatDate(points[0].date)} a ${formatDate(points.at(-1).date)} · ${points.length} observações` : 'Sem observações no período';
    $('#assetSignal').textContent = translateLabel(latest.signal || 'SEM SINAL');
    $('#assetCategory').textContent = [translateLabel(latest.category), translateLabel(latest.exposure)].filter(Boolean).join(' · ') || 'Sem categoria';
    $('#selectionQuality').innerHTML = `<strong>${allPoints.length} pontos disponíveis</strong><br>${points.length} no período atual. ${allPoints.length < data.dates.length ? `${data.dates.length - allPoints.length} datas sem observação para o ativo.` : 'Série completa no calendário aceito.'}`;

    const latestPrice = [...allPoints].reverse().find(point => validNumber(point.price))?.price;
    const latestDy = [...allPoints].reverse().find(point => validNumber(point.dy))?.dy;
    const latestScore = [...allPoints].reverse().find(point => validNumber(point.score))?.score;
    const latestPvp = [...allPoints].reverse().find(point => validNumber(point.pvp))?.pvp;
    const kpis = [
      ['Último preço', formatValue(state.type, 'price', latestPrice), latest.date ? formatDate(latest.date) : '—', ''],
      ['DY atual', formatValue(state.type, 'dy', latestDy), 'trailing do snapshot', ''],
      ['Score atual', formatValue(state.type, 'score', latestScore), latest.signal || 'sem sinal', ''],
      ['P/VP atual', formatValue(state.type, 'pvp', latestPvp), 'valor patrimonial', ''],
      [`Variação · ${metricCatalog[state.type][state.metric][0]}`, signed(variation), `${formatValue(state.type, state.metric, firstMetric?.[state.metric])} → ${formatValue(state.type, state.metric, lastMetric?.[state.metric])}`, variation > 0 ? 'positive' : variation < 0 ? 'negative' : '']
    ];
    $('#kpiGrid').innerHTML = kpis.map(([label, value, detail, css]) => `<article class="kpi"><span class="kpi-label">${escapeHTML(label)}</span><strong class="kpi-value ${css}">${escapeHTML(value)}</strong><span class="kpi-detail">${escapeHTML(detail)}</span></article>`).join('');
    renderBuyMoment(allPoints, points);
    renderMainChart(points);
    renderMiniCharts(points);
    renderTimeline(allPoints);
    renderMacro();
  }

  function getBuyMomentData(ticker, type) {
    const allPoints = decodeSeries(type, ticker);
    const points = filterPeriod(allPoints);
    if (!allPoints.length) return null;

    const latest = allPoints.at(-1) || {};
    const currentPrice = [...allPoints].reverse().find(p => validNumber(p.price))?.price;
    const currentScore = [...allPoints].reverse().find(p => validNumber(p.score))?.score;
    const currentDy = [...allPoints].reverse().find(p => validNumber(p.dy))?.dy;
    const currentPvp = [...allPoints].reverse().find(p => validNumber(p.pvp))?.pvp;
    const currentSignal = latest.signal || '';

    if (!validNumber(currentPrice)) return null;

    // 1. Preço histórico
    const prices = allPoints.map(p => p.price).filter(validNumber);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const pricePercentile = priceRange > 0 ? ((currentPrice - minPrice) / priceRange) * 100 : 50;

    // 2. Dividend Yield histórico
    const dys = allPoints.map(p => p.dy).filter(validNumber);
    const avgDy = dys.length ? dys.reduce((a, b) => a + b, 0) / dys.length : 0;

    // 3. P/VP histórico
    const pvps = allPoints.map(p => p.pvp).filter(validNumber);
    const avgPvp = pvps.length ? pvps.reduce((a, b) => a + b, 0) / pvps.length : 1;

    // 4. Margem de segurança (Ações)
    const latestGraham = [...allPoints].reverse().find(p => validNumber(p.graham))?.graham;
    const latestBazin = [...allPoints].reverse().find(p => validNumber(p.bazin))?.bazin;

    // Lógica do Scoring (Atratividade)
    let score = 50;

    // Qualidade
    if (validNumber(currentScore)) {
      if (currentScore >= 7.5) score += 15;
      else if (currentScore >= 6.0) score += 5;
      else if (currentScore < 5.0) score -= 15;
      if (currentScore < 4.0) score -= 20;
    }

    // Posição do preço
    score += (50 - pricePercentile) * 0.6; // Max +30 se min histórico, -30 se max histórico

    // Valuation por classe de ativo
    const reasons = [];
    if (type === 'stock') {
      let positiveMargins = 0;
      let totalMargins = 0;

      if (validNumber(latestGraham) && latestGraham > 0) {
        totalMargins++;
        const margin = ((latestGraham - currentPrice) / latestGraham) * 100;
        if (margin > 0) {
          positiveMargins++;
          reasons.push(`Preço está <strong>${margin.toFixed(1)}% abaixo</strong> do preço de Graham (R$ ${formatValue(type, 'price', latestGraham)}).`);
        } else {
          reasons.push(`Preço está acima do preço de Graham (R$ ${formatValue(type, 'price', latestGraham)}).`);
        }
      }

      if (validNumber(latestBazin) && latestBazin > 0) {
        totalMargins++;
        const margin = ((latestBazin - currentPrice) / latestBazin) * 100;
        if (margin > 0) {
          positiveMargins++;
          reasons.push(`Margem de segurança de <strong>${margin.toFixed(1)}%</strong> sobre o Preço Bazin (R$ ${formatValue(type, 'price', latestBazin)}).`);
        } else {
          reasons.push(`Preço acima do Preço Teto de Bazin (R$ ${formatValue(type, 'price', latestBazin)}).`);
        }
      }

      if (totalMargins > 0) {
        if (positiveMargins === totalMargins) score += 15;
        else if (positiveMargins > 0) score += 5;
        else score -= 15;
      }
    } else {
      // FIIs
      if (validNumber(currentPvp)) {
        const discount = avgPvp - currentPvp;
        if (currentPvp < 1.0) {
          score += 10;
          reasons.push(`P/VP atual de <strong>${currentPvp.toFixed(2)}x</strong> indica desconto patrimonial (abaixo de 1.0x).`);
        } else if (currentPvp > 1.08) {
          score -= 15;
          reasons.push(`Fundo negociado com ágio patrimonial relevante (P/VP de <strong>${currentPvp.toFixed(2)}x</strong>).`);
        }
        if (discount > 0.05) {
          score += 5;
          reasons.push(`Múltiplo P/VP descontado em relação à média histórica (Média: <strong>${avgPvp.toFixed(2)}x</strong>).`);
        }
      }
    }

    // Dividends
    if (validNumber(currentDy) && avgDy > 0) {
      if (currentDy > avgDy * 1.05 && currentDy >= 6.0) {
        score += 10;
        reasons.push(`Dividend Yield atual de <strong>${currentDy.toFixed(2)}%</strong> está acima da média histórica (<strong>${avgDy.toFixed(2)}%</strong>).`);
      } else if (currentDy < avgDy * 0.8) {
        score -= 10;
        reasons.push(`Yield de <strong>${currentDy.toFixed(2)}%</strong> está abaixo da sua média histórica (<strong>${avgDy.toFixed(2)}%</strong>).`);
      }
    }

    // Sinais / Tese
    if (currentSignal.includes('COMPRA') || currentSignal.includes('STAR')) {
      score += 10;
    } else if (currentSignal.includes('REVISAR') || currentSignal.includes('VEND')) {
      score -= 15;
    }

    score = Math.max(0, Math.min(100, score));

    // Determina o status
    let statusClass = 'neutro';
    let statusLabel = 'Zona Neutra';
    
    if (validNumber(currentScore) && currentScore < 4.0) {
      statusClass = 'evitar';
      statusLabel = 'Alto Risco';
      reasons.unshift('<strong>Alerta de Qualidade:</strong> Score de fundamentos baixo (abaixo de 4.0), indicando possível armadilha.');
    } else if (score >= 65) {
      statusClass = 'oportunidade';
      statusLabel = 'Melhor Momento';
    } else if (score <= 35 || pricePercentile > 80) {
      statusClass = 'passou';
      statusLabel = 'Momento Passou';
    }

    // Razão de preço geral
    if (pricePercentile < 25) {
      reasons.unshift(`Preço atual (R$ ${formatValue(type, 'price', currentPrice)}) está muito próximo da mínima histórica registrada de R$ ${formatValue(type, 'price', minPrice)} (percentil ${pricePercentile.toFixed(0)}%).`);
    } else if (pricePercentile > 75) {
      reasons.unshift(`Preço atual está próximo da máxima histórica de R$ ${formatValue(type, 'price', maxPrice)} (percentil ${pricePercentile.toFixed(0)}%).`);
    } else {
      reasons.push(`Preço atual de R$ ${formatValue(type, 'price', currentPrice)} está na faixa intermediária histórica (entre R$ ${formatValue(type, 'price', minPrice)} e R$ ${formatValue(type, 'price', maxPrice)}).`);
    }

    return { ticker, score, statusClass, statusLabel, reasons, currentPrice, currentScore };
  }

  function renderBuyMoment(allPoints, points) {
    const card = $('#buyMomentCard');
    const primaryData = getBuyMomentData(state.ticker, state.type);
    if (!primaryData) {
      card.style.display = 'none';
      return;
    }

    const hasCompare = state.compare && data.series[state.type][state.compare];
    const compareData = hasCompare ? getBuyMomentData(state.compare, state.type) : null;

    if (!hasCompare) {
      card.innerHTML = `
        <div class="buy-moment-header">
          <h3 class="buy-moment-title">🛍️ Momento de Compra</h3>
          <span class="buy-moment-status ${primaryData.statusClass}">${primaryData.statusLabel}</span>
        </div>
        <div class="buy-moment-content">
          <div class="buy-moment-metric-box">
            <div class="buy-moment-bar-label">
              <span>Atratividade</span>
              <span class="buy-moment-bar-value">${primaryData.score.toFixed(0)}/100</span>
            </div>
            <div class="buy-moment-bar-wrap" role="progressbar" aria-valuenow="${primaryData.score.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="Pontuação de Atratividade de Preço">
              <div class="buy-moment-bar-fill ${primaryData.statusClass}" style="width: ${primaryData.score.toFixed(0)}%;"></div>
            </div>
          </div>
          <ul class="buy-moment-reasons">
            ${primaryData.reasons.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      let verdictText = '';
      let verdictClass = 'equal';
      if (primaryData.score > compareData.score + 5) {
        verdictText = `🏆 <strong>${primaryData.ticker}</strong> é a melhor opção de compra no momento com score de atratividade de <strong>${primaryData.score.toFixed(0)}/100</strong> (contra ${compareData.score.toFixed(0)}/100 de ${compareData.ticker}).`;
        verdictClass = 'primary-best';
      } else if (compareData.score > primaryData.score + 5) {
        verdictText = `🏆 <strong>${compareData.ticker}</strong> é a melhor opção de compra no momento com score de atratividade de <strong>${compareData.score.toFixed(0)}/100</strong> (contra ${primaryData.score.toFixed(0)}/100 de ${primaryData.ticker}).`;
        verdictClass = 'compare-best';
      } else {
        verdictText = `⚖️ Ambos os ativos possuem atratividade semelhante no momento (<strong>${primaryData.score.toFixed(0)}/100</strong> vs <strong>${compareData.score.toFixed(0)}/100</strong>).`;
        verdictClass = 'equal';
      }

      card.innerHTML = `
        <div class="buy-moment-header">
          <h3 class="buy-moment-title">🛍️ Comparativo: Momento de Compra</h3>
        </div>
        <div class="buy-moment-comparison-verdict ${verdictClass}">
          ${verdictText}
        </div>
        <div class="buy-moment-columns">
          <div class="buy-moment-column">
            <div class="buy-moment-header" style="margin-bottom: 8px;">
              <strong style="font-size: 1.05rem;">${primaryData.ticker}</strong>
              <span class="buy-moment-status ${primaryData.statusClass}">${primaryData.statusLabel}</span>
            </div>
            <div class="buy-moment-metric-box" style="margin-bottom: 12px;">
              <div class="buy-moment-bar-label">
                <span>Atratividade</span>
                <span class="buy-moment-bar-value">${primaryData.score.toFixed(0)}/100</span>
              </div>
              <div class="buy-moment-bar-wrap" role="progressbar" aria-valuenow="${primaryData.score.toFixed(0)}" aria-valuemin="0" aria-valuemax="100">
                <div class="buy-moment-bar-fill ${primaryData.statusClass}" style="width: ${primaryData.score.toFixed(0)}%;"></div>
              </div>
            </div>
            <ul class="buy-moment-reasons" style="padding-left: 15px; font-size: 0.8rem;">
              ${primaryData.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
          <div class="buy-moment-column">
            <div class="buy-moment-header" style="margin-bottom: 8px;">
              <strong style="font-size: 1.05rem;">${compareData.ticker}</strong>
              <span class="buy-moment-status ${compareData.statusClass}">${compareData.statusLabel}</span>
            </div>
            <div class="buy-moment-metric-box" style="margin-bottom: 12px;">
              <div class="buy-moment-bar-label">
                <span>Atratividade</span>
                <span class="buy-moment-bar-value">${compareData.score.toFixed(0)}/100</span>
              </div>
              <div class="buy-moment-bar-wrap" role="progressbar" aria-valuenow="${compareData.score.toFixed(0)}" aria-valuemin="0" aria-valuemax="100">
                <div class="buy-moment-bar-fill ${compareData.statusClass}" style="width: ${compareData.score.toFixed(0)}%;"></div>
              </div>
            </div>
            <ul class="buy-moment-reasons" style="padding-left: 15px; font-size: 0.8rem;">
              ${compareData.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
    card.style.display = 'flex';
  }

  function chartGeometry(seriesList, metric, normalize) {
    const allDateIndexes = seriesList.flatMap(series => series.points.map(point => point.dateIndex));
    const dateMin = Math.min(...allDateIndexes), dateMax = Math.max(...allDateIndexes);
    const prepared = seriesList.map(series => {
      const first = series.points.find(point => validNumber(point[metric]))?.[metric];
      return { ...series, values: series.points.map(point => ({ ...point, chartValue: validNumber(point[metric]) ? (normalize && first ? ((point[metric] / first) - 1) * 100 : point[metric]) : null })) };
    });
    const values = prepared.flatMap(series => series.values.map(point => point.chartValue)).filter(validNumber);
    if (!values.length) return null;
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const padding = (max - min) * .12;
    min -= padding; max += padding;
    return { prepared, dateMin, dateMax: Math.max(dateMax, dateMin + 1), min, max, normalize };
  }

  function renderMainChart(primaryPoints) {
    const comparisonPoints = state.compare ? filterPeriod(decodeSeries(state.type, state.compare)) : [];
    const hasCompare = Boolean(state.compare);
    const normalize = hasCompare;
    const geometry = chartGeometry([
      { ticker: state.ticker, points: primaryPoints, secondary: false },
      ...(hasCompare ? [{ ticker: state.compare, points: comparisonPoints, secondary: true }] : [])
    ], state.metric, normalize);
    const metricLabel = metricCatalog[state.type][state.metric][0];
    $('#chartTitle').textContent = normalize ? `${metricLabel} · retorno normalizado` : metricLabel;
    $('#chartEyebrow').textContent = state.period === 'all' ? 'Todo o histórico' : `Últimos ${state.period} dias`;

    const latestPrimary = [...primaryPoints].reverse().find(point => validNumber(point[state.metric]))?.[state.metric];
    const latestCompare = hasCompare ? [...comparisonPoints].reverse().find(point => validNumber(point[state.metric]))?.[state.metric] : null;

    const formatLegendText = (ticker, value) => {
      if (!validNumber(value)) return escapeHTML(ticker);
      return `${escapeHTML(ticker)}: <strong>${formatValue(state.type, state.metric, value)}</strong>`;
    };

    const primaryLabel = formatLegendText(state.ticker, latestPrimary);
    const compareLabel = hasCompare ? formatLegendText(state.compare, latestCompare) : '';

    $('#chartLegend').innerHTML = `<span class="legend-item"><i class="legend-dot"></i><span id="mainLegendPrimary">${primaryLabel}</span></span>${hasCompare ? `<span class="legend-item"><i class="legend-dot secondary"></i><span id="mainLegendCompare">${compareLabel}</span></span>` : ''}`;

    const container = $('#mainChart');
    if (!geometry) { container.innerHTML = '<div class="chart-empty">Sem valores válidos para esta métrica.</div>'; return; }

    const W = 900, H = 330, P = { l: 62, r: 20, t: 18, b: 38 };
    const x = dateIndex => P.l + ((dateIndex - geometry.dateMin) / (geometry.dateMax - geometry.dateMin)) * (W - P.l - P.r);
    const y = value => P.t + ((geometry.max - value) / (geometry.max - geometry.min)) * (H - P.t - P.b);
    function pathFor(values) {
      let started = false;
      return values.map(point => {
        if (!validNumber(point.chartValue)) { started = false; return ''; }
        const command = started ? 'L' : 'M'; started = true;
        return `${command}${x(point.dateIndex).toFixed(1)},${y(point.chartValue).toFixed(1)}`;
      }).join(' ');
    }
    const ticks = Array.from({ length: 5 }, (_, index) => geometry.min + ((geometry.max - geometry.min) * index / 4));
    const dateTicks = Array.from({ length: 4 }, (_, index) => Math.round(geometry.dateMin + ((geometry.dateMax - geometry.dateMin) * index / 3)));
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(value => `<line class="chart-grid" x1="${P.l}" x2="${W - P.r}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="${P.l - 8}" y="${y(value) + 4}" text-anchor="end">${geometry.normalize ? signed(value) : escapeHTML(formatValue(state.type, state.metric, value))}</text>`).join('')}
      ${dateTicks.map(index => `<text class="chart-axis-label" x="${x(index)}" y="${H - 10}" text-anchor="middle">${escapeHTML(data.dates[index]?.slice(5).replace('-', '/') || '')}</text>`).join('')}
      ${geometry.prepared.map(series => `<path class="chart-line ${series.secondary ? 'secondary' : ''}" d="${pathFor(series.values)}"/>`).join('')}
      <line class="chart-crosshair" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" visibility="hidden"/>
      <rect class="chart-hit" x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}"/>
    </svg>`;
    const svg = container.querySelector('svg');
    const hit = svg.querySelector('.chart-hit');
    const crosshair = svg.querySelector('.chart-crosshair');

    const primaryLegendEl = $('#mainLegendPrimary');
    const compareLegendEl = $('#mainLegendCompare');

    hit.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      const svgX = ((event.clientX - rect.left) / rect.width) * W;
      const targetIndex = Math.round(geometry.dateMin + ((svgX - P.l) / (W - P.l - P.r)) * (geometry.dateMax - geometry.dateMin));
      const primary = geometry.prepared[0].values.reduce((best, point) => Math.abs(point.dateIndex - targetIndex) < Math.abs(best.dateIndex - targetIndex) ? point : best, geometry.prepared[0].values[0]);
      crosshair.setAttribute('x1', x(primary.dateIndex)); crosshair.setAttribute('x2', x(primary.dateIndex)); crosshair.setAttribute('visibility', 'visible');

      const primaryVal = primary[state.metric];
      const comparePoint = hasCompare ? geometry.prepared[1].values.reduce((best, candidate) => Math.abs(candidate.dateIndex - primary.dateIndex) < Math.abs(best.dateIndex - primary.dateIndex) ? candidate : best, geometry.prepared[1].values[0]) : null;
      const compareVal = comparePoint ? comparePoint[state.metric] : null;

      primaryLegendEl.innerHTML = formatLegendText(state.ticker, primaryVal);
      if (hasCompare && compareLegendEl) {
        compareLegendEl.innerHTML = formatLegendText(state.compare, compareVal);
      }

      const rows = geometry.prepared.map(series => {
        const point = series.values.reduce((best, candidate) => Math.abs(candidate.dateIndex - primary.dateIndex) < Math.abs(best.dateIndex - primary.dateIndex) ? candidate : best, series.values[0]);
        return `<div>${escapeHTML(series.ticker)}: <b>${geometry.normalize ? signed(point.chartValue) : escapeHTML(formatValue(state.type, state.metric, point[state.metric]))}</b></div>`;
      }).join('');
      tooltip.innerHTML = `<strong>${formatDate(primary.date)}</strong>${rows}`;
      tooltip.hidden = false; tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`; tooltip.style.top = `${Math.max(10, event.clientY - 70)}px`;
    });
    hit.addEventListener('pointerleave', () => {
      primaryLegendEl.innerHTML = formatLegendText(state.ticker, latestPrimary);
      if (hasCompare && compareLegendEl) {
        compareLegendEl.innerHTML = formatLegendText(state.compare, latestCompare);
      }
      crosshair.setAttribute('visibility', 'hidden'); tooltip.hidden = true;
    });
  }

  function sparkline(primaryPoints, comparisonPoints, metric) {
    const hasCompare = comparisonPoints && comparisonPoints.length > 0;
    const seriesList = [
      { ticker: state.ticker, points: primaryPoints, secondary: false },
      ...(hasCompare ? [{ ticker: state.compare, points: comparisonPoints, secondary: true }] : [])
    ];
    const normalize = hasCompare;
    const geometry = chartGeometry(seriesList, metric, normalize);
    if (!geometry) return '<div class="chart-empty" style="height:70px">Poucos dados</div>';

    const H = 60, W = 100, padding = 6;
    const x = dateIndex => ((dateIndex - geometry.dateMin) / (geometry.dateMax - geometry.dateMin)) * W;
    const y = val => padding + ((geometry.max - val) / (geometry.max - geometry.min)) * (H - padding * 2);

    function pathFor(values) {
      let started = false;
      return values.map(point => {
        if (!validNumber(point.chartValue)) { started = false; return ''; }
        const command = started ? 'L' : 'M'; started = true;
        return `${command}${x(point.dateIndex).toFixed(1)},${y(point.chartValue).toFixed(1)}`;
      }).join(' ');
    }

    return `<svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <line class="chart-grid" x1="0" x2="100" y1="56" y2="56"/>
      ${geometry.prepared.map(series => `<path class="${series.secondary ? 'secondary' : ''}" d="${pathFor(series.values)}"/>`).join('')}
      <line class="sparkline-crosshair" x1="0" x2="0" y1="0" y2="56" visibility="hidden"/>
      <rect class="sparkline-hit" x="0" y="0" width="100" height="60" fill="transparent"/>
    </svg>`;
  }

  function renderMiniCharts(primaryPoints) {
    const comparisonPoints = state.compare ? filterPeriod(decodeSeries(state.type, state.compare)) : [];
    const metrics = ['price', 'dy', 'score', 'pvp'];
    $('#miniCharts').innerHTML = metrics.map(metric => {
      const latest = [...primaryPoints].reverse().find(point => validNumber(point[metric]))?.[metric];
      return `<article class="mini-card" data-metric="${metric}"><div class="mini-top"><span class="mini-title">${metricCatalog[state.type][metric][0]}</span><strong class="mini-value">${formatValue(state.type, metric, latest)}</strong></div><div class="sparkline">${sparkline(primaryPoints, comparisonPoints, metric)}</div></article>`;
    }).join('');

    document.querySelectorAll('.mini-card').forEach(card => {
      const metric = card.dataset.metric;
      const hasCompare = comparisonPoints && comparisonPoints.length > 0;
      const seriesList = [
        { ticker: state.ticker, points: primaryPoints, secondary: false },
        ...(hasCompare ? [{ ticker: state.compare, points: comparisonPoints, secondary: true }] : [])
      ];
      const normalize = hasCompare;
      const geometry = chartGeometry(seriesList, metric, normalize);
      if (!geometry) return;

      const latestVal = [...primaryPoints].reverse().find(point => validNumber(point[metric]))?.[metric];
      const latestText = formatValue(state.type, metric, latestVal);
      const valueEl = card.querySelector('.mini-value');
      const svg = card.querySelector('svg');
      const hit = svg.querySelector('.sparkline-hit');
      const crosshair = svg.querySelector('.sparkline-crosshair');

      hit.addEventListener('pointermove', event => {
        const rect = svg.getBoundingClientRect();
        const pct = (event.clientX - rect.left) / rect.width;
        const targetDateIndex = Math.round(geometry.dateMin + pct * (geometry.dateMax - geometry.dateMin));
        const primaryPoint = primaryPoints.reduce((best, point) => Math.abs(point.dateIndex - targetDateIndex) < Math.abs(best.dateIndex - targetDateIndex) ? point : best, primaryPoints[0]);
        if (!primaryPoint) return;

        const xPos = ((primaryPoint.dateIndex - geometry.dateMin) / (geometry.dateMax - geometry.dateMin) * 100).toFixed(1);
        crosshair.setAttribute('x1', xPos);
        crosshair.setAttribute('x2', xPos);
        crosshair.setAttribute('visibility', 'visible');

        let tooltipRows = '';
        if (hasCompare) {
          const compPoint = comparisonPoints.reduce((best, point) => Math.abs(point.dateIndex - primaryPoint.dateIndex) < Math.abs(best.dateIndex - primaryPoint.dateIndex) ? point : best, comparisonPoints[0]);
          const primaryVal = primaryPoint[metric];
          const compVal = compPoint ? compPoint[metric] : null;

          valueEl.innerHTML = `<span style="color: var(--accent);">${formatValue(state.type, metric, primaryVal)}</span> · <span style="color: var(--blue); font-size: 0.85em;">${formatValue(state.type, metric, compVal)}</span>`;

          const pFirst = geometry.prepared[0].values.find(p => validNumber(p[metric]))?.[metric];
          const cFirst = geometry.prepared[1].values.find(p => validNumber(p[metric]))?.[metric];

          tooltipRows = `
            <div>${escapeHTML(state.ticker)}: <b>${formatValue(state.type, metric, primaryVal)}</b> (${signed(percentChange(pFirst, primaryVal))})</div>
            <div>${escapeHTML(state.compare)}: <b>${formatValue(state.type, metric, compVal)}</b> (${signed(percentChange(cFirst, compVal))})</div>
          `;
        } else {
          valueEl.textContent = formatValue(state.type, metric, primaryPoint[metric]);
          tooltipRows = `<div>${metricCatalog[state.type][metric][0]}: <b>${formatValue(state.type, metric, primaryPoint[metric])}</b></div>`;
        }

        tooltip.innerHTML = `<strong>${formatDate(primaryPoint.date)}</strong>${tooltipRows}`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`;
        tooltip.style.top = `${Math.max(10, event.clientY - 70)}px`;
      });

      hit.addEventListener('pointerleave', () => {
        valueEl.innerHTML = latestText;
        crosshair.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
      });
    });
  }

  function renderTimeline(points) {
    const changes = [];
    let previous = '';
    for (const point of points) {
      const current = [translateLabel(point.signal), translateLabel(point.category)].filter(Boolean).join(' · ');
      if (current && current !== previous) { changes.push({ date: point.date, value: current }); previous = current; }
    }
    $('#timeline').innerHTML = changes.length ? changes.slice().reverse().map(change => `<div class="timeline-item"><span class="timeline-date">${formatDate(change.date)}</span><span class="timeline-value">${escapeHTML(change.value)}</span></div>`).join('') : '<p class="muted">Nenhuma mudança de sinal registrada.</p>';
  }

  function renderMacro() {
    const economy = data.economy.map(([dateIndex, selic, dollar]) => ({ dateIndex, date: data.dates[dateIndex], selic, dollar }));
    const points = filterPeriod(economy);
    const selic = points.filter(point => validNumber(point.selic));
    const dollar = points.filter(point => validNumber(point.dollar));
    const normalize = values => {
      const first = values[0]?.value;
      return values.map(item => ({ ...item, normalized: first ? ((item.value / first) - 1) * 100 : 0 }));
    };
    const series = [
      ...normalize(selic.map(point => ({ dateIndex: point.dateIndex, value: point.selic }))).map(point => ({ ...point, type: 'selic' })),
      ...normalize(dollar.map(point => ({ dateIndex: point.dateIndex, value: point.dollar }))).map(point => ({ ...point, type: 'dollar' }))
    ];
    const container = $('#macroChart');
    if (!series.length) { container.innerHTML = '<p class="muted">Contexto macro indisponível.</p>'; return; }

    const minDate = Math.min(...series.map(point => point.dateIndex)), maxDate = Math.max(...series.map(point => point.dateIndex), minDate + 1);
    let min = Math.min(...series.map(point => point.normalized)), max = Math.max(...series.map(point => point.normalized)); if (min === max) { min--; max++; }

    const xCoord = dateIndex => ((dateIndex - minDate) / (maxDate - minDate) * 100).toFixed(1);
    const path = type => series.filter(point => point.type === type).map((point, index) => `${index ? 'L' : 'M'}${xCoord(point.dateIndex)},${(90 - ((point.normalized - min) / (max - min) * 78)).toFixed(1)}`).join(' ');

    const latestSelic = selic.at(-1)?.selic, latestDollar = dollar.at(-1)?.dollar;
    const latestSelicText = formatValue('stock', 'dy', latestSelic);
    const latestDollarText = formatValue('stock', 'price', latestDollar);

    container.innerHTML = `<div class="legend" id="macroLegend"><span class="legend-item"><i class="legend-dot"></i>Selic <strong id="macroSelicVal">${latestSelicText}</strong></span><span class="legend-item"><i class="legend-dot secondary"></i>Dólar <strong id="macroDollarVal">${latestDollarText}</strong></span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line class="chart-grid" x1="0" x2="100" y1="90" y2="90"/>
      <path class="chart-line" d="${path('selic')}"/>
      <path class="chart-line secondary" d="${path('dollar')}"/>
      <line class="sparkline-crosshair" x1="0" x2="0" y1="0" y2="90" visibility="hidden"/>
      <rect class="sparkline-hit" x="0" y="0" width="100" height="100" fill="transparent"/>
    </svg>`;

    const svg = container.querySelector('svg');
    const hit = svg.querySelector('.sparkline-hit');
    const crosshair = svg.querySelector('.sparkline-crosshair');
    const selicValEl = $('#macroSelicVal');
    const dollarValEl = $('#macroDollarVal');

    hit.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      const pct = (event.clientX - rect.left) / rect.width;
      const targetDateIndex = Math.round(minDate + pct * (maxDate - minDate));

      const closestPoint = points.reduce((best, point) => Math.abs(point.dateIndex - targetDateIndex) < Math.abs(best.dateIndex - targetDateIndex) ? point : best, points[0]);
      if (!closestPoint) return;

      const selicVal = formatValue('stock', 'dy', closestPoint.selic);
      const dollarVal = formatValue('stock', 'price', closestPoint.dollar);

      selicValEl.textContent = selicVal;
      dollarValEl.textContent = dollarVal;

      const xPos = xCoord(closestPoint.dateIndex);
      crosshair.setAttribute('x1', xPos);
      crosshair.setAttribute('x2', xPos);
      crosshair.setAttribute('visibility', 'visible');

      tooltip.innerHTML = `<strong>${formatDate(closestPoint.date)}</strong><div>Selic: <b>${selicVal}</b></div><div>Dólar: <b>${dollarVal}</b></div>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`;
      tooltip.style.top = `${Math.max(10, event.clientY - 90)}px`;
    });

    hit.addEventListener('pointerleave', () => {
      selicValEl.textContent = latestSelicText;
      dollarValEl.textContent = latestDollarText;
      crosshair.setAttribute('visibility', 'hidden');
      tooltip.hidden = true;
    });
  }

  function calculateRanking() {
    const rows = Object.keys(data.series[state.type]).map(ticker => {
      const points = filterPeriod(decodeSeries(state.type, ticker));
      const [firstPrice, lastPrice] = firstLastValid(points, 'price');
      const [firstScore, lastScore] = firstLastValid(points, 'score');
      const latestDy = [...points].reverse().find(point => validNumber(point.dy))?.dy;
      return { ticker, priceChange: percentChange(firstPrice?.price, lastPrice?.price), scoreChange: validNumber(firstScore?.score) && validNumber(lastScore?.score) ? lastScore.score - firstScore.score : null, dy: latestDy };
    });
    const top = (field, direction = -1) => rows.filter(row => validNumber(row[field])).sort((a, b) => (a[field] - b[field]) * direction).slice(0, 5);
    return [
      ['Maiores altas', top('priceChange'), 'priceChange', value => signed(value)],
      ['Maiores quedas', top('priceChange', 1), 'priceChange', value => signed(value)],
      ['Maiores DY', top('dy'), 'dy', value => formatValue(state.type, 'dy', value)],
      ['Evolução de score', top('scoreChange'), 'scoreChange', value => signed(value, '')]
    ];
  }

  function renderRankings() {
    $('#rankingGrid').innerHTML = calculateRanking().map(([title, rows, field, formatter]) => `<article class="ranking-card"><p class="eyebrow">${state.type === 'stock' ? 'Ações' : 'Fundos'}</p><h2>${title}</h2><div class="ranking-list">${rows.map((row, index) => `<button class="ranking-row" type="button" data-ticker="${escapeHTML(row.ticker)}"><span class="rank">0${index + 1}</span><span class="ranking-ticker">${escapeHTML(row.ticker)}</span><span class="ranking-value ${row[field] < 0 ? 'negative' : ''}">${formatter(row[field])}</span></button>`).join('')}</div></article>`).join('');
    document.querySelectorAll('.ranking-row').forEach(button => button.addEventListener('click', () => { state.ticker = button.dataset.ticker; state.compare = ''; update(); scrollTo({ top: 0, behavior: 'smooth' }); }));
  }

  function renderQuality() {
    const accepted = data.meta.accepted.stock + data.meta.accepted.fund;
    $('#qualityGrid').innerHTML = [
      ['Aproveitamento', `${((accepted / data.meta.sourceFiles) * 100).toFixed(1)}%`, `${accepted} de ${data.meta.sourceFiles} snapshots`],
      ['Rejeições', data.meta.rejected.length, 'Snapshots abaixo do mínimo ou estruturalmente inválidos'],
      ['Cobertura', data.dates.length, `${data.meta.range.from} a ${data.meta.range.to}`]
    ].map(([label, value, detail]) => `<article class="quality-card"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="stat-detail">${detail}</span></article>`).join('');
    $('#rejectedList').innerHTML = data.meta.rejected.map(item => `<div class="rejected-row"><span>${escapeHTML(item.date)}</span><span>${item.type === 'stock' ? 'Ação' : 'Fundo'}</span><span>${escapeHTML(item.reason)}</span><span>${item.count ?? '—'} / mín. ${item.minimum ?? '—'}</span></div>`).join('');
  }

  function downloadSeries() {
    const points = decodeSeries(state.type, state.ticker);
    const fields = data.fields[state.type];
    const rows = [['date', ...fields], ...points.map(point => [point.date, ...fields.map(field => point[field] ?? '')])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.ticker}-historico.csv`; link.click(); URL.revokeObjectURL(link.href);
    showToast(`Série de ${state.ticker} exportada.`);
  }

  function bindEvents() {
    document.querySelectorAll('#assetType button').forEach(button => button.addEventListener('click', () => {
      state.type = button.dataset.type; state.ticker = Object.keys(data.series[state.type]).sort((a, b) => data.series[state.type][b].d.length - data.series[state.type][a].d.length)[0]; state.compare = ''; state.metric = 'price'; update();
    }));
    $('#assetSearch').addEventListener('change', event => {
      const ticker = event.target.value.trim().toUpperCase();
      const nextType = data.series.stock[ticker] ? 'stock' : data.series.fund[ticker] ? 'fund' : null;
      if (!nextType) { showToast('Ticker não encontrado no histórico.'); return; }
      if (nextType !== state.type) {
        state.type = nextType;
        state.metric = 'price';
        state.compare = '';
      } else if (state.compare === ticker) {
        state.compare = '';
      }
      state.ticker = ticker;
      update();
    });
    $('#compareAsset').addEventListener('change', event => { state.compare = event.target.value; update(); });
    $('#metricSelect').addEventListener('change', event => { state.metric = event.target.value; update(); });
    $('#periodSelect').addEventListener('change', event => { state.period = event.target.value; update(); });
    $('#downloadCsv').addEventListener('click', downloadSeries);
    $('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('b3-history-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); });
    $('#toggleRejected').addEventListener('click', event => { const list = $('#rejectedList'); list.hidden = !list.hidden; event.currentTarget.setAttribute('aria-expanded', String(!list.hidden)); event.currentTarget.textContent = list.hidden ? 'Ver snapshots rejeitados' : 'Ocultar snapshots rejeitados'; });
  }

  function update() {
    populateControls(); renderAsset(); renderRankings(); writeQuery();
  }

  if (localStorage.getItem('b3-history-theme') === 'dark') document.body.classList.add('dark');
  readQuery(); renderSummary(); renderQuality(); bindEvents(); update();
})();