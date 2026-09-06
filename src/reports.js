/** Browser-only, deterministic A4 report renderer. Geographic decisions belong to core.js. */
const number = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function coordinateDMM(value, axis) {
  if (!Number.isFinite(Number(value))) throw new Error('Coordenada inválida no relatório.');
  const absolute = Math.abs(Number(value));
  let degrees = Math.floor(absolute), minutes = Math.round((absolute - degrees) * 60000) / 1000;
  if (minutes >= 60) { degrees++; minutes = 0; }
  const hemisphere = axis === 'lat' ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  return `${String(degrees).padStart(3, '0')} ${minutes.toFixed(3).padStart(6, '0')} ${hemisphere}`;
}
function reportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Informe a data da campanha.');
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
function validate(data) {
  if (!data?.config?.report) throw new Error('Configuração visual do relatório indisponível.');
  if (!data.plan?.origin || !data.scenario?.points?.length) throw new Error('Calcule e selecione um cenário antes de exportar.');
  if (data.scenario.points.length > data.config.communities.length) throw new Error('O relatório suporta os sete pontos do catálogo.');
  reportDate(data.meta.date);
  if (!Number.isFinite(data.plan.origin.radius) || data.scenario.points.some(p => !Number.isFinite(p.distance))) throw new Error('Distâncias não calculadas no cenário.');
  for (const p of [data.plan.origin, ...data.scenario.points]) {
    if (![p.lat, p.lon, p.x, p.y].every(Number.isFinite)) throw new Error('Coordenadas incompletas no cenário.');
  }
}
export function buildWhatsAppMessage(data, template) {
  validate(data);
  const { meta, plan, scenario } = data;
  const fields = {
    data: reportDate(meta.date), horario: meta.time || 'A definir', regiao: meta.blastName || `${plan.polygons?.length || 0} áreas de desmonte`,
    areas: (plan.polygons || []).map(p => `${p.name}: ${p.azimuth === null || p.azimuth === undefined ? 'direção não informada' : `${number(p.azimuth, 0)}°`}`).join('\n'),
    operacao: meta.operation || data.config.defaults?.operation || '', cenario: `${scenario.id} - ${scenario.title}`,
    quantidade: String(scenario.points.length), latitude: coordinateDMM(plan.origin.lat, 'lat'), longitude: coordinateDMM(plan.origin.lon, 'lon'),
    leste: number(plan.origin.x, 4), norte: number(plan.origin.y, 4), zona: String(meta.crsZone || 24),
    pontos: scenario.points.map((p, i) => `${i + 1}. ${p.name}${p.fixed ? ' (FIXO)' : ''}\n   ${coordinateDMM(p.lat, 'lat')} | ${coordinateDMM(p.lon, 'lon')}\n   Distância à origem: ${number(p.distance, 0)} m`).join('\n'),
    observacoes: meta.notes || '', responsavel: meta.responsible || '',
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
function wrapped(ctx, text, width) {
  const result = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(line ? `${line} ${word}` : word).width > width && line) { result.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    result.push(line);
  }
  return result;
}
function fitImage(ctx, source, x, y, w, h) {
  const ratio = Math.min(w / source.width, h / source.height);
  ctx.drawImage(source, x + (w - source.width * ratio) / 2, y + (h - source.height * ratio) / 2, source.width * ratio, source.height * ratio);
}
export function renderDistanceDiagram(data, width = 1100, height = 750) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const { plan, scenario } = data, style = data.config.report;
  ctx.fillStyle = style.ink; ctx.fillRect(0, 0, width, height);
  const points = plan.communities || scenario.points;
  const all = [...points, plan.origin];
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(width * .60 / Math.max(1, maxX - minX), height * .64 / Math.max(1, maxY - minY));
  const px = x => width / 2 + (x - (minX + maxX) / 2) * scale;
  const py = y => height / 2 - (y - (minY + maxY) / 2) * scale;
  const selected = new Set(scenario.points.map(p => p.id));
  ctx.textBaseline = 'middle';
  for (const p of points) {
    const x = px(p.x), y = py(p.y), ox = px(plan.origin.x), oy = py(plan.origin.y);
    ctx.strokeStyle = selected.has(p.id) ? style.accent : '#9aa6b0'; ctx.lineWidth = selected.has(p.id) ? 3 : 1;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = selected.has(p.id) ? style.accent : '#d5dde3'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    const labelX = x < ox ? x - 10 : x + 10;
    ctx.textAlign = x < ox ? 'right' : 'left'; ctx.font = `bold ${width * .015}px ${style.fontFamily}`; ctx.fillStyle = '#ffffff';
    const name = `${p.name.replace(/comunidade de /i, '').replace(/barragem de /i, 'B. ')}${p.fixed ? ' (FIXO)' : ''}`;
    ctx.fillText(name, labelX, y - 11, Math.max(40, Math.min(width * .25, x < ox ? labelX - 12 : width - labelX - 12)));
    ctx.font = `${width * .014}px ${style.fontFamily}`;
    ctx.fillText(`${number(p.distance, 0)} m`, labelX, y + 10);
  }
  ctx.fillStyle = style.accent; ctx.beginPath(); ctx.arc(px(plan.origin.x), py(plan.origin.y), 9, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `${width * .017}px ${style.fontFamily}`;
  ctx.fillText('N ↑', width * .04, height * .06); ctx.fillText('DISTÂNCIAS À ORIGEM · ESQUEMA EM PLANTA', width * .04, height * .95);
  return canvas;
}
export async function renderReport(data) {
  validate(data);
  const { config, meta, plan, scenario } = data, style = config.report;
  if (document.fonts?.ready) await document.fonts.ready;
  const [brand, footerLogo] = await Promise.all([loadImage(style.brandAsset), loadImage(style.footerLogoAsset)]);
  const W = style.width, H = style.height, scale = style.scale;
  const canvas = document.createElement('canvas'); canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const unit = W / 1240, m = style.margin, gap = W * .028, col = (W - m * 2 - gap) / 2, right = m + col + gap;
  function font(size, bold = false) { ctx.font = `${bold ? 'bold ' : ''}${size * unit}px ${style.fontFamily}`; }
  function text(str, x, y, width, size = 18, color = style.ink, bold = false, lineHeight = 1.35) {
    font(size, bold); ctx.fillStyle = color;
    const lines = wrapped(ctx, str, width); const step = size * unit * lineHeight;
    for (const line of lines) { ctx.fillText(line, x, y); y += step; }
    return y;
  }
  function heading(str, x, y, width = col) { return text(str, x, y, width, 20, style.accent, true) + 9 * unit; }
  function table(headers, rows, x, y, widths, bodySize = 17) {
    const total = widths.reduce((a,b) => a+b,0); font(bodySize, true);
    const headerHeight = 42 * unit;
    ctx.fillStyle = style.ink; ctx.fillRect(x, y, total, headerHeight);
    let dx = x;
    headers.forEach((h,i) => { text(h,dx+9*unit,y+11*unit,widths[i]-18*unit,bodySize,'#fff',true);dx+=widths[i]; });
    y += headerHeight;
    for (const row of rows) {
      font(bodySize); const rowHeight = Math.max(43 * unit, ...row.map((cell, i) => (wrapped(ctx, cell, widths[i] - 18 * unit).length * bodySize * 1.3 + 16) * unit));
      ctx.fillStyle = '#f3f4f5'; ctx.fillRect(x,y,total,rowHeight); dx = x;
      row.forEach((cell,i) => { ctx.strokeStyle='#bcc3c8';ctx.lineWidth=.8;ctx.strokeRect(dx,y,widths[i],rowHeight);text(cell,dx+9*unit,y+8*unit,widths[i]-18*unit,bodySize);dx+=widths[i]; });
      y += rowHeight;
    }
    return y;
  }
  ctx.drawImage(brand, 0, 0, W, style.headerHeight);
  text('SISMOGRAFIA', W * .28, style.headerHeight * .25, W * .5, 38, style.accent, true);
  text('MONITORAMENTO PROPOSTO', W * .28, style.headerHeight * .49, W * .64, 21, '#fff');
  text(meta.operation || config.defaults.operation, W * .28, style.headerHeight * .65, W * .68, 19, '#fff');
  let y = style.headerHeight + 31 * unit;
  y = heading(`SISMOGRAFIA - ${reportDate(meta.date)}`, m, y);
  y += 25 * unit;
  y = heading('AVANÇO PLANEJADO',m,y);
  const count = scenario.points.length;
  const schedule = meta.time ? `para as ${meta.time}` : 'com horário a definir';
  const instruments = count === 1 ? '1 sismógrafo instalado no ponto selecionado' : `${count} sismógrafos distribuídos nos pontos selecionados`;
  y = text(`Monitoramento sismográfico programado ${schedule}, com ${instruments}.`,m,y,col,18) + 9*unit;
  y = text(`Desmonte: ${meta.blastName || `${plan.polygons?.length || 0} áreas importadas`}.`,m,y,col,18) + 23*unit;
  y = heading('LOCALIZAÇÃO DO PONTO',m,y);
  y = text('Origem no centro do menor círculo que contém todas as poligonais importadas.',m,y,col,18) + 23*unit;
  y = heading('COORDENADAS - ORIGEM DO DESMONTE',m,y);
  y = table(['Eixo','Coordenada'],[['Latitude',coordinateDMM(plan.origin.lat,'lat')],['Longitude',coordinateDMM(plan.origin.lon,'lon')],['Norte (Y)',`${number(plan.origin.y,4)} m`],['Leste (X)',`${number(plan.origin.x,4)} m`]],m,y,[col*.34,col*.66]);
  y = text(`${meta.crsName || config.crs.find(item => item.id === (meta.crs || config.defaults.crs))?.name || meta.crs} · Raio envolvente: ${number(plan.origin.radius,1)} m`,m,y+10*unit,col,15,style.muted) + 24*unit;
  y = heading('MONITORAMENTO PROPOSTO',m,y);
  y = table(['Ponto de monitoramento','Coordenadas / distância'],scenario.points.map(p=>[`${p.name}${p.fixed ? ' (FIXO)' : ''}`,`${coordinateDMM(p.lat,'lat')}\n${coordinateDMM(p.lon,'lon')}\n${number(p.distance,0)} m da origem`]),m,y,[col*.45,col*.55],scenario.points.length>4?15:17);
  let ry = style.headerHeight+31*unit;
  ry = heading('SITUAÇÃO ESPACIAL DO DESMONTE',right,ry);
  const diagram = data.diagramCanvas || renderDistanceDiagram(data);
  const diagramH = col * .65;
  fitImage(ctx,diagram,right,ry,col,diagramH); ry+=diagramH+20*unit;
  if (data.mapCanvas) {
    const mapH = col*.78; ctx.fillStyle='#f1f4f4';ctx.fillRect(right,ry,col,mapH);
    fitImage(ctx,data.mapCanvas,right,ry,col,mapH);ry+=mapH+9*unit;
    ry = text(data.mapCaption || 'Posição do desmonte e dos pontos de monitoramento. Distâncias em planta.',right,ry,col,14,style.muted)+20*unit;
  }
  ry = heading('OBSERVAÇÕES',right,ry);
  ry = text(scenario.description || '',right,ry,col,17)+14*unit;
  ry = text(meta.notes || 'Confirmar acesso, autorização de instalação e acoplamento dos instrumentos antes da campanha.',right,ry,col,17)+20*unit;
  ry = heading('DIRECIONAMENTO INFORMADO',right,ry);
  const directionLimit = style.maxDirectionRows || 4;
  const directions = (plan.polygons || []).slice(0, directionLimit).map(p=>`${p.name.length > 42 ? p.name.slice(0, 39) + '…' : p.name}: ${p.azimuth === null || p.azimuth === undefined ? 'não informado' : `${number(p.azimuth,0)}°`}`);
  if ((plan.polygons || []).length > directionLimit) directions.push(`+ ${plan.polygons.length - directionLimit} áreas. Relação completa de direções no projeto JSON e na mensagem TXT.`);
  ry = text(directions.join('\n') || 'Não informado',right,ry,col,16)+16*unit;
  const footerTop=H-style.footerHeight;
  if (Math.max(y,ry)>footerTop-36*unit) throw new Error('O conteúdo excede a página. Reduza as observações ou os nomes das áreas para exportar sem cortes.');
  ctx.fillStyle=style.ink;ctx.fillRect(0,footerTop,W,style.footerHeight);
  const logoBox = style.footerLogoBox;
  fitImage(ctx,footerLogo,logoBox.x*unit,footerTop+logoBox.y*unit,logoBox.width*unit,logoBox.height*unit);
  text(meta.responsible || config.defaults.responsible,W*.23,footerTop+27*unit,W*.71,16,'#fff');
  return canvas;
}
export function downloadBlob(blob, filename) {
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
export function downloadText(text, filename) { downloadBlob(new Blob(['\ufeff',text],{type:'text/plain;charset=utf-8'}),filename); }
export async function exportReport(data, format='pdf') {
  const canvas=await renderReport(data), name=`ENAEX-SMP-${data.meta.date.replaceAll('-','')}-cenario-${data.scenario.id}`;
  if(format==='png') {
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('O navegador não conseguiu gerar a imagem.');downloadBlob(blob,`${name}.png`);return {canvas,blob,filename:`${name}.png`};
  }
  if(format!=='pdf')throw new Error('Formato de exportação não suportado.');
  const Constructor=globalThis.jspdf?.jsPDF;
  if(!Constructor)throw new Error('Biblioteca PDF indisponível. Recarregue a página.');
  const pdf=new Constructor({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pdf.setProperties({title:`Sismografia - ${data.meta.date} - Cenário ${data.scenario.id}`,author:data.meta.responsible||'ENAEX',subject:data.scenario.title});
  pdf.addImage(canvas,'PNG',0,0,210,297,undefined,'FAST');
  const blob=pdf.output('blob');downloadBlob(blob,`${name}.pdf`);return {canvas,blob,filename:`${name}.pdf`};
}
