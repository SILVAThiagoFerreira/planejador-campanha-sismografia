// Exportação PDF do monitoramento (jsPDF, A4 paisagem, vetorial e selecionável).
// Identidade Enaex conforme VISUAL_STANDARD do hub: fundo branco, vermelho Enaex como acento pontual,
// cinza Enaex no texto, linhas finas cinza claras e marcas discretas nas células.
// Mês: grade (Gantt), legenda em uma linha, cartões de contagem e tabela por comunidade.
// Ano: uma página por mês e uma página de resumo anual.
// Medidas, tamanhos e cores vêm de monitoring.pdf (config.json); chave ausente interrompe a exportação.
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
function pdfSettings(monitoring) {
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

/**
 * Colunas do bloco inferior do mês: dois cartões de contagem à esquerda e a tabela por comunidade à direita.
 * A tabela ancora na margem direita, então as colunas nunca se sobrepõem.
 */
export function monthBlockColumns(monitoring, pageWidth) {
  const {margin, layout: L} = pdfSettings(monitoring);
  const right = pageWidth - margin;
  return {
    kpis: [0, 1].map(i => ({x: margin + i * (L.kpiWidth + L.kpiGap), w: L.kpiWidth})),
    community: {x: right - L.communityWidth, w: L.communityWidth},
  };
}

/**
 * Constrói o documento. `JsPDF` é o construtor do jsPDF; `assets.brand` = {src, format, width, height} (logotipo Enaex).
 */
export function buildMonitoringPdf(JsPDF, {data, monitoring, mode, year, month, assets}) {
  const {font, margin, sizes: S, layout: L, colors: C} = pdfSettings(monitoring);
  const cells = monitoring.layout;
  const labels = monitoring.labels;
  const doc = new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4', compress: true});
  const PAGE_W = doc.internal.pageSize.getWidth(), PAGE_H = doc.internal.pageSize.getHeight();
  const contentW = PAGE_W - 2 * margin;
  const right = PAGE_W - margin;

  const setFont = (size, bold = false) => { doc.setFont(font, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const text = (str, x, y, {size = S.cell, bold = false, color = C.ink, align = 'left'} = {}) => {
    setFont(size, bold);
    doc.setTextColor(...color);
    doc.text(pdfSafeText(String(str)), x, y, {align});
  };
  const textWidth = (str, size, bold = false) => { setFont(size, bold); return doc.getTextWidth(pdfSafeText(String(str))); };
  const wrap = (str, width, size, bold = false) => { setFont(size, bold); return doc.splitTextToSize(pdfSafeText(String(str)), width); };
  const step = size => size * LINE_HEIGHT;
  const vcenter = (y, h, size) => y + h / 2 + size * CAP_CENTER;
  /** Texto de uma ou mais linhas, centralizado verticalmente numa caixa. */
  const boxText = (lines, x, y, w, h, {size = S.cell, bold = false, color = C.ink, align = 'center'} = {}) => {
    const first = y + h / 2 - ((lines.length - 1) * step(size)) / 2 + size * CAP_CENTER;
    const anchor = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    lines.forEach((line, i) => text(line, anchor, first + i * step(size), {size, bold, color, align}));
  };
  const fillRect = (x, y, w, h, color) => { doc.setFillColor(...color); doc.rect(x, y, w, h, 'F'); };
  const hline = (x1, x2, y, color, width) => { doc.setDrawColor(...color); doc.setLineWidth(width); doc.line(x1, y, x2, y); };
  const vline = (x, y1, y2, color, width) => { doc.setDrawColor(...color); doc.setLineWidth(width); doc.line(x, y1, x, y2); };
  /** Marca discreta: pílula cinza-grafite (M), cinza clara (N), vermelha (D) ou contorno fino (legenda em branco). */
  const pill = (x, y, w, h, fill, label, textColor, size) => {
    if (fill) {
      doc.setFillColor(...fill);
      doc.roundedRect(x, y, w, h, PILL_RADIUS, PILL_RADIUS, 'F');
    } else {
      doc.setDrawColor(...C.rule);
      doc.setLineWidth(RULE);
      doc.roundedRect(x, y, w, h, PILL_RADIUS, PILL_RADIUS, 'S');
    }
    if (label) boxText([label], x, y, w, h, {size, bold: true, color: textColor});
  };
  const footer = pageLabel => {
    hline(margin, right, PAGE_H - L.footerY - 8, C.rule, RULE);
    text(`Fonte: ${monitoring.source.fileName}`, margin, PAGE_H - L.footerY, {size: S.footer, color: C.muted});
    text(pageLabel, right, PAGE_H - L.footerY, {size: S.footer, color: C.muted, align: 'right'});
  };
  const header = (titleLine, subtitle) => {
    fillRect(0, 0, PAGE_W, L.accentBarHeight, C.accent);
    if (assets?.brand) {
      const h = L.logoHeight, w = assets.brand.width * (h / assets.brand.height);
      doc.addImage(assets.brand.src, assets.brand.format, margin, L.headerTop, w, h, undefined, 'FAST');
    }
    text(monitoring.title, right, L.headerTop + 6, {size: S.brand, bold: true, color: C.ink, align: 'right'});
    text(monitoring.subtitle, right, L.headerTop + 17, {size: S.brandSubtitle, color: C.secondary, align: 'right'});
    hline(margin, right, L.headerRuleY, C.rule, RULE);
    text(titleLine, margin, L.titleY, {size: S.title, bold: true, color: C.title});
    text(subtitle, margin, L.subtitleY, {size: S.subtitle, color: C.secondary});
  };

  const drawMonth = (monthNumber, pageNo) => {
    const view = monthView(data, year, monthNumber, monitoring);
    const summary = monthSummary(view, monitoring);
    const pageLabel = `${monthTitle(monitoring, monthNumber)} ${year}`;
    if (pageNo > 1) doc.addPage('a4', 'landscape');
    header(pageLabel, labels.tableTitle);

    // Grade: linha de desmontes (D), linha dos dias e uma faixa por ponto. Só linhas finas, sem caixas.
    const labelW = L.labelWidth, dayW = (contentW - labelW) / cells.dayCount;
    const dayX = d => margin + labelW + (d - 1) * dayW;
    const blastTop = L.gridTop, dayTop = blastTop + L.blastRowHeight, pointsTop = dayTop + L.dayRowHeight;
    const gridBottom = pointsTop + monitoring.points.length * L.pointRowHeight;
    const markW = dayW - 6, markX = d => dayX(d) + 3;
    const markY = (rowY, rowH) => rowY + (rowH - L.pillHeight) / 2;

    for (let d = 1; d <= cells.dayCount; d++) {
      if (view.desmontes.has(d)) pill(markX(d), markY(blastTop, L.blastRowHeight), markW, L.pillHeight, C.blast, cells.dayMarker, C.blastText, S.pill);
    }
    text(labels.pointHeader, margin, vcenter(dayTop, L.dayRowHeight, S.label), {size: S.label, bold: true, color: C.secondary});
    for (let d = 1; d <= cells.dayCount; d++) {
      boxText([String(d)], dayX(d), dayTop, dayW, L.dayRowHeight, {size: S.dayNumber, bold: true, color: C.secondary});
    }
    hline(margin, right, dayTop + L.dayRowHeight, C.ink, RULE);
    monitoring.points.forEach((name, k) => {
      const y = pointsTop + k * L.pointRowHeight, h = L.pointRowHeight;
      text(name, margin, vcenter(y, h, S.label), {size: S.label});
      for (let d = 1; d <= cells.dayCount; d++) {
        const state = cellState(view, name, d);
        if (state === 'M') pill(markX(d), markY(y, h), markW, L.pillHeight, C.monitored, cells.monitoredMarker, C.monitoredText, S.pill);
        else if (state === 'N') pill(markX(d), markY(y, h), markW, L.pillHeight, C.notInMonth, cells.notInMonthMarker, C.notInMonthText, S.pill);
      }
      hline(margin, right, y + h, k === monitoring.points.length - 1 ? C.ink : C.rule, k === monitoring.points.length - 1 ? RULE : HAIRLINE);
    });
    for (let d = 0; d <= cells.dayCount; d++) vline(margin + labelW + d * dayW, dayTop, gridBottom, C.grid, HAIRLINE);

    // Legenda em uma linha, abaixo da grade.
    const legendY = gridBottom + L.sectionGap, legendSize = S.legend;
    text(labels.legendTitle, margin, vcenter(legendY, L.pillHeight, S.blockTitle), {size: S.blockTitle, bold: true});
    let lx = margin + textWidth(labels.legendTitle, S.blockTitle, true) + 16;
    const swatchW = 14, gap = 18;
    const legend = [
      [null, labels.blankLegend],
      [{fill: C.monitored, mark: cells.monitoredMarker, color: C.monitoredText}, labels.monitoredLegend],
      [{fill: C.notInMonth, mark: cells.notInMonthMarker, color: C.notInMonthText}, labels.notInMonthLegend],
      [{fill: C.blast, mark: cells.dayMarker, color: C.blastText}, labels.blastLegend],
    ];
    for (const [mark, label] of legend) {
      pill(lx, legendY, swatchW, L.pillHeight, mark?.fill ?? null, mark?.mark, mark?.color, S.pill);
      text(label, lx + swatchW + 5, vcenter(legendY, L.pillHeight, legendSize), {size: legendSize, color: C.secondary});
      lx += swatchW + 5 + textWidth(label, legendSize) + gap;
    }

    // Cartões de contagem (sem caixas: rótulo, número grande e um traço vermelho de acento).
    const cols = monthBlockColumns(monitoring, PAGE_W);
    const blockTop = legendY + L.sectionGap;
    const kpi = (col, label, value) => {
      fillRect(col.x, blockTop, 18, 2, C.accent);
      const lines = wrap(label, col.w, S.kpiLabel, true);
      lines.forEach((line, i) => text(line, col.x, blockTop + 16 + i * step(S.kpiLabel), {size: S.kpiLabel, bold: true, color: C.secondary}));
      text(String(value), col.x, blockTop + L.kpiHeight, {size: S.kpiValue, bold: true, color: C.ink});
    };
    kpi(cols.kpis[0], labels.desmontesCount, summary.desmontes);
    kpi(cols.kpis[1], labels.monitoringCount, summary.monitoramentos);

    // Tabela por comunidade: só filetes horizontais; total com filete mais forte.
    const cw = cols.community;
    const titleLines = wrap(labels.communityTable, cw.w, S.blockTitle, true);
    titleLines.forEach((line, i) => text(line, cw.x, blockTop + 9 + i * step(S.blockTitle), {size: S.blockTitle, bold: true}));
    const rowsTop = blockTop + 9 + titleLines.length * step(S.blockTitle) + 4;
    hline(cw.x, cw.x + cw.w, rowsTop - 4, C.ink, RULE);
    monitoring.points.forEach((name, k) => {
      const y = rowsTop + k * L.communityRowHeight, h = L.communityRowHeight;
      text(name, cw.x, vcenter(y, h, S.cell), {size: S.cell});
      text(String(summary.perPoint[name]), cw.x + cw.w, vcenter(y, h, S.cell), {size: S.cell, bold: true, align: 'right'});
      hline(cw.x, cw.x + cw.w, y + h, C.rule, HAIRLINE);
    });
    const totalY = rowsTop + monitoring.points.length * L.communityRowHeight;
    hline(cw.x, cw.x + cw.w, totalY, C.ink, STRONG);
    text('Total', cw.x, vcenter(totalY, L.communityRowHeight, S.cell), {size: S.cell, bold: true});
    text(String(summary.monitoramentos), cw.x + cw.w, vcenter(totalY, L.communityRowHeight, S.cell), {size: S.cell, bold: true, align: 'right'});

    if (!view.hasRecord) {
      text('Sem dados de monitoramento para este mês na planilha; a grade mostra apenas o calendário.', margin, PAGE_H - L.warningY, {size: S.warning, color: C.warning});
    }
    footer(pageLabel);
  };

  const drawSummary = () => {
    doc.addPage('a4', 'landscape');
    header(`Resumo anual ${year}`, 'Desmontes e monitoramentos por mês e por ponto');
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
      boxText(wrap(c.label, c.w - 6, S.tableHeader, true), x, top, c.w, headH,
        {size: S.tableHeader, bold: true, color: C.secondary, align: j === 0 ? 'left' : 'center'});
      x += c.w;
    });
    hline(margin, right, top + headH, C.ink, RULE);
    const rows = [
      ...months.map(r => [monthTitle(monitoring, r.month), r.desmontes, r.monitoramentos, ...monitoring.points.map(n => r.perPoint[n])]),
      ['Total', totals.desmontes, totals.monitoramentos, ...monitoring.points.map(n => totals.perPoint[n])],
    ];
    rows.forEach((row, i) => {
      const y = top + headH + i * rowH, isTotal = i === rows.length - 1;
      let cx = margin;
      row.forEach((value, j) => {
        const w = cols[j].w;
        if (j === 0) text(value, cx, vcenter(y, rowH, S.cell), {size: S.cell, bold: isTotal});
        else boxText([String(value)], cx, y, w, rowH, {size: S.cell, bold: isTotal});
        cx += w;
      });
      hline(margin, right, y + rowH, isTotal ? C.ink : C.rule, isTotal ? STRONG : HAIRLINE);
    });
    footer(`Resumo anual ${year}`);
  };

  if (mode === 'month') {
    drawMonth(month, 1);
  } else {
    for (let m = 1; m <= 12; m++) drawMonth(m, m);
    drawSummary();
  }
  doc.setProperties({title: mode === 'month' ? `${monitoring.title} - ${monthTitle(monitoring, month)} ${year}` : `${monitoring.title} - ${year}`, author: 'Enaex Brasil', subject: monitoring.subtitle});
  return doc;
}

/** Nome do arquivo a partir do modelo em config.json (monitoring.pdf.fileName / yearFileName). */
export function monitoringFileName(monitoring, mode, year, month) {
  const template = mode === 'month' ? monitoring.pdf.fileName : monitoring.pdf.yearFileName;
  return template.replace('{year}', String(year)).replace('{month}', String(month).padStart(2, '0'));
}
