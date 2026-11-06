// Layout do Gantt (mês e resumo anual) em pontos, independente do formato de saída.
// Gera uma lista de operações (retângulos, pílulas, filetes, textos e logotipo). O PDF (jsPDF) e o PNG 4K
// (canvas) desenham essa mesma lista. Medidas de texto vêm do jsPDF, então a quebra de linhas é igual nos dois.
// Medidas, tamanhos e cores vêm de monitoring.pdf (config.json); chave ausente interrompe a geração.
import {cellState, monthSummary, monthView, yearSummary} from './monitoringData.js';
import {pdfSafeText} from './reportPdf.js';
import {monthTitle} from './monitoringView.js';

const SIZE_KEYS = ['brand', 'brandSubtitle', 'title', 'subtitle', 'label', 'legend', 'blockTitle', 'cell', 'pill', 'dayNumber',
  'tableHeader', 'kpiLabel', 'kpiValue', 'footer', 'warning'];
const LAYOUT_KEYS = ['accentBarHeight', 'logoHeight', 'headerTop', 'headerRuleY', 'titleY', 'subtitleY', 'gridTop', 'labelWidth',
  'blastRowHeight', 'dayRowHeight', 'pointRowHeight', 'pillHeight', 'sectionGap', 'kpiWidth', 'kpiGap', 'kpiHeight', 'communityWidth',
  'communityRowHeight', 'footerY', 'warningY', 'yearTableTop', 'yearHeaderHeight', 'yearRowHeight', 'yearMonthWidth', 'yearBlastWidth',
  'yearMonitoringWidth'];
const PDF_COLOR_KEYS = ['paper', 'accent', 'title', 'ink', 'secondary', 'muted', 'rule', 'grid', 'monitored', 'monitoredText',
  'notInMonth', 'notInMonthText', 'blast', 'blastText', 'warning'];
/** Entrelinha relativa ao tamanho da fonte. */
const LINE_HEIGHT = 1.25;
/** Deslocamento da linha de base para centralizar maiúsculas numa caixa (fração do tamanho). */
const CAP_CENTER = 0.36;
/** Espessuras de linha (pt): grade fina, filete padrão e linha de destaque. */
const HAIRLINE = 0.25, RULE = 0.5, STRONG = 0.9;
/** Raio das marcas (pílulas com cantos suaves). */
const PILL_RADIUS = 3;

const hexRgb = hex => {
  if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) throw new Error(`Cor inválida em config.json: ${hex}.`);
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
};

/** Valor obrigatório de config.json; ausência lança erro com o caminho da chave. */
function need(source, key, path) {
  const value = source?.[key];
  if (value === undefined || value === null || value === '') throw new Error(`Configuração ausente em config.json: ${path}.${key}.`);
  return value;
}

/** Lê e valida monitoring.pdf; cores saem em RGB. */
export function ganttSettings(monitoring) {
  const pdf = need(monitoring, 'pdf', 'monitoring');
  const pick = (group, keys) => {
    const values = need(pdf, group, 'monitoring.pdf');
    return Object.fromEntries(keys.map(key => [key, need(values, key, `monitoring.pdf.${group}`)]));
  };
  const colors = pick('colors', PDF_COLOR_KEYS);
  return {
    font: need(pdf, 'fontFamily', 'monitoring.pdf'),
    margin: need(pdf, 'margin', 'monitoring.pdf'),
    sizes: pick('sizes', SIZE_KEYS),
    layout: pick('layout', LAYOUT_KEYS),
    colors: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hexRgb(v)])),
  };
}

/** Medidas de texto e tamanho da página, obtidos de um jsPDF (mesma fonte de medida para PDF e PNG). */
export function measureWith(doc, font) {
  const setFont = (size, bold) => { doc.setFont(font, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  return {
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    textWidth: (s, size, bold = false) => { setFont(size, bold); return doc.getTextWidth(s); },
    wrap: (s, width, size, bold = false) => { setFont(size, bold); return doc.splitTextToSize(s, width); },
  };
}

/**
 * Colunas do bloco inferior do mês: dois cartões de contagem à esquerda e a tabela por comunidade à direita.
 * A tabela ancora na margem direita, então as colunas nunca se sobrepõem.
 */
export function monthBlockColumns(monitoring, pageWidth) {
  const {margin, layout: L} = ganttSettings(monitoring);
  const right = pageWidth - margin;
  return {
    kpis: [0, 1].map(i => ({x: margin + i * (L.kpiWidth + L.kpiGap), w: L.kpiWidth})),
    community: {x: right - L.communityWidth, w: L.communityWidth},
  };
}

/** Empilha operações de desenho. Textos passam por pdfSafeText, como no PDF. */
function painter(measure, settings) {
  const {sizes: S, layout: L, colors: C} = settings;
  const ops = [];
  const step = size => size * LINE_HEIGHT;
  const vcenter = (y, h, size) => y + h / 2 + size * CAP_CENTER;
  const clean = s => pdfSafeText(String(s));
  const text = (s, x, y, {size = S.cell, bold = false, color = C.ink, align = 'left'} = {}) => {
    ops.push({t: 'text', s: clean(s), x, y, size, bold, color, align});
  };
  /** Texto de uma ou mais linhas, centralizado verticalmente numa caixa. */
  const boxText = (lines, x, y, w, h, {size = S.cell, bold = false, color = C.ink, align = 'center'} = {}) => {
    const first = y + h / 2 - ((lines.length - 1) * step(size)) / 2 + size * CAP_CENTER;
    const anchor = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    lines.forEach((line, i) => text(line, anchor, first + i * step(size), {size, bold, color, align}));
  };
  const fillRect = (x, y, w, h, fill) => ops.push({t: 'rect', x, y, w, h, fill});
  const line = (x1, y1, x2, y2, color, lw) => ops.push({t: 'line', x1, y1, x2, y2, color, lw});
  const hline = (x1, x2, y, color, lw) => line(x1, y, x2, y, color, lw);
  const vline = (x, y1, y2, color, lw) => line(x, y1, x, y2, color, lw);
  /** Marca discreta: pílula preenchida (M, N, D) ou contorno fino quando não há cor (legenda em branco). */
  const pill = (x, y, w, h, fill, label, textColor, size) => {
    ops.push({t: 'roundRect', x, y, w, h, r: PILL_RADIUS, fill: fill ?? null, stroke: fill ? null : C.rule, lw: RULE});
    if (label) boxText([label], x, y, w, h, {size, bold: true, color: textColor});
  };
  return {
    ops, step, vcenter, text, boxText, fillRect, hline, vline, pill,
    wrap: (s, width, size, bold) => measure.wrap(clean(s), width, size, bold),
    textWidth: (s, size, bold) => measure.textWidth(clean(s), size, bold),
  };
}

/** Cabeçalho: filete de acento, logotipo (quando houver), nome do relatório e título da página. */
function header(P, {monitoring, assets, settings, pageW}, titleLine, subtitle) {
  const {margin, sizes: S, layout: L, colors: C} = settings;
  const right = pageW - margin;
  P.fillRect(0, 0, pageW, L.accentBarHeight, C.accent);
  if (assets?.brand) {
    const h = L.logoHeight, w = assets.brand.width * (h / assets.brand.height);
    P.ops.push({t: 'image', key: 'brand', x: margin, y: L.headerTop, w, h});
  }
  P.text(monitoring.title, right, L.headerTop + 6, {size: S.brand, bold: true, color: C.ink, align: 'right'});
  P.text(monitoring.subtitle, right, L.headerTop + 17, {size: S.brandSubtitle, color: C.secondary, align: 'right'});
  P.hline(margin, right, L.headerRuleY, C.rule, RULE);
  P.text(titleLine, margin, L.titleY, {size: S.title, bold: true, color: C.title});
  P.text(subtitle, margin, L.subtitleY, {size: S.subtitle, color: C.secondary});
}

/** Rodapé: filete fino, fonte do relatório e rótulo da página. */
function footer(P, {monitoring, settings, pageW, pageH}, pageLabel) {
  const {margin, sizes: S, layout: L, colors: C} = settings;
  const right = pageW - margin;
  P.hline(margin, right, pageH - L.footerY - 8, C.rule, RULE);
  P.text(`Fonte: ${monitoring.source.fileName}`, margin, pageH - L.footerY, {size: S.footer, color: C.muted});
  P.text(pageLabel, right, pageH - L.footerY, {size: S.footer, color: C.muted, align: 'right'});
}

/** Página de um mês: grade (Gantt), legenda em uma linha, cartões de contagem e tabela por comunidade. */
export function monthPage({monitoring, data, year, month, assets, measure}) {
  const settings = ganttSettings(monitoring);
  const {margin, sizes: S, layout: L, colors: C} = settings;
  const cells = monitoring.layout, labels = monitoring.labels;
  const P = painter(measure, settings);
  const PAGE_W = measure.pageW, PAGE_H = measure.pageH, right = PAGE_W - margin, contentW = PAGE_W - 2 * margin;
  const ctx = {monitoring, assets, settings, pageW: PAGE_W, pageH: PAGE_H};
  const view = monthView(data, year, month, monitoring);
  const summary = monthSummary(view, monitoring);
  const label = `${monthTitle(monitoring, month)} ${year}`;
  header(P, ctx, label, labels.tableTitle);

  // Grade: linha de desmontes (D), linha dos dias e uma faixa por ponto. Só filetes finos, sem caixas.
  const labelW = L.labelWidth, dayW = (contentW - labelW) / cells.dayCount;
  const dayX = d => margin + labelW + (d - 1) * dayW;
  const blastTop = L.gridTop, dayTop = blastTop + L.blastRowHeight, pointsTop = dayTop + L.dayRowHeight;
  const gridBottom = pointsTop + monitoring.points.length * L.pointRowHeight;
  const markW = dayW - 6, markX = d => dayX(d) + 3;
  const markY = (rowY, rowH) => rowY + (rowH - L.pillHeight) / 2;

  for (let d = 1; d <= cells.dayCount; d++) {
    if (view.desmontes.has(d)) P.pill(markX(d), markY(blastTop, L.blastRowHeight), markW, L.pillHeight, C.blast, cells.dayMarker, C.blastText, S.pill);
  }
  P.text(labels.pointHeader, margin, P.vcenter(dayTop, L.dayRowHeight, S.label), {size: S.label, bold: true, color: C.secondary});
  for (let d = 1; d <= cells.dayCount; d++) {
    P.boxText([String(d)], dayX(d), dayTop, dayW, L.dayRowHeight, {size: S.dayNumber, bold: true, color: C.secondary});
  }
  P.hline(margin, right, dayTop + L.dayRowHeight, C.ink, RULE);
  monitoring.points.forEach((name, k) => {
    const y = pointsTop + k * L.pointRowHeight, h = L.pointRowHeight, last = k === monitoring.points.length - 1;
    P.text(name, margin, P.vcenter(y, h, S.label), {size: S.label});
    for (let d = 1; d <= cells.dayCount; d++) {
      const state = cellState(view, name, d);
      if (state === 'M') P.pill(markX(d), markY(y, h), markW, L.pillHeight, C.monitored, cells.monitoredMarker, C.monitoredText, S.pill);
      else if (state === 'N') P.pill(markX(d), markY(y, h), markW, L.pillHeight, C.notInMonth, cells.notInMonthMarker, C.notInMonthText, S.pill);
    }
    P.hline(margin, right, y + h, last ? C.ink : C.rule, last ? RULE : HAIRLINE);
  });
  for (let d = 0; d <= cells.dayCount; d++) P.vline(margin + labelW + d * dayW, dayTop, gridBottom, C.grid, HAIRLINE);

  // Legenda em uma linha, abaixo da grade.
  const legendY = gridBottom + L.sectionGap, legendSize = S.legend;
  P.text(labels.legendTitle, margin, P.vcenter(legendY, L.pillHeight, S.blockTitle), {size: S.blockTitle, bold: true});
  let lx = margin + P.textWidth(labels.legendTitle, S.blockTitle, true) + 16;
  const swatchW = 14, gap = 18;
  const legend = [
    [null, labels.blankLegend],
    [{fill: C.monitored, mark: cells.monitoredMarker, color: C.monitoredText}, labels.monitoredLegend],
    [{fill: C.notInMonth, mark: cells.notInMonthMarker, color: C.notInMonthText}, labels.notInMonthLegend],
    [{fill: C.blast, mark: cells.dayMarker, color: C.blastText}, labels.blastLegend],
  ];
  for (const [mark, text] of legend) {
    P.pill(lx, legendY, swatchW, L.pillHeight, mark?.fill ?? null, mark?.mark, mark?.color, S.pill);
    P.text(text, lx + swatchW + 5, P.vcenter(legendY, L.pillHeight, legendSize), {size: legendSize, color: C.secondary});
    lx += swatchW + 5 + P.textWidth(text, legendSize) + gap;
  }

  // Cartões de contagem: rótulo, número grande e um traço vermelho de acento (sem caixas).
  const cols = monthBlockColumns(monitoring, PAGE_W);
  const blockTop = legendY + L.sectionGap;
  const kpi = (col, text, value) => {
    P.fillRect(col.x, blockTop, 18, 2, C.accent);
    P.wrap(text, col.w, S.kpiLabel, true).forEach((line, i) => {
      P.text(line, col.x, blockTop + 16 + i * P.step(S.kpiLabel), {size: S.kpiLabel, bold: true, color: C.secondary});
    });
    P.text(String(value), col.x, blockTop + L.kpiHeight, {size: S.kpiValue, bold: true, color: C.ink});
  };
  kpi(cols.kpis[0], labels.desmontesCount, summary.desmontes);
  kpi(cols.kpis[1], labels.monitoringCount, summary.monitoramentos);

  // Tabela por comunidade: só filetes horizontais; total com filete mais forte.
  const cw = cols.community;
  const titleLines = P.wrap(labels.communityTable, cw.w, S.blockTitle, true);
  titleLines.forEach((line, i) => P.text(line, cw.x, blockTop + 9 + i * P.step(S.blockTitle), {size: S.blockTitle, bold: true}));
  const rowsTop = blockTop + 9 + titleLines.length * P.step(S.blockTitle) + 4;
  P.hline(cw.x, cw.x + cw.w, rowsTop - 4, C.ink, RULE);
  monitoring.points.forEach((name, k) => {
    const y = rowsTop + k * L.communityRowHeight, h = L.communityRowHeight;
    P.text(name, cw.x, P.vcenter(y, h, S.cell), {size: S.cell});
    P.text(String(summary.perPoint[name]), cw.x + cw.w, P.vcenter(y, h, S.cell), {size: S.cell, bold: true, align: 'right'});
    P.hline(cw.x, cw.x + cw.w, y + h, C.rule, HAIRLINE);
  });
  const totalY = rowsTop + monitoring.points.length * L.communityRowHeight;
  P.hline(cw.x, cw.x + cw.w, totalY, C.ink, STRONG);
  P.text('Total', cw.x, P.vcenter(totalY, L.communityRowHeight, S.cell), {size: S.cell, bold: true});
  P.text(String(summary.monitoramentos), cw.x + cw.w, P.vcenter(totalY, L.communityRowHeight, S.cell), {size: S.cell, bold: true, align: 'right'});

  if (!view.hasRecord) {
    P.text('Sem dados de monitoramento para este mês na planilha; a grade mostra apenas o calendário.', margin, PAGE_H - L.warningY, {size: S.warning, color: C.warning});
  }
  footer(P, ctx, label);
  return {label, ops: P.ops};
}

/** Página de resumo anual: tabela por mês e por ponto. */
export function summaryPage({monitoring, data, year, assets, measure}) {
  const settings = ganttSettings(monitoring);
  const {margin, sizes: S, layout: L, colors: C} = settings;
  const P = painter(measure, settings);
  const PAGE_W = measure.pageW, PAGE_H = measure.pageH, right = PAGE_W - margin, contentW = PAGE_W - 2 * margin;
  const ctx = {monitoring, assets, settings, pageW: PAGE_W, pageH: PAGE_H};
  const label = `Resumo anual ${year}`;
  header(P, ctx, label, 'Desmontes e monitoramentos por mês e por ponto');
  const {months, totals} = yearSummary(data, year, monitoring);
  const fixed = [
    {label: 'Mês', w: L.yearMonthWidth},
    {label: 'Desmontes', w: L.yearBlastWidth},
    {label: 'Monitoramentos', w: L.yearMonitoringWidth},
  ];
  const pointW = (contentW - fixed.reduce((sum, c) => sum + c.w, 0)) / monitoring.points.length;
  const cols = [...fixed, ...monitoring.points.map(n => ({label: n.replace(/^Comunidade /, ''), w: pointW}))];
  const top = L.yearTableTop, headH = L.yearHeaderHeight, rowH = L.yearRowHeight;
  let x = margin;
  cols.forEach((c, j) => {
    P.boxText(P.wrap(c.label, c.w - 6, S.tableHeader, true), x, top, c.w, headH,
      {size: S.tableHeader, bold: true, color: C.secondary, align: j === 0 ? 'left' : 'center'});
    x += c.w;
  });
  P.hline(margin, right, top + headH, C.ink, RULE);
  const rows = [
    ...months.map(r => [monthTitle(monitoring, r.month), r.desmontes, r.monitoramentos, ...monitoring.points.map(n => r.perPoint[n])]),
    ['Total', totals.desmontes, totals.monitoramentos, ...monitoring.points.map(n => totals.perPoint[n])],
  ];
  rows.forEach((row, i) => {
    const y = top + headH + i * rowH, isTotal = i === rows.length - 1;
    let cx = margin;
    row.forEach((value, j) => {
      const w = cols[j].w;
      if (j === 0) P.text(value, cx, P.vcenter(y, rowH, S.cell), {size: S.cell, bold: isTotal});
      else P.boxText([String(value)], cx, y, w, rowH, {size: S.cell, bold: isTotal});
      cx += w;
    });
    P.hline(margin, right, y + rowH, isTotal ? C.ink : C.rule, isTotal ? STRONG : HAIRLINE);
  });
  footer(P, ctx, `Resumo anual ${year}`);
  return {label, ops: P.ops};
}

/**
 * Páginas do Gantt. Mês: uma página. Ano: 12 páginas mensais e o resumo.
 * Cada página traz `kind` ('month' ou 'summary'), `month` (quando mensal), `label` e `ops`.
 */
export function ganttPages({monitoring, data, mode, year, month, assets, measure}) {
  if (mode === 'month') return [{kind: 'month', month, ...monthPage({monitoring, data, year, month, assets, measure})}];
  const pages = [];
  for (let m = 1; m <= 12; m++) pages.push({kind: 'month', month: m, ...monthPage({monitoring, data, year, month: m, assets, measure})});
  pages.push({kind: 'summary', ...summaryPage({monitoring, data, year, assets, measure})});
  return pages;
}
