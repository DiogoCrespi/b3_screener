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
  
  const state = { type: 'stock', ticker: '', compare: '', metric: 'price', period: 'all', mode: 'local' };
  const tooltip = $('#chartTooltip');
  let toastTimer;
  let activeNewsAbortController = null;

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

  function downsample(points, maxPoints = 150) {
    if (points.length <= maxPoints) return points;
    const bucketSize = Math.ceil(points.length / maxPoints);
    const result = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      const avgPoint = { ...bucket[0] };
      const numericFields = ['price', 'dy', 'score', 'pvp', 'roe', 'roic', 'liquidity', 'graham', 'bazin', 'payout', 'growth', 'marketCap', 'vacancy', 'ffoYield', 'capRate'];
      numericFields.forEach(field => {
        const vals = bucket.map(b => b[field]).filter(validNumber);
        if (vals.length > 0) {
          avgPoint[field] = vals.reduce((a, b) => a + b, 0) / vals.length;
        } else {
          avgPoint[field] = null;
        }
      });
      const mid = bucket[Math.floor(bucket.length / 2)];
      avgPoint.date = mid.date;
      avgPoint.dateIndex = mid.dateIndex;
      result.push(avgPoint);
    }
    return result;
  }

  function decodeSeries(type, ticker) {
    const source = data.series[type][ticker];
    if (!source) return [];
    const points = source.d.map((dateIndex, index) => {
      const point = { dateIndex, date: data.dates[dateIndex] };
      data.fields[type].forEach((field, fieldPosition) => { point[field] = source.v[index][fieldPosition]; });
      return point;
    });
    if (state.mode === 'local') {
      // Local history starts on aligned March 13, 2026
      return points.filter(p => p.date >= '2026-03-13');
    }
    return points;
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
    const mode = params.get('mode');
    if (mode === 'local' || mode === 'extended') state.mode = mode;
    const tickers = Object.keys(data.series[state.type]);
    const requested = params.get('ticker');
    state.ticker = tickers.includes(requested) ? requested : (state.type === 'stock' && tickers.includes('PETR4') ? 'PETR4' : tickers.sort((a, b) => data.series[state.type][b].d.length - data.series[state.type][a].d.length)[0]);
    const metric = params.get('metric');
    if (metricCatalog[state.type][metric]) state.metric = metric;
    const period = params.get('period');
    if (['30', '90', '365', 'all'].includes(period)) state.period = period;
    const compare = params.get('compare');
    if (tickers.includes(compare) && compare !== state.ticker) state.compare = compare;
  }

  function writeQuery() {
    const params = new URLSearchParams({ type: state.type, ticker: state.ticker, metric: state.metric, period: state.period, mode: state.mode });
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
    ].map(([label, value, detail]) => `<article class="stat-card"><span class="stat-label">${label}</span><strong class="stat-value" ${label === 'Período' ? 'style="color: var(--accent);"' : ''}>${value}</strong><span class="stat-detail">${detail}</span></article>`).join('');
    $('#freshness').innerHTML = `<strong>Atualizado até ${formatDate(meta.range.to)}</strong><br>Artefato v${meta.version}, gerado a partir de ${meta.sourceFiles} snapshots.`;
  }

  function populateControls() {
    document.querySelectorAll('#assetType button').forEach(button => button.classList.toggle('active', button.dataset.type === state.type));
    document.querySelectorAll('#historyModeToggle button').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
    
    // Update period select options based on history mode
    const select = $('#periodSelect');
    const currentValue = select.value || state.period;
    if (state.mode === 'local') {
      select.innerHTML = `
        <option value="30">30 dias</option>
        <option value="90">90 dias</option>
        <option value="all">Todo o histórico local</option>
      `;
      if (currentValue === '365') {
        state.period = 'all';
      }
    } else {
      select.innerHTML = `
        <option value="30">30 dias</option>
        <option value="90">90 dias</option>
        <option value="365">1 Ano</option>
        <option value="all">Todo o histórico</option>
      `;
    }

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
    
    select.value = state.period;
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
    
    renderNews(state.ticker);
    renderBuyMoment(allPoints, points);
    renderInsights(points);
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

    return { ticker, score, statusClass, statusLabel, reasons, currentPrice, currentScore, currentPvp, currentDy };
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

  async function renderNews(ticker) {
    const newsSection = $('#newsSection');
    const newsTrack = $('#newsTrack');
    
    if (activeNewsAbortController) {
      activeNewsAbortController.abort();
    }
    activeNewsAbortController = new AbortController();
    const { signal } = activeNewsAbortController;

    newsSection.style.display = 'flex';
    newsTrack.innerHTML = Array.from({ length: 4 }).map(() => '<div class="news-skeleton"></div>').join('');

    try {
      let newsItems = [];

      // 1. Tenta obter notícias específicas do Yahoo Finance via rss2json
      try {
        const yahooTicker = ticker.includes('.') ? ticker : `${ticker}.SA`;
        const yahooUrl = `https://finance.yahoo.com/rss/headline?s=${yahooTicker}`;
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(yahooUrl)}`;
        
        const fetchController = new AbortController();
        const abortHandler = () => fetchController.abort();
        signal.addEventListener('abort', abortHandler);
        
        const timeoutId = setTimeout(() => {
          fetchController.abort();
        }, 5000); // 5s timeout
        
        const response = await fetch(rss2jsonUrl, { signal: fetchController.signal });
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
        
        if (response.ok) {
          const json = await response.json();
          if (json.status === 'ok' && json.items && json.items.length > 0) {
            newsItems = json.items.map(item => {
              let source = 'Yahoo Finance';
              if (item.link) {
                try {
                  const host = new URL(item.link).hostname;
                  if (host.includes('bloomberg')) source = 'Bloomberg';
                  else if (host.includes('reuters')) source = 'Reuters';
                  else if (host.includes('infomoney')) source = 'InfoMoney';
                  else if (host.includes('valor')) source = 'Valor Econômico';
                  else if (host.includes('estadao')) source = 'Estadão';
                  else if (host.includes('globo') || host.includes('g1')) source = 'O Globo';
                  else if (host.includes('moneytimes')) source = 'Money Times';
                  else if (host.includes('forbes')) source = 'Forbes';
                  else if (host.includes('exame')) source = 'Exame';
                } catch (e) {}
              }
              return {
                title: item.title || '',
                link: item.link || '#',
                pubDate: item.pubDate || '',
                source: source
              };
            });
          }
        }
      } catch (yahooErr) {
        if (signal.aborted) throw yahooErr;
        console.warn('Yahoo Finance RSS fetch failed or empty, falling back to Google News RSS...', yahooErr);
      }

      // 2. Se falhar ou estiver vazio, faz fallback para o Google News RSS via rss2json
      // (proxies CORS diretos estão bloqueados — rss2json funciona e tem CORS)
      if (newsItems.length === 0) {
        // Query inteligente: FIIs (sufixo 11) vs ações
        const isFii = /\d{2}$/.test(ticker); // termina em 2 dígitos → provavelmente FII
        const baseQ = isFii ? `${ticker} FII` : `${ticker} ação B3`;
        const fallbackQ = ticker; // query mais ampla se a primeira falhar

        const buildGoogleUrl = (q) =>
          `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt`;

        const tryGoogleFetch = async (googleRssUrl) => {
          const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleRssUrl)}`;
          const fetchController = new AbortController();
          const abortHandler = () => fetchController.abort();
          signal.addEventListener('abort', abortHandler);
          const timeoutId = setTimeout(() => fetchController.abort(), 10000);
          try {
            const response = await fetch(rss2jsonUrl, { signal: fetchController.signal });
            clearTimeout(timeoutId);
            signal.removeEventListener('abort', abortHandler);
            if (signal.aborted) return [];
            if (!response.ok) return [];
            const json = await response.json();
            if (json.status === 'ok' && json.items && json.items.length > 0) {
              return json.items.map(item => {
                let source = 'Google News';
                if (item.link) {
                  try {
                    const host = new URL(item.link).hostname;
                    if (host.includes('infomoney')) source = 'InfoMoney';
                    else if (host.includes('valor')) source = 'Valor Econômico';
                    else if (host.includes('estadao')) source = 'Estadão';
                    else if (host.includes('globo') || host.includes('g1')) source = 'O Globo';
                    else if (host.includes('moneytimes')) source = 'Money Times';
                    else if (host.includes('bloomberg')) source = 'Bloomberg';
                    else if (host.includes('reuters')) source = 'Reuters';
                    else if (host.includes('exame')) source = 'Exame';
                    else if (host.includes('forbes')) source = 'Forbes';
                    else if (host.includes('suno')) source = 'Suno';
                    else if (host.includes('funds')) source = 'Funds Explorer';
                  } catch (e) {}
                }
                return {
                  title: item.title || '',
                  link: item.link || '#',
                  pubDate: item.pubDate || '',
                  source: source
                };
              });
            }
            return [];
          } catch (err) {
            clearTimeout(timeoutId);
            signal.removeEventListener('abort', abortHandler);
            if (signal.aborted) throw err;
            return [];
          }
        };

        try {
          // Tentativa 1: query específica (ticker FII ou ticker ação B3)
          newsItems = await tryGoogleFetch(buildGoogleUrl(baseQ));

          // Tentativa 2: só o ticker (mais ampla) se a primeira falhar
          if (newsItems.length === 0 && !signal.aborted) {
            newsItems = await tryGoogleFetch(buildGoogleUrl(fallbackQ));
          }
        } catch (googleErr) {
          if (signal.aborted) throw googleErr;
          console.warn('Google News via rss2json falhou:', googleErr);
        }
      }

      if (signal.aborted) return;

      if (newsItems.length === 0) {
        newsSection.style.display = 'none';
        return;
      }

      const cardsHTML = newsItems.slice(0, 10).map(item => {
        const title = item.title;
        const link = item.link;
        const pubDateStr = item.pubDate;
        const source = item.source;

        let dateText = '—';
        if (pubDateStr) {
          try {
            dateText = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(pubDateStr));
          } catch (e) {
            dateText = pubDateStr;
          }
        }

        const lowerTitle = title.toLowerCase();
        let tagClass = 'mercado';
        let tagLabel = 'Mercado';

        if (lowerTitle.includes('fato relevante') || lowerTitle.includes('fatos relevantes') || lowerTitle.includes('comunicado ao mercado')) {
          tagClass = 'fato-relevante';
          tagLabel = 'Fato Relevante';
        } else if (lowerTitle.includes('dividendo') || lowerTitle.includes('provento') || lowerTitle.includes('jcp') || lowerTitle.includes('rendimento') || lowerTitle.includes('paga')) {
          tagClass = 'proventos';
          tagLabel = 'Proventos';
        }

        const sourceSuffix = ` - ${source}`;
        let cleanTitle = title;
        if (title.endsWith(sourceSuffix)) {
          cleanTitle = title.substring(0, title.length - sourceSuffix.length);
        }

        return `
          <a class="news-card" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">
            <div class="news-card-body">
              <span class="news-tag ${tagClass}">${escapeHTML(tagLabel)}</span>
              <h4 class="news-title">${escapeHTML(cleanTitle)}</h4>
            </div>
            <div class="news-meta">
              <span class="news-source">${escapeHTML(source)}</span>
              <span>${escapeHTML(dateText)}</span>
            </div>
          </a>
        `;
      }).join('');

      newsTrack.innerHTML = cardsHTML;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('Error fetching news:', error);
      newsSection.style.display = 'none';
    }
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
    const downsampledPrimary = downsample(primaryPoints);
    const comparisonPoints = state.compare ? filterPeriod(decodeSeries(state.type, state.compare)) : [];
    const downsampledCompare = downsample(comparisonPoints);
    const hasCompare = Boolean(state.compare);
    const normalize = hasCompare;
    const showValuation = state.type === 'stock' && state.metric === 'price' && !state.compare;
    const seriesList = [
      { ticker: state.ticker, points: downsampledPrimary, secondary: false }
    ];
    if (hasCompare) {
      seriesList.push({ ticker: state.compare, points: downsampledCompare, secondary: true });
    } else if (showValuation) {
      const grahamPoints = downsampledPrimary.map(p => ({ ...p, price: p.graham }));
      const bazinPoints = downsampledPrimary.map(p => ({ ...p, price: p.bazin }));
      seriesList.push({ ticker: 'Graham', points: grahamPoints, isValuation: true, valuationType: 'graham' });
      seriesList.push({ ticker: 'Bazin', points: bazinPoints, isValuation: true, valuationType: 'bazin' });
    }

    const geometry = chartGeometry(seriesList, state.metric, normalize);
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

    let legendHTML = `<span class="legend-item"><i class="legend-dot"></i><span id="mainLegendPrimary">${primaryLabel}</span></span>${hasCompare ? `<span class="legend-item"><i class="legend-dot secondary"></i><span id="mainLegendCompare">${compareLabel}</span></span>` : ''}`;
    if (showValuation) {
      const latestGraham = [...primaryPoints].reverse().find(point => validNumber(point.graham))?.graham;
      const latestBazin = [...primaryPoints].reverse().find(point => validNumber(point.bazin))?.bazin;
      const grahamLabel = latestGraham ? `Justo Graham: <strong>${formatValue(state.type, 'price', latestGraham)}</strong>` : 'Justo Graham';
      const bazinLabel = latestBazin ? `Teto Bazin: <strong>${formatValue(state.type, 'price', latestBazin)}</strong>` : 'Teto Bazin';
      legendHTML += `
        <span class="legend-item"><i class="legend-dot graham"></i><span>${grahamLabel}</span></span>
        <span class="legend-item"><i class="legend-dot bazin"></i><span>${bazinLabel}</span></span>
      `;
    }
    $('#chartLegend').innerHTML = legendHTML;

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
      ${dateTicks.map(index => {
        const d = data.dates[index];
        if (!d) return '';
        const rangeDays = geometry.dateMax - geometry.dateMin;
        const text = rangeDays > 365 ? d.slice(2, 7).replace('-', '/') : d.slice(5).replace('-', '/');
        return `<text class="chart-axis-label" x="${x(index)}" y="${H - 10}" text-anchor="middle">${escapeHTML(text)}</text>`;
      }).join('')}
      ${geometry.prepared.map(series => {
        if (series.isValuation) {
          return `<path class="chart-line valuation ${series.valuationType}" d="${pathFor(series.values)}"/>`;
        }
        return `<path class="chart-line ${series.secondary ? 'secondary' : ''}" d="${pathFor(series.values)}"/>`;
      }).join('')}
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
      if (!primary) return;
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
        const name = series.valuationType === 'graham' ? 'Justo Graham' : (series.valuationType === 'bazin' ? 'Teto Bazin' : series.ticker);
        return `<div>${escapeHTML(name)}: <b>${geometry.normalize ? signed(point.chartValue) : escapeHTML(formatValue(state.type, state.metric, point[state.metric]))}</b></div>`;
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
    const downsampledPrimary = downsample(primaryPoints, 50);
    const downsampledCompare = comparisonPoints ? downsample(comparisonPoints, 50) : [];
    const hasCompare = comparisonPoints && comparisonPoints.length > 0;
    const seriesList = [
      { ticker: state.ticker, points: downsampledPrimary, secondary: false },
      ...(hasCompare ? [{ ticker: state.compare, points: downsampledCompare, secondary: true }] : [])
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

  function getPeriodStats(ticker, type) {
    const allPoints = decodeSeries(type, ticker);
    const points = filterPeriod(allPoints);
    if (!points.length) return null;

    const prices = points.map(p => p.price).filter(validNumber);
    const dys = points.map(p => p.dy).filter(validNumber);
    const scores = points.map(p => p.score).filter(validNumber);
    const pvps = points.map(p => p.pvp).filter(validNumber);

    const firstPrice = [...points].find(p => validNumber(p.price));
    const lastPrice = [...points].reverse().find(p => validNumber(p.price));

    const priceMinPoint = points.reduce((best, point) => validNumber(point.price) && (!best || point.price < best.price) ? point : best, null);
    const priceMaxPoint = points.reduce((best, point) => validNumber(point.price) && (!best || point.price > best.price) ? point : best, null);

    const dyMaxPoint = points.reduce((best, point) => validNumber(point.dy) && (!best || point.dy > best.dy) ? point : best, null);

    const avgDy = dys.length ? dys.reduce((a, b) => a + b, 0) / dys.length : 0;
    const avgPvp = pvps.length ? pvps.reduce((a, b) => a + b, 0) / pvps.length : 0;
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    let specificStats = {};
    if (type === 'stock') {
      const roes = points.map(p => p.roe).filter(validNumber);
      const roics = points.map(p => p.roic).filter(validNumber);
      specificStats = {
        avgRoe: roes.length ? roes.reduce((a, b) => a + b, 0) / roes.length : 0,
        avgRoic: roics.length ? roics.reduce((a, b) => a + b, 0) / roics.length : 0,
      };
    } else {
      const vacancies = points.map(p => p.vacancy).filter(validNumber);
      const capRates = points.map(p => p.capRate).filter(validNumber);
      specificStats = {
        avgVacancy: vacancies.length ? vacancies.reduce((a, b) => a + b, 0) / vacancies.length : 0,
        maxVacancy: vacancies.length ? Math.max(...vacancies) : 0,
        avgCapRate: capRates.length ? capRates.reduce((a, b) => a + b, 0) / capRates.length : 0,
      };
    }

    return {
      ticker,
      pointsCount: points.length,
      priceChange: percentChange(firstPrice?.price, lastPrice?.price),
      priceMinPoint,
      priceMaxPoint,
      dyMaxPoint,
      avgDy,
      avgPvp,
      avgScore,
      ...specificStats
    };
  }

  function renderInsights(primaryPoints) {
    const card = $('#insightsCard');
    const primaryStats = getPeriodStats(state.ticker, state.type);
    if (!primaryStats) {
      card.style.display = 'none';
      return;
    }

    const hasCompare = state.compare && data.series[state.type][state.compare];
    const compareStats = hasCompare ? getPeriodStats(state.compare, state.type) : null;

    if (!hasCompare) {
      let specificHTML = '';
      if (state.type === 'stock') {
        specificHTML = `
          <div class="insight-block">
            <span class="insight-label">Rentabilidade Contábil Média</span>
            <span class="insight-value">ROE: ${primaryStats.avgRoe.toFixed(1)}% · ROIC: ${primaryStats.avgRoic.toFixed(1)}%</span>
            <span class="insight-detail">Média de eficiência e retorno sobre capital investido no período.</span>
          </div>
        `;
      } else {
        specificHTML = `
          <div class="insight-block">
            <span class="insight-label">Vacância e Retorno Imobiliário</span>
            <span class="insight-value">Vacância Média: ${primaryStats.avgVacancy.toFixed(1)}%</span>
            <span class="insight-detail">Pico de vacância física: <strong>${primaryStats.maxVacancy.toFixed(1)}%</strong> · Cap Rate Médio: <strong>${primaryStats.avgCapRate.toFixed(1)}%</strong></span>
          </div>
        `;
      }

      card.innerHTML = `
        <h3 class="insights-title">💡 Insights Históricos do Período</h3>
        <div class="insights-grid">
          <div class="insight-block">
            <span class="insight-label">Comportamento de Preço</span>
            <span class="insight-value">${signed(primaryStats.priceChange)} no período</span>
            <span class="insight-detail">Mín: <strong>R$ ${formatValue(state.type, 'price', primaryStats.priceMinPoint?.price)}</strong> (em ${formatDate(primaryStats.priceMinPoint?.date)})<br>Máx: <strong>R$ ${formatValue(state.type, 'price', primaryStats.priceMaxPoint?.price)}</strong> (em ${formatDate(primaryStats.priceMaxPoint?.date)})</span>
          </div>
          <div class="insight-block">
            <span class="insight-label">Retorno de Dividendos (DY)</span>
            <span class="insight-value">Yield Médio: ${primaryStats.avgDy.toFixed(2)}%</span>
            <span class="insight-detail">Pico de Yield: <strong>${formatValue(state.type, 'dy', primaryStats.dyMaxPoint?.dy)}</strong> (em ${formatDate(primaryStats.dyMaxPoint?.date)})</span>
          </div>
          <div class="insight-block">
            <span class="insight-label">Fundamentos (Score & Múltiplos)</span>
            <span class="insight-value">Score Médio: ${primaryStats.avgScore.toFixed(1)} / P/VP Médio: ${primaryStats.avgPvp.toFixed(2)}x</span>
            <span class="insight-detail">Demonstra a estabilidade patrimonial e de nota no período.</span>
          </div>
          ${specificHTML}
        </div>
      `;
    } else {
      const compareRow = (label, pVal, cVal, formatter, lowerIsBetter = false) => {
        let winnerHTML = '';
        if (pVal !== null && cVal !== null) {
          const diff = pVal - cVal;
          const pWins = lowerIsBetter ? diff < 0 : diff > 0;
          const isDraw = Math.abs(diff) < 0.001;
          if (isDraw) {
            winnerHTML = `<span class="winner-badge draw">Empate</span>`;
          } else if (pWins) {
            winnerHTML = `<span class="winner-badge primary">${escapeHTML(state.ticker)} (+${Math.abs(diff).toFixed(1)}${label.includes('%') ? '%' : ''})</span>`;
          } else {
            winnerHTML = `<span class="winner-badge compare">${escapeHTML(state.compare)} (+${Math.abs(diff).toFixed(1)}${label.includes('%') ? '%' : ''})</span>`;
          }
        }
        return `
          <tr>
            <td><strong>${label}</strong></td>
            <td style="color: var(--accent); font-weight: 750;">${formatter(pVal)}</td>
            <td style="color: var(--blue); font-weight: 750;">${formatter(cVal)}</td>
            <td>${winnerHTML}</td>
          </tr>
        `;
      };

      let specificRows = '';
      if (state.type === 'stock') {
        specificRows = `
          ${compareRow('ROE Médio', primaryStats.avgRoe, compareStats.avgRoe, v => `${v.toFixed(1)}%`)}
          ${compareRow('ROIC Médio', primaryStats.avgRoic, compareStats.avgRoic, v => `${v.toFixed(1)}%`)}
        `;
      } else {
        specificRows = `
          ${compareRow('Vacância Média', primaryStats.avgVacancy, compareStats.avgVacancy, v => `${v.toFixed(1)}%`, true)}
          ${compareRow('Cap Rate Médio', primaryStats.avgCapRate, compareStats.avgCapRate, v => `${v.toFixed(1)}%`)}
        `;
      }

      card.innerHTML = `
        <h3 class="insights-title">📊 Comparativo Médio do Período</h3>
        <div class="insights-table-wrap">
          <table class="insights-table">
            <thead>
              <tr>
                <th>Indicador (Média do Período)</th>
                <th style="color: var(--accent);">${escapeHTML(state.ticker)}</th>
                <th style="color: var(--blue);">${escapeHTML(state.compare)}</th>
                <th>Destaque</th>
              </tr>
            </thead>
            <tbody>
              ${compareRow('Retorno Acumulado', primaryStats.priceChange, compareStats.priceChange, v => signed(v))}
              ${compareRow('Dividend Yield Médio', primaryStats.avgDy, compareStats.avgDy, v => `${v.toFixed(2)}%`)}
              ${compareRow('Score de Fundamentos', primaryStats.avgScore, compareStats.avgScore, v => v.toFixed(1))}
              ${compareRow('P/VP Médio', primaryStats.avgPvp, compareStats.avgPvp, v => `${v.toFixed(2)}x`, true)}
              ${specificRows}
            </tbody>
          </table>
        </div>
      `;
    }
    card.style.display = 'flex';
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
    let economy = data.economy.map(([dateIndex, selic, dollar]) => ({ dateIndex, date: data.dates[dateIndex], selic, dollar }));
    if (state.mode === 'local') {
      economy = economy.filter(point => point.date >= '2026-03-13');
    }
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

  function downloadSimple() {
    const points = decodeSeries(state.type, state.ticker);
    const fields = data.fields[state.type];
    const rows = [['date', ...fields], ...points.map(point => [point.date, ...fields.map(field => point[field] ?? '')])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.ticker}-historico.csv`; link.click(); URL.revokeObjectURL(link.href);
    showToast(`Série de ${state.ticker} exportada.`);
  }

  function downloadFullTemporal() {
    const originalMode = state.mode;
    state.mode = 'extended';
    const points = decodeSeries(state.type, state.ticker);
    state.mode = originalMode;

    const fields = data.fields[state.type];
    const rows = [['date', ...fields], ...points.map(point => [point.date, ...fields.map(field => point[field] ?? '')])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.ticker}-historico-completo.csv`; link.click(); URL.revokeObjectURL(link.href);
    showToast(`Série completa de ${state.ticker} exportada.`);
  }

  function downloadRichReport() {
    const primaryStats = getPeriodStats(state.ticker, state.type);
    const primaryBuy = getBuyMomentData(state.ticker, state.type);
    if (!primaryStats || !primaryBuy) return;

    const hasCompare = state.compare && data.series[state.type][state.compare];
    const compareStats = hasCompare ? getPeriodStats(state.compare, state.type) : null;
    const compareBuy = hasCompare ? getBuyMomentData(state.compare, state.type) : null;

    const csvLines = [];
    csvLines.push(`# B3 SCREENER - RELATÓRIO ANALÍTICO HISTÓRICO`);
    csvLines.push(`# Gerado em: ${new Date().toLocaleDateString('pt-BR')}`);
    csvLines.push(`# Período análise: ${formatDate(primaryStats.priceMinPoint?.date)} a ${formatDate(primaryStats.priceMaxPoint?.date)}`);
    csvLines.push(`#`);

    csvLines.push(`# === AVALIAÇÃO DE MOMENTO DE COMPRA ===`);
    if (hasCompare) {
      let verdict = 'Empate';
      if (primaryBuy.score > compareBuy.score) {
        verdict = `${state.ticker} é a melhor opção`;
      } else if (compareBuy.score > primaryBuy.score) {
        verdict = `${state.compare} é a melhor option`;
      }
      csvLines.push(`# Veredito comparativo: ${verdict}`);
      csvLines.push(`# Ativo;Classificação;Score Atratividade;Preço Atual;Score Fundamentos;P/VP Atual;Dividend Yield`);
      
      const formatBuyRow = (buy) => {
        const pvpStr = validNumber(buy.currentPvp) ? `${buy.currentPvp.toFixed(2)}x` : 'N/D';
        const dyStr = validNumber(buy.currentDy) ? `${buy.currentDy.toFixed(2)}%` : 'N/D';
        const priceStr = validNumber(buy.currentPrice) ? `R$ ${buy.currentPrice.toFixed(2)}` : 'N/D';
        return `# ${buy.ticker};${buy.statusLabel};${buy.score}/100;${priceStr};${buy.currentScore};${pvpStr};${dyStr}`;
      };

      csvLines.push(formatBuyRow(primaryBuy));
      csvLines.push(formatBuyRow(compareBuy));
    } else {
      csvLines.push(`# Ativo: ${state.ticker}`);
      csvLines.push(`# Classificação: ${primaryBuy.statusLabel}`);
      csvLines.push(`# Score de Atratividade: ${primaryBuy.score}/100`);
      csvLines.push(`# Preço Atual: R$ ${(primaryBuy.currentPrice ?? 0).toFixed(2)}`);
      csvLines.push(`# Score de Fundamentos: ${primaryBuy.currentScore}`);
      csvLines.push(`# P/VP Atual: ${validNumber(primaryBuy.currentPvp) ? primaryBuy.currentPvp.toFixed(2) + 'x' : 'N/D'}`);
      csvLines.push(`# Dividend Yield Atual: ${validNumber(primaryBuy.currentDy) ? primaryBuy.currentDy.toFixed(2) + '%' : 'N/D'}`);
      primaryBuy.reasons.forEach(detail => {
        const cleanDetail = detail.replace(/<\/?[^>]+(>|$)/g, "");
        csvLines.push(`# - ${cleanDetail}`);
      });
    }
    csvLines.push(`#`);

    csvLines.push(`# === INSIGHTS E MÉDIAS DO PERÍODO ===`);
    const pushRow = (label, pVal, cVal, suffix = '', lowerIsBetter = false) => {
      if (!hasCompare) {
        csvLines.push(`# ${label}: ${pVal.toFixed(2)}${suffix}`);
      } else {
        const diff = pVal - cVal;
        const pWins = lowerIsBetter ? diff < 0 : diff > 0;
        const isDraw = Math.abs(diff) < 0.001;
        const winner = isDraw ? 'Empate' : (pWins ? state.ticker : state.compare);
        csvLines.push(`# ${label};${pVal.toFixed(2)}${suffix};${cVal.toFixed(2)}${suffix};Destaque: ${winner} (dif: ${Math.abs(diff).toFixed(2)}${suffix})`);
      }
    };

    if (hasCompare) {
      csvLines.push(`# Indicador;${state.ticker};${state.compare};Destaque`);
    }

    pushRow('Retorno Acumulado', primaryStats.priceChange, compareStats?.priceChange || 0, '%');
    pushRow('Dividend Yield Médio', primaryStats.avgDy, compareStats?.avgDy || 0, '%');
    pushRow('Score de Fundamentos Médio', primaryStats.avgScore, compareStats?.avgScore || 0);
    pushRow('P/VP Médio', primaryStats.avgPvp, compareStats?.avgPvp || 0, 'x', true);

    if (state.type === 'stock') {
      pushRow('ROE Médio', primaryStats.avgRoe, compareStats?.avgRoe || 0, '%');
      pushRow('ROIC Médio', primaryStats.avgRoic, compareStats?.avgRoic || 0, '%');
    } else {
      pushRow('Vacância Média', primaryStats.avgVacancy, compareStats?.avgVacancy || 0, '%', true);
      pushRow('Cap Rate Médio', primaryStats.avgCapRate, compareStats?.avgCapRate || 0, '%');
    }
    csvLines.push(`#`);

    csvLines.push(`# === SÉRIE TEMPORAL DETALHADA ===`);
    const primaryPoints = filterPeriod(decodeSeries(state.type, state.ticker));
    const comparePoints = hasCompare ? filterPeriod(decodeSeries(state.type, state.compare)) : [];
    
    const fields = data.fields[state.type];
    
    if (hasCompare) {
      const headers = ['Data'];
      fields.forEach(f => headers.push(`${state.ticker}_${f}`));
      fields.forEach(f => headers.push(`${state.compare}_${f}`));
      csvLines.push(headers.join(';'));

      primaryPoints.forEach(pPoint => {
        const cPoint = comparePoints.find(cp => cp.dateIndex === pPoint.dateIndex) || {};
        const row = [pPoint.date];
        fields.forEach(f => row.push(pPoint[f] ?? ''));
        fields.forEach(f => row.push(cPoint[f] ?? ''));
        csvLines.push(row.map(value => `${String(value).replace(/;/g, ',')}`).join(';'));
      });
    } else {
      csvLines.push(['Data', ...fields].join(';'));
      primaryPoints.forEach(pPoint => {
        const row = [pPoint.date];
        fields.forEach(f => row.push(pPoint[f] ?? ''));
        csvLines.push(row.map(value => `${String(value).replace(/;/g, ',')}`).join(';'));
      });
    }

    const csvContent = csvLines.join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(blob); 
    link.download = `${state.ticker}${hasCompare ? `-vs-${state.compare}` : ''}-analise-completa.csv`; 
    link.click(); 
    URL.revokeObjectURL(link.href);
    showToast(`Relatório analítico completo exportado.`);
  }

  function bindEvents() {
    document.querySelectorAll('#assetType button').forEach(button => button.addEventListener('click', () => {
      state.type = button.dataset.type; state.ticker = Object.keys(data.series[state.type]).sort((a, b) => data.series[state.type][b].d.length - data.series[state.type][a].d.length)[0]; state.compare = ''; state.metric = 'price'; update();
    }));
    document.querySelectorAll('#historyModeToggle button').forEach(button => button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      update();
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
    
    // Export Dropdown events
    const exportDropdown = $('#exportDropdown');
    const toggleBtn = exportDropdown.querySelector('.dropdown-toggle');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      exportDropdown.classList.remove('show');
    });

    $('#downloadCsv').addEventListener('click', downloadSimple);
    $('#downloadCsvFull').addEventListener('click', downloadFullTemporal);
    $('#exportRich').addEventListener('click', downloadRichReport);

    const carouselWrap = $('#newsCarouselWrap');
    $('#newsPrevBtn').addEventListener('click', () => {
      carouselWrap.scrollBy({ left: -260 * 2, behavior: 'smooth' });
    });
    $('#newsNextBtn').addEventListener('click', () => {
      carouselWrap.scrollBy({ left: 260 * 2, behavior: 'smooth' });
    });

    $('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('b3-history-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); });
    $('#toggleRejected').addEventListener('click', event => { const list = $('#rejectedList'); list.hidden = !list.hidden; event.currentTarget.setAttribute('aria-expanded', String(!list.hidden)); event.currentTarget.textContent = list.hidden ? 'Ver snapshots rejeitados' : 'Ocultar snapshots rejeitados'; });

    // Simulator Modal events
    $('#openSimulatorBtn').addEventListener('click', openSimulator);
    $('#closeSimulatorBtn').addEventListener('click', closeSimulator);
    $('#closeSimulatorFooterBtn').addEventListener('click', closeSimulator);
    $('#simulatorModal').addEventListener('click', (e) => {
      if (e.target === $('#simulatorModal')) closeSimulator();
    });

    $('#simInitialCapital').addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (val > 0) { simState.initialCapital = val; updateSimulator(); }
    });
    $('#simPeriodSelect').addEventListener('change', (e) => {
      simState.period = e.target.value; updateSimulator();
    });
    $('#simReinvestToggle').addEventListener('change', (e) => {
      simState.reinvest = e.target.checked; updateSimulator();
    });
    $('#simSmartAllocToggle').addEventListener('change', (e) => {
      simState.smartAlloc = e.target.checked;
      if (simState.smartAlloc) {
        calculateSmartWeights();
        showToast('Alocação Inteligente ativada (Otimização Quantitativa).');
      } else {
        rebalanceSimWeightsEqually();
        showToast('Pesos rebalanceados igualmente.');
      }
      updateSimulator();
    });
    $('#simAddAssetBtn').addEventListener('click', () => {
      const input = $('#simAssetInput');
      const val = input.value.trim();
      if (!val) return;
      addAssetToSimulator(val);
      input.value = '';
    });
    $('#simAssetInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) { addAssetToSimulator(val); e.target.value = ''; }
      }
    });

    // Simulator Export Dropdown
    const simExportDropdown = $('#simExportDropdown');
    const simExportToggleBtn = simExportDropdown.querySelector('.dropdown-toggle');
    simExportToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      simExportDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      simExportDropdown.classList.remove('show');
    });
    $('#downloadSimCsv').addEventListener('click', downloadSimCsv);
    $('#downloadSimJson').addEventListener('click', downloadSimJson);
  }

  // ==========================================
  // MULTI-ASSET SIMULATOR & BACKTEST ENGINE
  // ==========================================

  const simState = {
    initialCapital: 1000,
    period: 'all',
    reinvest: true,
    smartAlloc: false,
    items: []
  };

  let cachedLastBacktestResult = null;

  function openSimulator() {
    if (simState.items.length === 0) {
      simState.items = [
        { ticker: state.ticker, type: state.type, weight: state.compare ? 50 : 100 }
      ];
      if (state.compare && data.series[state.type][state.compare]) {
        simState.items.push({ ticker: state.compare, type: state.type, weight: 50 });
      }
    }
    populateSimOptions();
    $('#simulatorModal').hidden = false;
    document.body.style.overflow = 'hidden';
    updateSimulator();
  }

  function closeSimulator() {
    $('#simulatorModal').hidden = true;
    document.body.style.overflow = '';
  }

  function populateSimOptions() {
    const globalAssets = [
      ...Object.keys(data.series.stock).map(ticker => ({ ticker, type: 'stock', label: 'Ação' })),
      ...Object.keys(data.series.fund).map(ticker => ({ ticker, type: 'fund', label: 'Fundo' }))
    ].sort((a, b) => a.ticker.localeCompare(b.ticker));
    
    $('#simAssetOptions').innerHTML = globalAssets.map(asset => `<option value="${escapeHTML(asset.ticker)}" label="${asset.label}"></option>`).join('');
  }

  function addAssetToSimulator(rawInput) {
    if (!rawInput) return;
    const tokens = String(rawInput)
      .split(/[,;\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    if (tokens.length === 0) return;

    let addedCount = 0;
    const notFound = [];
    const alreadyExists = [];

    tokens.forEach(ticker => {
      const type = data.series.stock[ticker] ? 'stock' : data.series.fund[ticker] ? 'fund' : null;
      if (!type) {
        notFound.push(ticker);
        return;
      }
      if (simState.items.some(item => item.ticker === ticker)) {
        alreadyExists.push(ticker);
        return;
      }
      simState.items.push({ ticker, type, weight: 0 });
      addedCount++;
    });

    if (addedCount > 0) {
      rebalanceSimWeights();
      updateSimulator();
      if (tokens.length === 1) {
        showToast(`${tokens[0]} adicionado à carteira.`);
      } else {
        showToast(`${addedCount} ativo(s) adicionado(s) à carteira.`);
      }
    } else if (notFound.length > 0) {
      showToast(`Ticker(s) não encontrado(s): ${notFound.join(', ')}`);
    } else if (alreadyExists.length > 0) {
      showToast(`Ticker(s) já na carteira: ${alreadyExists.join(', ')}`);
    }
  }

  function removeAssetFromSimulator(ticker) {
    if (simState.items.length <= 1) {
      showToast('A carteira precisa ter ao menos 1 ativo.');
      return;
    }
    simState.items = simState.items.filter(item => item.ticker !== ticker);
    rebalanceSimWeights();
    updateSimulator();
  }

  function calculateSmartWeights() {
    if (simState.items.length === 0) return;

    const itemScores = simState.items.map(item => {
      const allPoints = decodeSeries(item.type, item.ticker);
      const points = filterPeriod(allPoints, simState.period);
      const latest = points.at(-1) || {};
      const first = points.find(p => validNumber(p.price));
      const last = [...points].reverse().find(p => validNumber(p.price));

      // 1. Métrica: Score de Fundamentos (0 a 10)
      const scoreVal = validNumber(latest.score) ? Math.max(0.1, latest.score / 10) : 0.5;

      // 2. Métrica: Valuation / Desconto de Margem
      let valuationFactor = 1.0;
      if (item.type === 'stock') {
        const graham = validNumber(latest.graham) ? latest.graham : null;
        const bazin = validNumber(latest.bazin) ? latest.bazin : null;
        const curPrice = last?.price || 1;
        if (graham && curPrice < graham && bazin && curPrice < bazin) {
          valuationFactor = 1.35;
        } else if ((graham && curPrice < graham) || (bazin && curPrice < bazin)) {
          valuationFactor = 1.15;
        } else if (graham && curPrice > graham * 1.25) {
          valuationFactor = 0.75;
        }
      } else {
        const pvp = validNumber(latest.pvp) ? latest.pvp : 1;
        if (pvp < 1.0 && pvp > 0.6) {
          valuationFactor = 1.0 + (1.0 - pvp) * 1.5;
        } else if (pvp > 1.08) {
          valuationFactor = 0.70;
        }
      }

      // 3. Métrica: Yield de Proventos (DY %)
      const dyVal = validNumber(latest.dy) ? latest.dy : 0;
      const dyFactor = dyVal > 0 ? Math.min(1.4, Math.max(0.6, dyVal / 7.5)) : 0.6;

      // 4. Métrica: Estabilidade de Risco / Retorno no Período
      const pChange = percentChange(first?.price, last?.price);
      const returnFactor = pChange !== null ? (pChange >= 0 ? 1.15 : 0.85) : 1.0;

      const composite = scoreVal * valuationFactor * dyFactor * returnFactor;
      return { ticker: item.ticker, composite };
    });

    const totalComposite = itemScores.reduce((sum, s) => sum + s.composite, 0);
    if (totalComposite <= 0) {
      rebalanceSimWeightsEqually();
      return;
    }

    let rawWeights = simState.items.map(item => {
      const match = itemScores.find(s => s.ticker === item.ticker);
      return {
        ticker: item.ticker,
        weight: Math.round((match.composite / totalComposite) * 100)
      };
    });

    const minW = simState.items.length > 1 ? 10 : 100;
    const maxW = simState.items.length > 1 ? 65 : 100;

    let clampedWeights = rawWeights.map(w => ({
      ticker: w.ticker,
      weight: Math.max(minW, Math.min(maxW, w.weight))
    }));

    const clampedTotal = clampedWeights.reduce((s, w) => s + w.weight, 0);
    clampedWeights.forEach(w => {
      w.weight = Math.round((w.weight / clampedTotal) * 100);
    });

    const finalSum = clampedWeights.reduce((s, w) => s + w.weight, 0);
    if (finalSum !== 100 && clampedWeights.length > 0) {
      clampedWeights[0].weight += (100 - finalSum);
    }

    clampedWeights.forEach(cw => {
      const item = simState.items.find(i => i.ticker === cw.ticker);
      if (item) item.weight = cw.weight;
    });
  }

  function rebalanceSimWeights() {
    if (simState.smartAlloc) {
      calculateSmartWeights();
    } else {
      rebalanceSimWeightsEqually();
    }
  }

  function rebalanceSimWeightsEqually() {
    const n = simState.items.length;
    if (n === 0) return;
    const equalWeight = Math.floor(100 / n);
    let remainder = 100 - (equalWeight * n);
    simState.items.forEach((item, index) => {
      item.weight = equalWeight + (index === 0 ? remainder : 0);
    });
  }

  function runSimBacktest() {
    if (simState.items.length === 0) return null;

    // Normaliza pesos
    const totalWeight = simState.items.reduce((a, b) => a + (b.weight || 0), 0);
    const normalizedItems = simState.items.map(item => ({
      ...item,
      normalizedWeight: totalWeight > 0 ? (item.weight || 0) / totalWeight : 1 / simState.items.length
    }));

    // Carrega dados de cada ativo
    const assetSeries = normalizedItems.map(item => {
      const allPoints = decodeSeries(item.type, item.ticker);
      const points = filterPeriod(allPoints, simState.period);
      return { ...item, allPoints, points };
    }).filter(a => a.points.length > 0);

    if (assetSeries.length === 0) return null;

    // Encontra intersecção de datas de pregão disponíveis
    const dateIndexes = assetSeries[0].points.map(p => p.dateIndex);
    const validDateIndexes = dateIndexes.filter(dIdx => {
      return assetSeries.every(a => a.points.some(p => p.dateIndex === dIdx));
    });

    if (validDateIndexes.length < 2) return null;

    const initialCapital = simState.initialCapital;

    // Inicializa alocação por ativo
    const assetStats = assetSeries.map(a => {
      const firstPoint = a.points.find(p => p.dateIndex === validDateIndexes[0]);
      const lastPoint = [...a.points].reverse().find(p => p.dateIndex === validDateIndexes.at(-1));
      
      const allocatedCapital = initialCapital * a.normalizedWeight;
      const startPrice = firstPoint?.price || 1;
      const endPrice = lastPoint?.price || startPrice;
      const initialShares = allocatedCapital / startPrice;

      // Calcula dividendos totais pagos no período
      let totalDividendsReceived = 0;
      let currentShares = initialShares;
      let accumCashFromDivs = 0;

      // Percorre pontos temporais para simular proventos e reinvestimento
      a.points.forEach((point, idx) => {
        if (!validNumber(point.dy) || point.dy <= 0 || !validNumber(point.price)) return;
        // DY anualizado no snapshot -> estima rendimento mensal aproximado / frequência
        // Proventos exatos baseados na variação de yield entre snapshots
        if (idx > 0) {
          const prevPoint = a.points[idx - 1];
          // Se houve evento de provento registrado no snapshot
          if (validNumber(prevPoint.price) && point.dy > prevPoint.dy && point.date !== prevPoint.date) {
            const divPerShare = (point.price * (point.dy / 100)) / 12; // Estimativa conservadora por snapshot
            const divAmount = currentShares * divPerShare;
            totalDividendsReceived += divAmount;

            if (simState.reinvest && point.price > 0) {
              const extraShares = divAmount / point.price;
              currentShares += extraShares;
            } else {
              accumCashFromDivs += divAmount;
            }
          }
        }
      });

      const finalAssetValue = (currentShares * endPrice) + accumCashFromDivs;
      const assetReturn = ((finalAssetValue - allocatedCapital) / allocatedCapital) * 100;

      return {
        ticker: a.ticker,
        type: a.type,
        weightPct: a.normalizedWeight * 100,
        allocatedCapital,
        startPrice,
        endPrice,
        initialShares,
        finalShares: currentShares,
        totalDividendsReceived,
        finalAssetValue,
        assetReturn,
        category: a.points.at(-1)?.category || '',
        score: a.points.at(-1)?.score || 0,
        pvp: a.points.at(-1)?.pvp || 1
      };
    });

    // Série evolutiva diária da Carteira e do CDI
    let selicPoints = data.economy.map(([dateIndex, selic]) => ({ dateIndex, date: data.dates[dateIndex], selic }));
    if (state.mode === 'local') {
      selicPoints = selicPoints.filter(p => p.date >= '2026-03-13');
    }
    selicPoints = filterPeriod(selicPoints, simState.period);

    let accumCdiFactor = 1.0;
    let prevCdiDateIndex = null;

    const portfolioTimeSeries = validDateIndexes.map(dateIdx => {
      const dateStr = data.dates[dateIdx];
      
      // Atualiza rendimento acumulado do CDI
      const selicObj = selicPoints.find(s => s.dateIndex === dateIdx);
      if (selicObj && validNumber(selicObj.selic)) {
        if (prevCdiDateIndex !== null) {
          const dailySelicRate = Math.pow(1 + (selicObj.selic / 100), 1 / 252) - 1;
          accumCdiFactor *= (1 + dailySelicRate);
        }
        prevCdiDateIndex = dateIdx;
      }

      let totalValAtDate = 0;
      assetStats.forEach(ast => {
        const seriesObj = assetSeries.find(s => s.ticker === ast.ticker);
        const pointAtDate = seriesObj?.points.find(p => p.dateIndex === dateIdx);
        const priceAtDate = pointAtDate?.price || ast.startPrice;
        totalValAtDate += ast.finalShares * priceAtDate;
      });

      const cdiValAtDate = initialCapital * accumCdiFactor;

      return {
        dateIndex: dateIdx,
        date: dateStr,
        portfolioValue: totalValAtDate,
        portfolioReturnPct: ((totalValAtDate - initialCapital) / initialCapital) * 100,
        cdiValue: cdiValAtDate,
        cdiReturnPct: ((cdiValAtDate - initialCapital) / initialCapital) * 100
      };
    });

    const finalPortfolioVal = portfolioTimeSeries.at(-1)?.portfolioValue || initialCapital;
    const finalCdiVal = portfolioTimeSeries.at(-1)?.cdiValue || initialCapital;
    const totalDividends = assetStats.reduce((sum, a) => sum + a.totalDividendsReceived, 0);
    const portfolioReturnPct = ((finalPortfolioVal - initialCapital) / initialCapital) * 100;
    const cdiReturnPct = ((finalCdiVal - initialCapital) / initialCapital) * 100;
    const alphaVsCdi = portfolioReturnPct - cdiReturnPct;
    const alphaAmount = finalPortfolioVal - finalCdiVal;

    const result = {
      initialCapital,
      period: simState.period,
      reinvest: simState.reinvest,
      startDate: data.dates[validDateIndexes[0]],
      endDate: data.dates[validDateIndexes.at(-1)],
      finalPortfolioVal,
      finalCdiVal,
      totalDividends,
      portfolioReturnPct,
      cdiReturnPct,
      alphaVsCdi,
      alphaAmount,
      assetStats,
      portfolioTimeSeries
    };

    cachedLastBacktestResult = result;
    return result;
  }

  function updateSimulator() {
    const res = runSimBacktest();
    renderSimTable();
    if (!res) {
      $('#simKpiGrid').innerHTML = '<div class="stat-card">Sem dados suficientes para simulação no período selecionado.</div>';
      $('#simMainChart').innerHTML = '';
      $('#simInsightsSection').innerHTML = '';
      return;
    }
    renderSimKPIs(res);
    renderSimChart(res);
    renderSimInsights(res);
  }

  function renderSimTable() {
    const tbody = $('#simAssetsTbody');
    const res = cachedLastBacktestResult;

    tbody.innerHTML = simState.items.map(item => {
      const stat = res?.assetStats.find(a => a.ticker === item.ticker);
      return `
        <tr>
          <td><strong>${escapeHTML(item.ticker)}</strong></td>
          <td class="center"><span class="news-tag ${item.type === 'stock' ? 'mercado' : 'proventos'}">${item.type === 'stock' ? 'Ação' : 'FII'}</span></td>
          <td class="center"><span class="sim-weight-cell"><input type="number" class="sim-weight-input" data-ticker="${escapeHTML(item.ticker)}" value="${Math.round(item.weight)}" min="0" max="100">%</span></td>
          <td class="num">R$ ${stat ? stat.allocatedCapital.toFixed(2) : '—'}</td>
          <td class="num">${stat ? stat.initialShares.toFixed(2) : '—'}</td>
          <td class="num">R$ ${stat ? stat.startPrice.toFixed(2) : '—'}</td>
          <td class="num">R$ ${stat ? stat.endPrice.toFixed(2) : '—'}</td>
          <td class="num" style="color: var(--positive); font-weight: 750;">R$ ${stat ? stat.totalDividendsReceived.toFixed(2) : '—'}</td>
          <td class="num" style="font-weight: 850;">R$ ${stat ? stat.finalAssetValue.toFixed(2) : '—'}</td>
          <td class="center"><button type="button" class="sim-remove-btn" data-ticker="${escapeHTML(item.ticker)}">✕</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.sim-weight-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const ticker = e.target.dataset.ticker;
        const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
        const item = simState.items.find(i => i.ticker === ticker);
        if (item) {
          item.weight = val;
          updateSimulator();
        }
      });
    });

    tbody.querySelectorAll('.sim-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        removeAssetFromSimulator(e.target.dataset.ticker);
      });
    });
  }

  function renderSimKPIs(res) {
    const grid = $('#simKpiGrid');
    const isPos = res.alphaVsCdi >= 0;

    grid.innerHTML = `
      <article class="stat-card">
        <span class="stat-label">Patrimônio Final</span>
        <strong class="stat-value" style="color: var(--accent);">R$ ${res.finalPortfolioVal.toFixed(2)}</strong>
        <span class="stat-detail">Retorno: ${signed(res.portfolioReturnPct)}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Proventos Recebidos</span>
        <strong class="stat-value" style="color: var(--positive);">R$ ${res.totalDividends.toFixed(2)}</strong>
        <span class="stat-detail">${res.reinvest ? 'Reinvestimento Automático (Bola de Neve)' : 'Acumulado em Caixa'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Benchmark CDI</span>
        <strong class="stat-value" style="color: var(--blue);">R$ ${res.finalCdiVal.toFixed(2)}</strong>
        <span class="stat-detail">Rendimento CDI: +${res.cdiReturnPct.toFixed(2)}%</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Desempenho Relativo (Alpha)</span>
        <strong class="stat-value ${isPos ? 'positive' : 'negative'}">${signed(res.alphaVsCdi)}</strong>
        <span class="stat-detail">${isPos ? 'Ganho real sobre o CDI' : 'Abaixo da renda fixa'}: R$ ${res.alphaAmount.toFixed(2)}</span>
      </article>
    `;
  }

  function renderSimChart(res) {
    const container = $('#simMainChart');
    const series = res.portfolioTimeSeries;
    if (!series || series.length < 2) {
      container.innerHTML = '<div class="chart-empty">Dados insuficientes para renderizar a curva da carteira.</div>';
      return;
    }

    const W = 900, H = 300, P = { l: 65, r: 20, t: 18, b: 38 };
    const dateMin = Math.min(...series.map(s => s.dateIndex));
    const dateMax = Math.max(...series.map(s => s.dateIndex));

    const allVals = series.flatMap(s => [s.portfolioValue, s.cdiValue]);
    let min = Math.min(...allVals), max = Math.max(...allVals);
    if (min === max) { min -= 10; max += 10; }
    const pad = (max - min) * 0.1;
    min -= pad; max += pad;

    const x = dateIndex => P.l + ((dateIndex - dateMin) / Math.max(1, dateMax - dateMin)) * (W - P.l - P.r);
    const y = val => P.t + ((max - val) / (max - min)) * (H - P.t - P.b);

    const pathPort = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.dateIndex).toFixed(1)},${y(s.portfolioValue).toFixed(1)}`).join(' ');
    const pathCdi = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.dateIndex).toFixed(1)},${y(s.cdiValue).toFixed(1)}`).join(' ');

    $('#simChartLegend').innerHTML = `
      <span class="legend-item"><i class="legend-dot"></i><span>Carteira: <strong>R$ ${res.finalPortfolioVal.toFixed(2)} (${signed(res.portfolioReturnPct)})</strong></span></span>
      <span class="legend-item"><i class="legend-dot secondary"></i><span>CDI: <strong>R$ ${res.finalCdiVal.toFixed(2)} (+${res.cdiReturnPct.toFixed(2)}%)</strong></span></span>
    `;

    const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index / 4));
    const dateTicks = Array.from({ length: 4 }, (_, index) => Math.round(dateMin + ((dateMax - dateMin) * index / 3)));

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${ticks.map(value => `<line class="chart-grid" x1="${P.l}" x2="${W - P.r}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="${P.l - 8}" y="${y(value) + 4}" text-anchor="end">R$ ${Math.round(value)}</text>`).join('')}
      ${dateTicks.map(index => {
        const d = data.dates[index];
        if (!d) return '';
        return `<text class="chart-axis-label" x="${x(index)}" y="${H - 10}" text-anchor="middle">${escapeHTML(d.slice(5).replace('-', '/'))}</text>`;
      }).join('')}
      <path class="chart-line" d="${pathPort}"/>
      <path class="chart-line secondary" d="${pathCdi}"/>
    </svg>`;
  }

  function renderSimInsights(res) {
    const card = $('#simInsightsSection');
    const insights = [];

    // 1. Bola de Neve / Compounding Check
    const cheapestAsset = res.assetStats.reduce((best, a) => (!best || a.endPrice < best.endPrice) ? a : best, null);
    if (cheapestAsset) {
      const canBuyUnits = Math.floor(res.totalDividends / cheapestAsset.endPrice);
      if (canBuyUnits >= 1) {
        insights.push({
          type: 'success',
          title: '🎉 Ponto de Inflexão Atingido (Bola de Neve)',
          text: `Os proventos acumulados (R$ ${res.totalDividends.toFixed(2)}) já foram suficientes para comprar <strong>${canBuyUnits} nova(s) cota(s) de ${cheapestAsset.ticker}</strong> sem aportes adicionais do seu bolso.`
        });
      } else {
        const needed = cheapestAsset.endPrice - res.totalDividends;
        insights.push({
          type: 'info',
          title: '⏳ Progresso da Bola de Neve',
          text: `Seus proventos cobriram R$ ${res.totalDividends.toFixed(2)}. Faltam <strong>R$ ${needed.toFixed(2)}</strong> em proventos para comprar 1 cota automática de ${cheapestAsset.ticker}.`
        });
      }
    }

    // 2. Análise de Risco & Concentração
    const stockPct = res.assetStats.filter(a => a.type === 'stock').reduce((s, a) => s + a.weightPct, 0);
    const fundPct = res.assetStats.filter(a => a.type === 'fund').reduce((s, a) => s + a.weightPct, 0);

    if (stockPct > 80) {
      insights.push({
        type: 'warning',
        title: '⚠️ Alta Concentração em Ações',
        text: `Sua carteira possui <strong>${stockPct.toFixed(0)}% em Ações</strong>. Considere adicionar Fundos Imobiliários (FIIs) para suavizar a volatilidade e gerar renda mensal mais estável.`
      });
    } else if (fundPct > 80) {
      insights.push({
        type: 'warning',
        title: '⚠️ Alta Concentração em FIIs',
        text: `Sua carteira possui <strong>${fundPct.toFixed(0)}% em FIIs</strong>. Adicionar ações perenes com desconto de valuation pode acelerar o ganho de capital no longo prazo.`
      });
    } else {
      insights.push({
        type: 'success',
        title: '⚖️ Alocação Equilibrada de Classes',
        text: `Sua carteira está bem distribuída entre Ações (${stockPct.toFixed(0)}%) e FIIs (${fundPct.toFixed(0)}%), proporcionando ganho de capital e geração de caixa.`
      });
    }

    // 3. Asset Swap / Sugestão de Otimização
    res.assetStats.forEach(ast => {
      const candidates = Object.keys(data.series[ast.type]);
      let bestSubstitute = null;
      let maxDiff = 0;

      candidates.forEach(candTicker => {
        if (simState.items.some(i => i.ticker === candTicker)) return;
        const candPoints = filterPeriod(decodeSeries(ast.type, candTicker), simState.period);
        if (candPoints.length < 2) return;

        const [cFirst, cLast] = firstLastValid(candPoints, 'price');
        const candReturn = percentChange(cFirst?.price, cLast?.price);
        const candScore = candPoints.at(-1)?.score || 0;

        if (candReturn !== null && candReturn > ast.assetReturn + 8 && candScore >= (ast.score || 0)) {
          const diff = candReturn - ast.assetReturn;
          if (diff > maxDiff) {
            maxDiff = diff;
            bestSubstitute = { ticker: candTicker, candReturn, candScore, diff };
          }
        }
      });

      if (bestSubstitute) {
        insights.push({
          type: 'info',
          title: `🔄 Oportunidade de Substituição: ${ast.ticker}`,
          text: `Trocar <strong>${ast.ticker}</strong> por <strong>${bestSubstitute.ticker}</strong> teria elevado o retorno do ativo em <strong>+${bestSubstitute.diff.toFixed(1)}%</strong> no mesmo período (Score: ${bestSubstitute.candScore.toFixed(1)}).`
        });
      }
    });

    card.innerHTML = `
      <h3 class="sim-insights-title">💡 Diagnósticos & Recomendações Automatizadas</h3>
      ${insights.map(item => `
        <div class="sim-insight-card ${item.type}">
          <strong>${item.title}</strong>
          <div>${item.text}</div>
        </div>
      `).join('')}
    `;
  }

  function downloadSimCsv() {
    const res = cachedLastBacktestResult;
    if (!res) { showToast('Nenhuma simulação disponível para exportar.'); return; }

    const lines = [];
    lines.push(`# B3 SCREENER - PLANILHA DE BACKTEST DE CARTEIRA MULTI-ATIVO`);
    lines.push(`# Data do relatório: ${new Date().toLocaleDateString('pt-BR')}`);
    lines.push(`# Período analisado: ${formatDate(res.startDate)} a ${formatDate(res.endDate)}`);
    lines.push(`#`);

    lines.push(`# === RESUMO DA SIMULAÇÃO ===`);
    lines.push(`Aporte Inicial (R$);${res.initialCapital.toFixed(2)}`);
    lines.push(`Reinvestimento Proventos;${res.reinvest ? 'Sim (Bola de Neve)' : 'Não'}`);
    lines.push(`Patrimonio Final (R$);${res.finalPortfolioVal.toFixed(2)}`);
    lines.push(`Retorno Carteira (%);${res.portfolioReturnPct.toFixed(2)}%`);
    lines.push(`Proventos Recebidos (R$);${res.totalDividends.toFixed(2)}`);
    lines.push(`Patrimonio CDI (R$);${res.finalCdiVal.toFixed(2)}`);
    lines.push(`Rendimento CDI (%);${res.cdiReturnPct.toFixed(2)}%`);
    lines.push(`Diferencial Alpha (%);${res.alphaVsCdi.toFixed(2)}%`);
    lines.push(`#`);

    lines.push(`# === COMPOSIÇÃO DA CARTEIRA E RENTABILIDADE POR ATIVO ===`);
    lines.push(`Ticker;Classe;Peso (%);Aporte Inicial (R$);Cotas Iniciais;Cotas Finais;Preco Inicial (R$);Preco Atual (R$);Proventos Recebidos (R$);Valor Final (R$);Retorno (%);Score`);
    res.assetStats.forEach(a => {
      lines.push(`${a.ticker};${a.type === 'stock' ? 'Acao' : 'FII'};${a.weightPct.toFixed(1)}%;${a.allocatedCapital.toFixed(2)};${a.initialShares.toFixed(2)};${a.finalShares.toFixed(2)};${a.startPrice.toFixed(2)};${a.endPrice.toFixed(2)};${a.totalDividendsReceived.toFixed(2)};${a.finalAssetValue.toFixed(2)};${a.assetReturn.toFixed(2)}%;${a.score.toFixed(1)}`);
    });
    lines.push(`#`);

    lines.push(`# === SÉRIE EVOLUTIVA DIÁRIA DA CARTEIRA VS CDI ===`);
    lines.push(`Data;Valor Carteira (R$);Retorno Carteira (%);Valor CDI (R$);Retorno CDI (%)`);
    res.portfolioTimeSeries.forEach(pt => {
      lines.push(`${pt.date};${pt.portfolioValue.toFixed(2)};${pt.portfolioReturnPct.toFixed(2)}%;${pt.cdiValue.toFixed(2)};${pt.cdiReturnPct.toFixed(2)}%`);
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `backtest-carteira-${res.startDate}-a-${res.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Planilha de Backtest exportada com sucesso.');
  }

  function downloadSimJson() {
    const res = cachedLastBacktestResult;
    if (!res) { showToast('Nenhuma simulação disponível para exportar.'); return; }

    const jsonString = JSON.stringify(res, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `backtest-carteira-${res.startDate}-a-${res.endDate}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Dados JSON da simulação exportados.');
  }

  function update() {
    populateControls(); renderAsset(); renderRankings(); writeQuery();
  }

  if (localStorage.getItem('b3-history-theme') === 'dark') document.body.classList.add('dark');
  readQuery(); renderSummary(); renderQuality(); bindEvents(); update();
})();