// Exportação PNG 4K do monitoramento: as mesmas operações do PDF (monitoringGantt.js) são desenhadas em canvas
// direto na resolução final, sem ampliar bitmaps. Largura em monitoring.png.widthPx (3840 px no mínimo),
// altura pela proporção da página A4 paisagem. Mês: um PNG. Ano: ZIP com os 12 meses e o resumo.
// ZIP usa o JSZip já vendorizado (vendor/jszip.min.js), sem dependência nova.
import {ganttPages, ganttSettings, measureWith} from './monitoringGantt.js?v=1.5.0';

/** Configuração de monitoring.png; chave ausente interrompe a exportação. */
export function pngSettings(monitoring) {
  const png = monitoring.png;
  if (!png) throw new Error('Configuração ausente em config.json: monitoring.png.');
  for (const key of ['widthPx', 'minWidthPx', 'fontStack', 'fileName', 'yearFileName', 'summaryFileName']) {
    if (png[key] === undefined || png[key] === null || png[key] === '') throw new Error(`Configuração ausente em config.json: monitoring.png.${key}.`);
  }
  return png;
}

/** Tamanho do PNG: largura configurada e altura pela proporção da página. Recusa largura abaixo do mínimo. */
export function pngSize(monitoring, pageW, pageH) {
  const png = pngSettings(monitoring);
  if (!Number.isInteger(png.widthPx) || png.widthPx < png.minWidthPx) {
    throw new Error(`Largura do PNG abaixo do mínimo: ${png.widthPx} px, mínimo ${png.minWidthPx} px (monitoring.png.widthPx).`);
  }
  return {width: png.widthPx, height: Math.round(pageH * png.widthPx / pageW)};
}

/** Nome do arquivo: 'month' (um mês), 'year' (ZIP do ano) ou 'summary' (resumo dentro do ZIP). */
export function pngFileName(monitoring, kind, year, month) {
  const png = pngSettings(monitoring);
  const template = kind === 'month' ? png.fileName : kind === 'year' ? png.yearFileName : png.summaryFileName;
  return template.replace('{year}', String(year)).replace('{month}', String(month ?? '').padStart(2, '0'));
}

const css = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha as operações da página no canvas; `scale` converte pontos em pixels. */
function drawOpsCanvas(ctx, ops, {scale, fontStack, brand}) {
  const s = scale;
  for (const op of ops) {
    if (op.t === 'rect') {
      ctx.fillStyle = css(op.fill);
      ctx.fillRect(op.x * s, op.y * s, op.w * s, op.h * s);
    } else if (op.t === 'roundRect') {
      roundRectPath(ctx, op.x * s, op.y * s, op.w * s, op.h * s, op.r * s);
      if (op.fill) {
        ctx.fillStyle = css(op.fill);
        ctx.fill();
      } else {
        ctx.strokeStyle = css(op.stroke);
        ctx.lineWidth = op.lw * s;
        ctx.stroke();
      }
    } else if (op.t === 'line') {
      ctx.strokeStyle = css(op.color);
      ctx.lineWidth = op.lw * s;
      ctx.beginPath();
      ctx.moveTo(op.x1 * s, op.y1 * s);
      ctx.lineTo(op.x2 * s, op.y2 * s);
      ctx.stroke();
    } else if (op.t === 'text') {
      ctx.font = `${op.bold ? 'bold ' : ''}${op.size * s}px ${fontStack}`;
      ctx.fillStyle = css(op.color);
      ctx.textAlign = op.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(op.s, op.x * s, op.y * s);
    } else if (op.t === 'image') {
      ctx.drawImage(brand, op.x * s, op.y * s, op.w * s, op.h * s);
    }
  }
}

/** Carrega um data URL numa imagem decodificada (necessária antes do drawImage). */
async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Renderiza uma página e devolve o PNG como Blob; libera o canvas depois. */
async function pageBlob(ops, {size, pageW, paper, fontStack, brand}) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', {alpha: false});
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = css(paper);
  ctx.fillRect(0, 0, size.width, size.height);
  drawOpsCanvas(ctx, ops, {scale: size.width / pageW, fontStack, brand});
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    canvas.width = 0;
    canvas.height = 0;
    if (blob) resolve(blob);
    else reject(new Error('Não foi possível gerar o PNG.'));
  }, 'image/png'));
}

/**
 * Gera o PNG (mês) ou o ZIP (ano). `JsPDF` mede o texto com a mesma fonte do PDF; `assets.brand` é o logotipo.
 * Retorna {blob, fileName, count}. `onProgress(feitas, total)` avisa o andamento do ZIP.
 */
export async function exportMonitoringPng(JsPDF, {data, monitoring, mode, year, month, assets, onProgress}) {
  const png = pngSettings(monitoring);
  const {font, colors} = ganttSettings(monitoring);
  const measure = measureWith(new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'}), font);
  const size = pngSize(monitoring, measure.pageW, measure.pageH);
  const brand = assets?.brand ? await loadImage(assets.brand.src) : null;
  const pages = ganttPages({data, monitoring, mode, year, month, assets, measure});
  const render = page => pageBlob(page.ops, {size, pageW: measure.pageW, paper: colors.paper, fontStack: png.fontStack, brand});

  if (mode === 'month') {
    onProgress?.(1, 1);
    return {blob: await render(pages[0]), fileName: pngFileName(monitoring, 'month', year, month), count: 1};
  }
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error('Biblioteca JSZip não carregada; não é possível gerar o ZIP.');
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const name = page.kind === 'summary' ? pngFileName(monitoring, 'summary', year) : pngFileName(monitoring, 'month', year, page.month);
    zip.file(name, await render(page));
    onProgress?.(i + 1, pages.length);
  }
  // PNG já é comprimido: o ZIP só empacota (STORE), sem recompressão.
  return {blob: await zip.generateAsync({type: 'blob', compression: 'STORE'}), fileName: pngFileName(monitoring, 'year', year), count: pages.length};
}

/** Entrega o arquivo ao navegador por um link temporário (download). */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
