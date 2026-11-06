// Exportação PDF do monitoramento (jsPDF, A4 paisagem, vetorial e selecionável).
// O layout vem de monitoringGantt.js (o mesmo usado pelo PNG 4K); aqui só se desenham as operações no jsPDF.
// Mês: uma página. Ano: uma página por mês e uma de resumo anual.
import {ganttPages, ganttSettings, measureWith} from './monitoringGantt.js?v=1.4.0';
import {monthTitle} from './monitoringView.js';

/** Desenha uma lista de operações numa página do jsPDF. */
export function drawOpsPdf(doc, ops, {font, assets}) {
  for (const op of ops) {
    if (op.t === 'rect') {
      doc.setFillColor(...op.fill);
      doc.rect(op.x, op.y, op.w, op.h, 'F');
    } else if (op.t === 'roundRect') {
      if (op.fill) {
        doc.setFillColor(...op.fill);
        doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, 'F');
      } else {
        doc.setDrawColor(...op.stroke);
        doc.setLineWidth(op.lw);
        doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, 'S');
      }
    } else if (op.t === 'line') {
      doc.setDrawColor(...op.color);
      doc.setLineWidth(op.lw);
      doc.line(op.x1, op.y1, op.x2, op.y2);
    } else if (op.t === 'text') {
      doc.setFont(font, op.bold ? 'bold' : 'normal');
      doc.setFontSize(op.size);
      doc.setTextColor(...op.color);
      doc.text(op.s, op.x, op.y, {align: op.align});
    } else if (op.t === 'image') {
      const brand = assets.brand;
      doc.addImage(brand.src, brand.format, op.x, op.y, op.w, op.h, undefined, 'FAST');
    }
  }
}

/**
 * Constrói o documento. `JsPDF` é o construtor do jsPDF; `assets.brand` = {src, format, width, height} (logotipo Enaex).
 */
export function buildMonitoringPdf(JsPDF, {data, monitoring, mode, year, month, assets}) {
  const doc = new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4', compress: true});
  const {font} = ganttSettings(monitoring);
  const pages = ganttPages({data, monitoring, mode, year, month, assets, measure: measureWith(doc, font)});
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage('a4', 'landscape');
    drawOpsPdf(doc, page.ops, {font, assets});
  });
  doc.setProperties({title: mode === 'month' ? `${monitoring.title} - ${monthTitle(monitoring, month)} ${year}` : `${monitoring.title} - ${year}`, author: 'Enaex Brasil', subject: monitoring.subtitle});
  return doc;
}

/** Nome do arquivo a partir do modelo em config.json (monitoring.pdf.fileName / yearFileName). */
export function monitoringFileName(monitoring, mode, year, month) {
  const template = mode === 'month' ? monitoring.pdf.fileName : monitoring.pdf.yearFileName;
  return template.replace('{year}', String(year)).replace('{month}', String(month).padStart(2, '0'));
}
