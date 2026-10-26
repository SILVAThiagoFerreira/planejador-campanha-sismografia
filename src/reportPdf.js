/**
 * Gerador de PDF vetorial do relatório: textos, tabelas e fios são escritos com jsPDF
 * (texto selecionável e pesquisável); apenas mapa e logotipos são imagens.
 */
import {layoutReport} from './reportLayout.js';

/** Distância do topo do corpo da fonte até a linha de base (métrica Helvetica/Arial), em múltiplos do tamanho. */
const ASCENT = 0.905;
/** Caracteres da codificação WinAnsi (CP1252) que as fontes padrão do PDF representam. */
const WIN_ANSI_EXTRA = new Set([8364, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 381, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 382, 376]);
export function pdfSafeText(str) {
  let out = '';
  for (const ch of String(str ?? '')) {
    const cp = ch.codePointAt(0);
    out += (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp) ? ch : '?';
  }
  return out;
}
const rgb = hex => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
};

/**
 * Monta o PDF A4 com jsPDF. `JsPDF` é o construtor (global na página, pacote npm nos testes).
 * `images` mapeia 'brand', 'footerLogo' e 'map' para {src, width, height, format}.
 */
export function buildReportPdf(data, JsPDF, images, {compress = true} = {}) {
  const style = data?.config?.report;
  if (!style?.pdfFontFamily) throw new Error('Configuração de fonte do PDF ausente em config.json (report.pdfFontFamily).');
  const doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress });
  const k = doc.internal.pageSize.getWidth() / style.width;
  const font = (size, bold) => { doc.setFont(style.pdfFontFamily, bold ? 'bold' : 'normal'); doc.setFontSize(size * k); };
  const measure = (str, size, bold) => { font(size, bold); return doc.getTextWidth(pdfSafeText(str)) / k; };
  const imageSize = key => {
    const image = images?.[key];
    if (!image) throw new Error(`Imagem do relatório ausente: ${key}.`);
    return { width: image.width, height: image.height };
  };
  const layout = layoutReport(data, { measure, imageSize });
  for (const op of layout.ops) {
    if (op.t === 'rect') {
      if (op.fill) { doc.setFillColor(...rgb(op.fill)); doc.rect(op.x * k, op.y * k, op.w * k, op.h * k, 'F'); }
      if (op.stroke) { doc.setDrawColor(...rgb(op.stroke)); doc.setLineWidth(op.lw * k); doc.rect(op.x * k, op.y * k, op.w * k, op.h * k, 'S'); }
    } else if (op.t === 'line') {
      doc.setDrawColor(...rgb(op.color)); doc.setLineWidth(op.lw * k); doc.line(op.x1 * k, op.y1 * k, op.x2 * k, op.y2 * k);
    } else if (op.t === 'circle') {
      doc.setFillColor(...rgb(op.fill)); doc.circle(op.x * k, op.y * k, op.r * k, 'F');
    } else if (op.t === 'text') {
      font(op.size, op.bold); doc.setTextColor(...rgb(op.color));
      // O layout posiciona textos pelo topo do corpo; jsPDF escreve pela linha de base.
      doc.text(pdfSafeText(op.str), op.x * k, (op.y + op.size * ASCENT) * k);
    } else if (op.t === 'image') {
      const image = images[op.key];
      if (op.clip) {
        // Recorte pelo operador PDF direto: jsPDF converte o estilo 'n' em traçado, o que descartaria o recorte.
        // O eixo Y do PDF cresce para cima, por isso a origem do retângulo é a base da caixa.
        const pageHeight = doc.internal.pageSize.getHeight();
        const cx = op.clip.x * k, cy = pageHeight - (op.clip.y + op.clip.h) * k;
        doc.saveGraphicsState();
        doc.internal.write(`${cx.toFixed(3)} ${cy.toFixed(3)} ${(op.clip.w * k).toFixed(3)} ${(op.clip.h * k).toFixed(3)} re W n`);
      }
      doc.addImage(image.src, image.format, op.x * k, op.y * k, op.w * k, op.h * k, undefined, 'FAST');
      if (op.clip) doc.restoreGraphicsState();
    }
  }
  doc.setProperties({ title: `Sismografia - ${data.meta.date} - Cenário ${data.scenario.id}`, author: data.meta.responsible || 'ENAEX', subject: data.scenario.title });
  return doc;
}
