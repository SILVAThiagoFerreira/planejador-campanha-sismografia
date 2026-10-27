// Exportação PDF do monitoramento (jsPDF, A4 paisagem, vetorial e selecionável).
// Mês: uma página com grade, legenda, contagens e tabela por comunidade.
// Ano: uma página por mês e uma página de resumo anual.
import {cellState, monthSummary, monthView, yearSummary} from './monitoringData.js';
import {pdfSafeText} from './reportPdf.js';
import {monthTitle} from './monitoringView.js';

const hexRgb = hex => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
};
const PAGE_W = 842, PAGE_H = 595;
const INK = [38, 52, 65], MUTED = [99, 113, 128], WHITE = [255, 255, 255];

/**
 * Constrói o documento. `JsPDF` é o construtor do jsPDF; `assets.brand` = {src, format, width, height} (logotipo da faixa).
 */
export function buildMonitoringPdf(JsPDF, {data, monitoring, mode, year, month, assets}) {
  const doc = new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4', compress: true});
  const font = monitoring.pdf.fontFamily;
  const margin = monitoring.pdf.margin;
  const colors = monitoring.colors;
  const setFont = (size, bold = false) => { doc.setFont(font, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const fill = c => doc.setFillColor(...c);
  const draw = c => doc.setDrawColor(...c);
  const text = (str, x, y, {size = 9, bold = false, color = INK, align = 'left'} = {}) => {
    setFont(size, bold);
    doc.setTextColor(...color);
    doc.text(pdfSafeText(String(str)), x, y, {align});
  };
  const cellText = (str, x, y, w, h, opts) => text(str, x + w / 2, y + h / 2 + opts.size * 0.36, {...opts, align: 'center'});
  const rect = (x, y, w, h, fillColor, strokeColor = null) => {
    if (fillColor) { fill(fillColor); }
    if (strokeColor) { draw(strokeColor); doc.setLineWidth(0.5); }
    doc.rect(x, y, w, h, fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'S');
  };
  const footer = (pageLabel) => {
    text(`Fonte: ${monitoring.source.fileName}`, margin, PAGE_H - 14, {size: 7, color: MUTED});
    text(pageLabel, PAGE_W - margin, PAGE_H - 14, {size: 7, color: MUTED, align: 'right'});
  };
  const header = (titleLine, subtitle) => {
    rect(0, 0, PAGE_W, 44, hexRgb(colors.header));
    if (assets?.brand) {
      const h = 22, w = assets.brand.width * (h / assets.brand.height);
      doc.addImage(assets.brand.src, assets.brand.format, margin, (44 - h) / 2, w, h, undefined, 'FAST');
    }
    text(monitoring.title, PAGE_W - margin, 19, {size: 12, bold: true, color: WHITE, align: 'right'});
    text(monitoring.subtitle, PAGE_W - margin, 32, {size: 8, color: [200, 205, 210], align: 'right'});
    text(titleLine, margin, 66, {size: 16, bold: true});
    text(subtitle, margin, 80, {size: 8, color: MUTED});
  };

  const drawMonth = (monthNumber, pageNo) => {
    const view = monthView(data, year, monthNumber, monitoring);
    const summary = monthSummary(view, monitoring);
    const dayCount = monitoring.layout.dayCount;
    if (pageNo > 1) doc.addPage('a4', 'landscape');
    header(`${monthTitle(monitoring, monthNumber)} ${year}`, `${monitoring.labels.tableTitle}`);
    const labelW = 190;
    const dayW = (PAGE_W - 2 * margin - labelW) / dayCount;
    const top = 92, blastH = 18, dayH = 16, rowH = 20;
    const gridColor = hexRgb(colors.grid);
    // Linha de desmontes.
    text(monitoring.labels.pointHeader, margin + 6, top + blastH / 2 + 3, {size: 8, bold: true});
    rect(margin, top, labelW, blastH, null, gridColor);
    for (let d = 1; d <= dayCount; d++) {
      const x = margin + labelW + (d - 1) * dayW;
      rect(x, top, dayW, blastH, null, gridColor);
      if (view.desmontes.has(d)) cellText(monitoring.layout.dayMarker, x, top, dayW, blastH, {size: 8, bold: true, color: hexRgb(colors.blastMark)});
    }
    // Números dos dias.
    const dayTop = top + blastH;
    rect(margin, dayTop, labelW, dayH, hexRgb(colors.header));
    for (let d = 1; d <= dayCount; d++) {
      const x = margin + labelW + (d - 1) * dayW;
      rect(x, dayTop, dayW, dayH, hexRgb(colors.header), gridColor);
      cellText(String(d), x, dayTop, dayW, dayH, {size: 7, bold: true, color: hexRgb(colors.headerText)});
    }
    // Pontos.
    monitoring.points.forEach((name, k) => {
      const y = dayTop + dayH + k * rowH;
      rect(margin, y, labelW, rowH, null, gridColor);
      text(name, margin + 6, y + rowH / 2 + 3, {size: 8});
      for (let d = 1; d <= dayCount; d++) {
        const x = margin + labelW + (d - 1) * dayW;
        const state = cellState(view, name, d);
        if (state === 'M') {
          rect(x, y, dayW, rowH, hexRgb(colors.monitored), gridColor);
          cellText(monitoring.layout.monitoredMarker, x, y, dayW, rowH, {size: 8, bold: true, color: hexRgb(colors.monitoredText)});
        } else if (state === 'N') {
          rect(x, y, dayW, rowH, hexRgb(colors.notInMonth), gridColor);
          cellText(monitoring.layout.notInMonthMarker, x, y, dayW, rowH, {size: 7, bold: false, color: INK});
        } else {
          rect(x, y, dayW, rowH, null, gridColor);
        }
      }
    });
    // Blocos abaixo da grade: legenda, contagens e tabela por comunidade.
    const blockTop = dayTop + dayH + monitoring.points.length * rowH + 22;
    const l = monitoring.labels;
    text(l.legendTitle, margin, blockTop, {size: 9, bold: true});
    const legend = [
      [null, l.blankLegend],
      [{fill: colors.monitored, mark: monitoring.layout.monitoredMarker, color: colors.monitoredText}, l.monitoredLegend],
      [{fill: colors.notInMonth, mark: monitoring.layout.notInMonthMarker, color: colors.header}, l.notInMonthLegend],
      [{fill: null, mark: monitoring.layout.dayMarker, color: colors.blastMark}, l.blastLegend],
    ];
    legend.forEach(([sw, label], i) => {
      const y = blockTop + 10 + i * 17;
      rect(margin, y, 13, 13, sw?.fill ? hexRgb(sw.fill) : null, gridColor);
      if (sw) cellText(sw.mark, margin, y, 13, 13, {size: 7, bold: true, color: hexRgb(sw.color)});
      text(label, margin + 20, y + 9.5, {size: 8});
    });
    const countsX = 330;
    text(l.desmontesCount, countsX, blockTop, {size: 9, bold: true});
    text(String(summary.desmontes), countsX, blockTop + 26, {size: 20, bold: true, color: hexRgb(colors.header)});
    text(l.monitoringCount, countsX + 150, blockTop, {size: 9, bold: true});
    text(String(summary.monitoramentos), countsX + 150, blockTop + 26, {size: 20, bold: true, color: hexRgb(colors.header)});
    const tableX = 560, tableW = PAGE_W - margin - tableX, rowsTop = blockTop + 10;
    text(l.communityTable, tableX, blockTop, {size: 9, bold: true});
    monitoring.points.forEach((name, k) => {
      const y = rowsTop + k * 14;
      rect(tableX, y, tableW, 14, null, gridColor);
      text(name, tableX + 5, y + 10, {size: 8});
      text(String(summary.perPoint[name]), tableX + tableW - 5, y + 10, {size: 8, bold: true, align: 'right'});
    });
    const totalY = rowsTop + monitoring.points.length * 14;
    rect(tableX, totalY, tableW, 14, hexRgb(colors.header));
    text('Total', tableX + 5, totalY + 10, {size: 8, bold: true, color: WHITE});
    text(String(summary.monitoramentos), tableX + tableW - 5, totalY + 10, {size: 8, bold: true, color: WHITE, align: 'right'});
    if (!view.hasRecord) {
      text('Sem dados de monitoramento para este mês na planilha; a grade mostra apenas o calendário.', margin, PAGE_H - 34, {size: 8, color: [139, 62, 0]});
    }
    footer(`${monthTitle(monitoring, monthNumber)} ${year}`);
  };

  if (mode === 'month') {
    drawMonth(month, 1);
  } else {
    for (let m = 1; m <= 12; m++) drawMonth(m, m);
    // Página de resumo anual.
    doc.addPage('a4', 'landscape');
    header(`Resumo anual ${year}`, 'Desmontes e monitoramentos por mês e por ponto');
    const {months, totals} = yearSummary(data, year, monitoring);
    const cols = [{label: 'Mês', w: 150}, {label: 'Desmontes', w: 80}, {label: 'Monitoramentos', w: 110}];
    const pointW = (PAGE_W - 2 * margin - 340) / monitoring.points.length;
    const top = 100, rowH = 19;
    let x = margin;
    const headerCells = [...cols, ...monitoring.points.map(n => ({label: n.replace(/^Comunidade /, ''), w: pointW}))];
    for (const c of headerCells) {
      rect(x, top, c.w, 26, hexRgb(colors.header), hexRgb(colors.grid));
      cellText(c.label, x, top, c.w, 26, {size: 7.5, bold: true, color: hexRgb(colors.headerText)});
      x += c.w;
    }
    const rowsOf = [...months.map(r => [monthTitle(monitoring, r.month), r.desmontes, r.monitoramentos, ...monitoring.points.map(n => r.perPoint[n])]),
      ['Total', totals.desmontes, totals.monitoramentos, ...monitoring.points.map(n => totals.perPoint[n])]];
    rowsOf.forEach((row, i) => {
      const y = top + 26 + i * rowH;
      const isTotal = i === rowsOf.length - 1;
      let cx = margin;
      row.forEach((value, j) => {
        const w = headerCells[j].w;
        rect(cx, y, w, rowH, isTotal ? [236, 240, 242] : null, hexRgb(colors.grid));
        if (j === 0) text(value, cx + 6, y + rowH / 2 + 3, {size: 8, bold: isTotal});
        else cellText(String(value), cx, y, w, rowH, {size: 8, bold: isTotal});
        cx += w;
      });
    });
    footer(`Resumo anual ${year}`);
  }
  doc.setProperties({title: mode === 'month' ? `${monitoring.title} - ${monthTitle(monitoring, month)} ${year}` : `${monitoring.title} - ${year}`, author: 'Enaex Brasil', subject: monitoring.subtitle});
  return doc;
}

/** Nome do arquivo a partir do modelo em config.json (monitoring.pdf.fileName / yearFileName). */
export function monitoringFileName(monitoring, mode, year, month) {
  const template = mode === 'month' ? monitoring.pdf.fileName : monitoring.pdf.yearFileName;
  return template.replace('{year}', String(year)).replace('{month}', String(month).padStart(2, '0'));
}
