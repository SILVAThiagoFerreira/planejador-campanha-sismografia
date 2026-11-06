// Exportação PDF do monitoramento (jsPDF, A4 paisagem, vetorial e selecionável).
// Mês: uma página com a grade (Gantt), legenda, contagens e tabela por comunidade.
// Ano: uma página por mês e uma página de resumo anual.
// Medidas, tamanhos e cores vêm de monitoring.pdf e monitoring.colors (config.json).
// Chave ausente interrompe a exportação; não há valores padrão silenciosos.
import {cellState, monthSummary, monthView, yearSummary} from './monitoringData.js';
import {pdfSafeText} from './reportPdf.js';
import {monthTitle} from './monitoringView.js';

const SIZE_KEYS = ['brand', 'brandSubtitle', 'title', 'subtitle', 'label', 'blockTitle', 'cell', 'smallCell', 'tableHeader', 'kpiLabel', 'kpiValue', 'footer', 'warning'];
const LAYOUT_KEYS = ['headerHeight', 'logoHeight', 'titleY', 'subtitleY', 'gridTop', 'labelWidth', 'blastRowHeight', 'dayRowHeight', 'pointRowHeight',
  'sectionGap', 'columnGap', 'legendWidth', 'legendRowHeight', 'kpiWidth', 'kpiHeight', 'kpiGap', 'communityRowHeight', 'footerY', 'warningY',
  'yearTableTop', 'yearHeaderHeight', 'yearRowHeight', 'yearMonthWidth', 'yearBlastWidth', 'yearMonitoringWidth'];
const PDF_COLOR_KEYS = ['ink', 'muted', 'white', 'headerSubtle', 'cardFill', 'totalFill', 'warning'];
const GRID_COLOR_KEYS = ['header', 'headerText', 'monitored', 'monitoredText', 'notInMonth', 'blastMark', 'grid'];
/** Entrelinha relativa ao tamanho da fonte. */
const LINE_HEIGHT = 1.25;
/** Deslocamento da linha de base para centralizar maiúsculas numa caixa (fração do tamanho). */
const CAP_CENTER = 0.36;

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

/** Lê e valida monitoring.pdf e as cores da grade (monitoring.colors); cores saem em RGB. */
function pdfSettings(monitoring) {
  const pdf = need(monitoring, 'pdf', 'monitoring');
  const pick = (group, keys) => {
    const values = need(pdf, group, 'monitoring.pdf');
    return Object.fromEntries(keys.map(key => [key, need(values, key, `monitoring.pdf.${group}`)]));
  };
  const shared = need(monitoring, 'colors', 'monitoring');
  const hex = {...pick('colors', PDF_COLOR_KEYS), ...Object.fromEntries(GRID_COLOR_KEYS.map(k => [k, need(shared, k, 'monitoring.colors')]))};
  return {
    font: need(pdf, 'fontFamily', 'monitoring.pdf'),
    margin: need(pdf, 'margin', 'monitoring.pdf'),
    sizes: pick('sizes', SIZE_KEYS),
    layout: pick('layout', LAYOUT_KEYS),
    colors: Object.fromEntries(Object.entries(hex).map(([k, v]) => [k, hexRgb(v)])),
  };
}

/**
 * Colunas do bloco inferior do mês (legenda, contagens e tabela por comunidade), em pontos.
 * A tabela ocupa o que sobra da largura útil, então as três colunas nunca se sobrepõem.
 */
export function monthBottomColumns(monitoring, pageWidth) {
  const {margin, layout: L} = pdfSettings(monitoring);
  const kpiX = margin + L.legendWidth + L.columnGap;
  const communityX = kpiX + L.kpiWidth + L.columnGap;
  return {
    legend: {x: margin, w: L.legendWidth},
    kpi: {x: kpiX, w: L.kpiWidth},
    community: {x: communityX, w: pageWidth - margin - communityX},
  };
}

/**
 * Constrói o documento. `JsPDF` é o construtor do jsPDF; `assets.brand` = {src, format, width, height} (logotipo da faixa).
 */
export function buildMonitoringPdf(JsPDF, {data, monitoring, mode, year, month, assets}) {
  const {font, margin, sizes: S, layout: L, colors: C} = pdfSettings(monitoring);
  const cells = monitoring.layout;
  const labels = monitoring.labels;
  const doc = new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4', compress: true});
  const PAGE_W = doc.internal.pageSize.getWidth(), PAGE_H = doc.internal.pageSize.getHeight();
  const contentW = PAGE_W - 2 * margin;

  const setFont = (size, bold = false) => { doc.setFont(font, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const text = (str, x, y, {size = S.cell, bold = false, color = C.ink, align = 'left'} = {}) => {
    setFont(size, bold);
    doc.setTextColor(...color);
    doc.text(pdfSafeText(String(str)), x, y, {align});
  };
  const wrap = (str, width, size, bold = false) => { setFont(size, bold); return doc.splitTextToSize(pdfSafeText(String(str)), width); };
  const step = size => size * LINE_HEIGHT;
  /** Texto de uma ou mais linhas, centralizado verticalmente numa caixa. */
  const boxText = (lines, x, y, w, h, {size = S.cell, bold = false, color = C.ink, align = 'center'} = {}) => {
    const first = y + h / 2 - ((lines.length - 1) * step(size)) / 2 + size * CAP_CENTER;
    const anchor = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    lines.forEach((line, i) => text(line, anchor, first + i * step(size), {size, bold, color, align}));
  };
  const vcenter = (y, h, size) => y + h / 2 + size * CAP_CENTER;
  const rect = (x, y, w, h, fillColor, strokeColor = null) => {
    if (fillColor) doc.setFillColor(...fillColor);
    if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(0.5); }
    doc.rect(x, y, w, h, fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'S');
  };
  const footer = pageLabel => {
    text(`Fonte: ${monitoring.source.fileName}`, margin, PAGE_H - L.footerY, {size: S.footer, color: C.muted});
    text(pageLabel, PAGE_W - margin, PAGE_H - L.footerY, {size: S.footer, color: C.muted, align: 'right'});
  };
  const header = (titleLine, subtitle) => {
    rect(0, 0, PAGE_W, L.headerHeight, C.header);
    if (assets?.brand) {
      const h = L.logoHeight, w = assets.brand.width * (h / assets.brand.height);
      doc.addImage(assets.brand.src, assets.brand.format, margin, (L.headerHeight - h) / 2, w, h, undefined, 'FAST');
    }
    text(monitoring.title, PAGE_W - margin, L.headerHeight * 0.44, {size: S.brand, bold: true, color: C.white, align: 'right'});
    text(monitoring.subtitle, PAGE_W - margin, L.headerHeight * 0.74, {size: S.brandSubtitle, color: C.headerSubtle, align: 'right'});
    text(titleLine, margin, L.titleY, {size: S.title, bold: true});
    text(subtitle, margin, L.subtitleY, {size: S.subtitle, color: C.muted});
  };

  const drawMonth = (monthNumber, pageNo) => {
    const view = monthView(data, year, monthNumber, monitoring);
    const summary = monthSummary(view, monitoring);
    const pageLabel = `${monthTitle(monitoring, monthNumber)} ${year}`;
    if (pageNo > 1) doc.addPage('a4', 'landscape');
    header(pageLabel, labels.tableTitle);

    // Grade: linha dos desmontes (D), faixa escura com o rótulo e os dias, uma linha por ponto.
    const labelW = L.labelWidth, dayW = (contentW - labelW) / cells.dayCount;
    const top = L.gridTop, dayTop = top + L.blastRowHeight, pointsTop = dayTop + L.dayRowHeight;
    rect(margin, top, labelW, L.blastRowHeight, null, C.grid);
    rect(margin, dayTop, labelW, L.dayRowHeight, C.header, C.grid);
    boxText([labels.pointHeader], margin + 6, dayTop, labelW - 6, L.dayRowHeight, {size: S.label, bold: true, color: C.headerText, align: 'left'});
    for (let d = 1; d <= cells.dayCount; d++) {
      const x = margin + labelW + (d - 1) * dayW;
      rect(x, top, dayW, L.blastRowHeight, null, C.grid);
      if (view.desmontes.has(d)) boxText([cells.dayMarker], x, top, dayW, L.blastRowHeight, {size: S.cell, bold: true, color: C.blastMark});
      rect(x, dayTop, dayW, L.dayRowHeight, C.header, C.grid);
      boxText([String(d)], x, dayTop, dayW, L.dayRowHeight, {size: S.smallCell, bold: true, color: C.headerText});
    }
    monitoring.points.forEach((name, k) => {
      const y = pointsTop + k * L.pointRowHeight, h = L.pointRowHeight;
      rect(margin, y, labelW, h, null, C.grid);
      text(name, margin + 6, vcenter(y, h, S.cell));
      for (let d = 1; d <= cells.dayCount; d++) {
        const x = margin + labelW + (d - 1) * dayW;
        const state = cellState(view, name, d);
        if (state === 'M') {
          rect(x, y, dayW, h, C.monitored, C.grid);
          boxText([cells.monitoredMarker], x, y, dayW, h, {size: S.cell, bold: true, color: C.monitoredText});
        } else if (state === 'N') {
          rect(x, y, dayW, h, C.notInMonth, C.grid);
          boxText([cells.notInMonthMarker], x, y, dayW, h, {size: S.smallCell, color: C.ink});
        } else {
          rect(x, y, dayW, h, null, C.grid);
        }
      }
    });

    // Abaixo da grade: legenda, contagens do mês (cartões) e tabela por comunidade, lado a lado.
    const cols = monthBottomColumns(monitoring, PAGE_W);
    const blockTop = pointsTop + monitoring.points.length * L.pointRowHeight + L.sectionGap;
    const swatch = 13, legendTextX = cols.legend.x + swatch + 6, legendTextW = cols.legend.w - swatch - 6;
    text(labels.legendTitle, cols.legend.x, blockTop + 9, {size: S.blockTitle, bold: true});
    const legend = [
      [null, labels.blankLegend],
      [{fill: C.monitored, mark: cells.monitoredMarker, color: C.monitoredText}, labels.monitoredLegend],
      [{fill: C.notInMonth, mark: cells.notInMonthMarker, color: C.header}, labels.notInMonthLegend],
      [{fill: null, mark: cells.dayMarker, color: C.blastMark}, labels.blastLegend],
    ];
    let ly = blockTop + 16;
    for (const [sw, label] of legend) {
      const lines = wrap(label, legendTextW, S.label);
      rect(cols.legend.x, ly, swatch, swatch, sw?.fill ?? null, C.grid);
      if (sw) boxText([sw.mark], cols.legend.x, ly, swatch, swatch, {size: S.smallCell, bold: true, color: sw.color});
      lines.forEach((line, i) => text(line, legendTextX, ly + swatch / 2 + S.label * CAP_CENTER + i * step(S.label)));
      ly += Math.max(L.legendRowHeight, lines.length * step(S.label) + 4);
    }

    const kpi = (index, label, value) => {
      const x = cols.kpi.x, w = cols.kpi.w, h = L.kpiHeight, y = blockTop + index * (h + L.kpiGap);
      rect(x, y, w, h, C.cardFill);
      rect(x, y, 3, h, C.header);
      wrap(label, w - 24, S.kpiLabel, true).forEach((line, i) => text(line, x + 14, y + 16 + i * step(S.kpiLabel), {size: S.kpiLabel, bold: true, color: C.muted}));
      text(String(value), x + 14, y + h - 14, {size: S.kpiValue, bold: true, color: C.header});
    };
    kpi(0, labels.desmontesCount, summary.desmontes);
    kpi(1, labels.monitoringCount, summary.monitoramentos);

    const cw = cols.community;
    const titleLines = wrap(labels.communityTable, cw.w - 12, S.blockTitle, true);
    titleLines.forEach((line, i) => text(line, cw.x + 6, blockTop + 9 + i * step(S.blockTitle), {size: S.blockTitle, bold: true}));
    const rowsTop = blockTop + 16 + (titleLines.length - 1) * step(S.blockTitle);
    monitoring.points.forEach((name, k) => {
      const y = rowsTop + k * L.communityRowHeight, h = L.communityRowHeight;
      rect(cw.x, y, cw.w, h, null, C.grid);
      text(name, cw.x + 6, vcenter(y, h, S.cell));
      text(String(summary.perPoint[name]), cw.x + cw.w - 6, vcenter(y, h, S.cell), {bold: true, align: 'right'});
    });
    const totalY = rowsTop + monitoring.points.length * L.communityRowHeight;
    rect(cw.x, totalY, cw.w, L.communityRowHeight, C.header);
    text('Total', cw.x + 6, vcenter(totalY, L.communityRowHeight, S.cell), {bold: true, color: C.white});
    text(String(summary.monitoramentos), cw.x + cw.w - 6, vcenter(totalY, L.communityRowHeight, S.cell), {bold: true, color: C.white, align: 'right'});

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
    for (const c of cols) {
      rect(x, top, c.w, headH, C.header, C.grid);
      boxText(wrap(c.label, c.w - 8, S.tableHeader, true), x, top, c.w, headH, {size: S.tableHeader, bold: true, color: C.headerText});
      x += c.w;
    }
    const rows = [
      ...months.map(r => [monthTitle(monitoring, r.month), r.desmontes, r.monitoramentos, ...monitoring.points.map(n => r.perPoint[n])]),
      ['Total', totals.desmontes, totals.monitoramentos, ...monitoring.points.map(n => totals.perPoint[n])],
    ];
    rows.forEach((row, i) => {
      const y = top + headH + i * rowH, isTotal = i === rows.length - 1;
      let cx = margin;
      row.forEach((value, j) => {
        const w = cols[j].w;
        rect(cx, y, w, rowH, isTotal ? C.totalFill : null, C.grid);
        if (j === 0) text(value, cx + 6, vcenter(y, rowH, S.cell), {bold: isTotal});
        else boxText([String(value)], cx, y, w, rowH, {bold: isTotal});
        cx += w;
      });
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
