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
    $('#assetOptions').innerHTML = tickers.map(ticker => `<option value="${escapeHTML(ticker)}"></option>`).join('');
    $('#assetSearch').value = state.ticker;
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
    $('#assetKind').textContent = state.type === 'stock' ? 'Ação listada' : (latest.fundType || 'Fundo listado');
    $('#assetTitle').textContent = state.ticker;
    $('#assetRange').textContent = points.length ? `${formatDate(points[0].date)} a ${formatDate(points.at(-1).date)} · ${points.length} observações` : 'Sem observações no período';
    $('#assetSignal').textContent = latest.signal || 'SEM SINAL';
    $('#assetCategory').textContent = [latest.category, latest.exposure].filter(Boolean).join(' · ') || 'Sem categoria';
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
    renderMainChart(points);
    renderMiniCharts(points);
    renderTimeline(allPoints);
    renderMacro();
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
    const normalize = Boolean(state.compare);
    const geometry = chartGeometry([
      { ticker: state.ticker, points: primaryPoints, secondary: false },
      ...(state.compare ? [{ ticker: state.compare, points: comparisonPoints, secondary: true }] : [])
    ], state.metric, normalize);
    const metricLabel = metricCatalog[state.type][state.metric][0];
    $('#chartTitle').textContent = normalize ? `${metricLabel} · retorno normalizado` : metricLabel;
    $('#chartEyebrow').textContent = state.period === 'all' ? 'Todo o histórico' : `Últimos ${state.period} dias`;
    $('#chartLegend').innerHTML = `<span class="legend-item"><i class="legend-dot"></i>${escapeHTML(state.ticker)}</span>${state.compare ? `<span class="legend-item"><i class="legend-dot secondary"></i>${escapeHTML(state.compare)}</span>` : ''}`;
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
    hit.addEventListener('pointermove', event => {
      const rect = svg.getBoundingClientRect();
      const svgX = ((event.clientX - rect.left) / rect.width) * W;
      const targetIndex = Math.round(geometry.dateMin + ((svgX - P.l) / (W - P.l - P.r)) * (geometry.dateMax - geometry.dateMin));
      const primary = geometry.prepared[0].values.reduce((best, point) => Math.abs(point.dateIndex - targetIndex) < Math.abs(best.dateIndex - targetIndex) ? point : best, geometry.prepared[0].values[0]);
      crosshair.setAttribute('x1', x(primary.dateIndex)); crosshair.setAttribute('x2', x(primary.dateIndex)); crosshair.setAttribute('visibility', 'visible');
      const rows = geometry.prepared.map(series => {
        const point = series.values.reduce((best, candidate) => Math.abs(candidate.dateIndex - primary.dateIndex) < Math.abs(best.dateIndex - primary.dateIndex) ? candidate : best, series.values[0]);
        return `<div>${escapeHTML(series.ticker)}: <b>${geometry.normalize ? signed(point.chartValue) : escapeHTML(formatValue(state.type, state.metric, point[state.metric]))}</b></div>`;
      }).join('');
      tooltip.innerHTML = `<strong>${formatDate(primary.date)}</strong>${rows}`;
      tooltip.hidden = false; tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`; tooltip.style.top = `${Math.max(10, event.clientY - 70)}px`;
    });
    hit.addEventListener('pointerleave', () => { crosshair.setAttribute('visibility', 'hidden'); tooltip.hidden = true; });
  }

  function sparkline(points, metric) {
    const valid = points.filter(point => validNumber(point[metric]));
    if (valid.length < 2) return '<div class="chart-empty" style="height:70px">Poucos dados</div>';
    const values = valid.map(point => point[metric]);
    let min = Math.min(...values), max = Math.max(...values); if (min === max) { min--; max++; }
    const path = valid.map((point, index) => `${index ? 'L' : 'M'}${(index / (valid.length - 1) * 100).toFixed(1)},${(56 - ((point[metric] - min) / (max - min) * 48)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><line class="chart-grid" x1="0" x2="100" y1="56" y2="56"/><path d="${path}"/></svg>`;
  }

  function renderMiniCharts(points) {
    const metrics = ['price', 'dy', 'score', 'pvp'];
    $('#miniCharts').innerHTML = metrics.map(metric => {
      const latest = [...points].reverse().find(point => validNumber(point[metric]))?.[metric];
      return `<article class="mini-card"><div class="mini-top"><span class="mini-title">${metricCatalog[state.type][metric][0]}</span><strong class="mini-value">${formatValue(state.type, metric, latest)}</strong></div><div class="sparkline">${sparkline(points, metric)}</div></article>`;
    }).join('');
  }

  function renderTimeline(points) {
    const changes = [];
    let previous = '';
    for (const point of points) {
      const current = [point.signal, point.category].filter(Boolean).join(' · ');
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
    if (!series.length) { $('#macroChart').innerHTML = '<p class="muted">Contexto macro indisponível.</p>'; return; }
    const minDate = Math.min(...series.map(point => point.dateIndex)), maxDate = Math.max(...series.map(point => point.dateIndex), minDate + 1);
    let min = Math.min(...series.map(point => point.normalized)), max = Math.max(...series.map(point => point.normalized)); if (min === max) { min--; max++; }
    const path = type => series.filter(point => point.type === type).map((point, index) => `${index ? 'L' : 'M'}${((point.dateIndex - minDate) / (maxDate - minDate) * 100).toFixed(1)},${(90 - ((point.normalized - min) / (max - min) * 78)).toFixed(1)}`).join(' ');
    const latestSelic = selic.at(-1)?.selic, latestDollar = dollar.at(-1)?.dollar;
    $('#macroChart').innerHTML = `<div class="legend"><span class="legend-item"><i class="legend-dot"></i>Selic ${formatValue('stock', 'dy', latestSelic)}</span><span class="legend-item"><i class="legend-dot secondary"></i>Dólar ${formatValue('stock', 'price', latestDollar)}</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="chart-grid" x1="0" x2="100" y1="90" y2="90"/><path class="chart-line" d="${path('selic')}"/><path class="chart-line secondary" d="${path('dollar')}"/></svg>`;
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
    $('#assetSearch').addEventListener('change', event => { const ticker = event.target.value.trim().toUpperCase(); if (data.series[state.type][ticker]) { state.ticker = ticker; state.compare = state.compare === ticker ? '' : state.compare; update(); } else showToast('Ticker não encontrado no histórico.'); });
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