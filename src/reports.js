/** Browser-only report orchestration: prévia/PNG em canvas, PDF vetorial e mensagem. Layout em reportLayout.js; geometria em core.js. */
import {number, coordinateNumber, coordinateDMM, reportDate, reportNotes, validateReportData} from './reportFormat.js';
import {layoutReport, situationBlock} from './reportLayout.js';
import {buildReportPdf} from './reportPdf.js';
export {coordinateDMM, coordinateNumber, reportNotes, situationBlock};

export function buildWhatsAppMessage(data, template) {
  validateReportData(data);
  const { meta, plan, scenario } = data;
  const fields = {
    data: reportDate(meta.date), horario: meta.time || 'A definir', regiao: meta.blastName || `${plan.polygons?.length || 0} áreas de desmonte`,
    areas: (plan.polygons || []).map(p => `${p.name}: ${p.azimuth === null || p.azimuth === undefined ? 'direção não informada' : `${number(p.azimuth, 0)}°`}`).join('\n'),
    operacao: meta.operation || data.config.defaults?.operation || '', cenario: `${scenario.id} - ${scenario.title}`,
    quantidade: String(scenario.points.length), latitude: coordinateDMM(plan.origin.lat, 'lat'), longitude: coordinateDMM(plan.origin.lon, 'lon'),
    leste: coordinateNumber(plan.origin.x, 4), norte: coordinateNumber(plan.origin.y, 4), zona: String(meta.crsZone || 24),
    pontos: scenario.points.map((p, i) => `${i + 1}. ${p.name}${p.fixed ? ' (FIXO)' : ''}\n   ${coordinateDMM(p.lat, 'lat')} | ${coordinateDMM(p.lon, 'lon')}\n   Distância à origem: ${number(p.distance, 0)} m`).join('\n'),
    observacoes: reportNotes(meta.notes, 'Confirmar acesso, autorização de instalação e acoplamento dos instrumentos antes da campanha.'), responsavel: meta.responsible || '',
  };
  const source = template ?? meta.whatsappTemplate ?? data.config.report.whatsappTemplate;
  if (typeof source !== 'string' || !source.trim()) throw new Error('Informe o modelo da mensagem para WhatsApp.');
  return source.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!(key in fields)) throw new Error(`Campo desconhecido na mensagem: ${match}`);
    return fields[key];
  }).trim();
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a identidade visual do relatório.'));
    img.src = new URL(url, document.baseURI).href;
  });
}
/** Imagens do relatório: identidade visual (brand, footerLogo) e mapa de satélite quando disponível. */
export async function loadReportImages(data) {
  const style = data.config.report;
  const [brand, footerLogo] = await Promise.all([loadImage(style.brandAsset), loadImage(style.footerLogoAsset)]);
  const images = {
    brand: { src: brand, width: brand.naturalWidth, height: brand.naturalHeight, format: 'JPEG' },
    footerLogo: { src: footerLogo, width: footerLogo.naturalWidth, height: footerLogo.naturalHeight, format: 'PNG' },
  };
  if (data.mapCanvas) images.map = { src: data.mapCanvas, width: data.mapCanvas.width, height: data.mapCanvas.height, format: 'PNG' };
  return images;
}
/** Medição de texto com a mesma fonte do canvas de desenho. */
function canvasMeasure(fontFamily) {
  const ctx = document.createElement('canvas').getContext('2d');
  return (str, size, bold) => { ctx.font = `${bold ? 'bold ' : ''}${size}px ${fontFamily}`; return ctx.measureText(str).width; };
}
/** Renderiza as operações do layout em canvas (prévia, PNG e imagem do DOCX). */
function drawLayoutToCanvas(layout, images, scale) {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(layout.width * scale); canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.textBaseline = 'top';
  const fontFamily = layout.fontFamily;
  for (const op of layout.ops) {
    if (op.t === 'rect') {
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw; ctx.strokeRect(op.x, op.y, op.w, op.h); }
    } else if (op.t === 'line') {
      ctx.strokeStyle = op.color; ctx.lineWidth = op.lw; ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
    } else if (op.t === 'circle') {
      ctx.fillStyle = op.fill; ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); ctx.fill();
    } else if (op.t === 'text') {
      ctx.font = `${op.bold ? 'bold ' : ''}${op.size}px ${fontFamily}`; ctx.fillStyle = op.color; ctx.fillText(op.str, op.x, op.y);
    } else if (op.t === 'image') {
      const image = images[op.key];
      if (op.clip) { ctx.save(); ctx.beginPath(); ctx.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h); ctx.clip(); }
      ctx.drawImage(image.src, op.x, op.y, op.w, op.h);
      if (op.clip) ctx.restore();
    }
  }
  return canvas;
}
export async function renderReport(data) {
  validateReportData(data);
  const style = data.config.report;
  if (document.fonts?.ready) await document.fonts.ready;
  const images = await loadReportImages(data);
  const layout = layoutReport(data, { measure: canvasMeasure(style.fontFamily), imageSize: key => ({ width: images[key].width, height: images[key].height }) });
  return drawLayoutToCanvas({ ...layout, fontFamily: style.fontFamily }, images, style.scale);
}
export function downloadBlob(blob, filename) {
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
export function downloadText(text, filename) { downloadBlob(new Blob(['﻿',text],{type:'text/plain;charset=utf-8'}),filename); }
export async function exportReport(data, format='pdf') {
  const name=`ENAEX-SMP-${data.meta.date.replaceAll('-','')}-cenario-${data.scenario.id}`;
  if(format==='png') {
    const canvas=await renderReport(data);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('O navegador não conseguiu gerar a imagem.');downloadBlob(blob,`${name}.png`);return {canvas,blob,filename:`${name}.png`};
  }
  if(format!=='pdf')throw new Error('Formato de exportação não suportado.');
  const Constructor=globalThis.jspdf?.jsPDF;
  if(!Constructor)throw new Error('Biblioteca PDF indisponível. Recarregue a página.');
  const pdf=buildReportPdf(data,Constructor,await loadReportImages(data));
  const blob=pdf.output('blob');downloadBlob(blob,`${name}.pdf`);return {blob,filename:`${name}.pdf`};
}
