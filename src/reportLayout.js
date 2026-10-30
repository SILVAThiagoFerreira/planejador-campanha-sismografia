/**
 * Layout único do relatório de uma página A4 (espaço de projeto, largura config.report.width).
 * Não toca em DOM nem em jsPDF: produz uma lista de operações (rect, line, circle, text, image)
 * consumida pelo renderizador de canvas (prévia, PNG, DOCX) e pelo gerador de PDF vetorial.
 * Textos são sempre operações de texto reais; mapa e logos são as únicas imagens.
 */
import {number, coordinateDMM, coordinateNumber, reportDate, reportNotes, validateReportData} from './reportFormat.js';

/** Fração da altura do corpo acima da linha de base (métrica Arial/Helvetica), usada para posicionar textos pelo topo. */
export const TOP_TO_MIDDLE = 0.5585;

export function situationBlock(style, columnWidth) {
  const cfg = style.situationBlock;
  if (!Number.isFinite(cfg?.heightRatio) || cfg.heightRatio <= 0 || !Number.isFinite(cfg?.diagramWidth) || cfg.diagramWidth <= 0) {
    throw new Error('Configuração do bloco de situação inválida em config.json (report.situationBlock).');
  }
  return {
    width: columnWidth, height: columnWidth * cfg.heightRatio,
    diagramWidth: cfg.diagramWidth, diagramHeight: Math.round(cfg.diagramWidth * cfg.heightRatio),
  };
}

/** Escala uma operação de um sistema local (diagrama) para o retângulo (bx, by) com fator k. */
function transformOp(op, bx, by, k) {
  const out = { ...op };
  for (const key of ['x', 'x1', 'x2']) if (key in out) out[key] = bx + out[key] * k;
  for (const key of ['y', 'y1', 'y2']) if (key in out) out[key] = by + out[key] * k;
  for (const key of ['w', 'h', 'size', 'lw', 'r']) if (key in out) out[key] = out[key] * k;
  return out;
}

/** Esquema de distâncias em planta, desenhado com operações vetoriais no sistema local dw x dh. */
function distanceDiagramOps(data, dw, dh, measure) {
  const { plan, scenario } = data, style = data.config.report;
  const ops = [{ t: 'rect', x: 0, y: 0, w: dw, h: dh, fill: style.ink }];
  const points = plan.communities || scenario.points;
  const all = [...points, plan.origin];
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(dw * .60 / Math.max(1, maxX - minX), dh * .64 / Math.max(1, maxY - minY));
  const px = x => dw / 2 + (x - (minX + maxX) / 2) * scale;
  const py = y => dh / 2 - (y - (minY + maxY) / 2) * scale;
  const selected = new Set(scenario.points.map(p => p.id));
  const ox = px(plan.origin.x), oy = py(plan.origin.y);
  // Texto com linha de base "middle" (como no canvas original), convertido para posição pelo topo.
  const label = (str, x, yMiddle, size, color, bold, alignRight, maxWidth = Infinity) => {
    let fitted = size;
    const measured = measure(str, size, bold);
    if (measured > maxWidth) fitted = size * maxWidth / measured;
    const width = measure(str, fitted, bold);
    ops.push({ t: 'text', x: alignRight ? x - width : x, y: yMiddle - TOP_TO_MIDDLE * fitted, str, size: fitted, color, bold });
  };
  for (const p of points) {
    const x = px(p.x), y = py(p.y), chosen = selected.has(p.id);
    ops.push({ t: 'line', x1: ox, y1: oy, x2: x, y2: y, color: chosen ? style.accent : '#9aa6b0', lw: chosen ? 3 : 1 });
    ops.push({ t: 'circle', x, y, r: 6, fill: chosen ? style.accent : '#d5dde3' });
    const alignRight = x < ox, labelX = alignRight ? x - 10 : x + 10;
    const name = `${p.name.replace(/comunidade de /i, '').replace(/barragem de /i, 'B. ')}${p.fixed ? ' (FIXO)' : ''}`;
    const maxWidth = Math.max(40, Math.min(dw * .25, alignRight ? labelX - 12 : dw - labelX - 12));
    label(name, labelX, y - 11, dw * .015, '#ffffff', true, alignRight, maxWidth);
    label(`${number(p.distance, 0)} m`, labelX, y + 10, dw * .014, '#ffffff', false, alignRight);
  }
  ops.push({ t: 'circle', x: ox, y: oy, r: 9, fill: style.accent });
  // Seta do norte em vetor no lugar do símbolo "↑", que não existe na codificação WinAnsi do PDF.
  const northSize = dw * .017, northY = dh * .06;
  label('N', dw * .04, northY, northSize, '#ffffff', false, false);
  const arrowX = dw * .04 + measure('N', northSize, false) + northSize * .45;
  ops.push({ t: 'line', x1: arrowX, y1: northY + northSize * .45, x2: arrowX, y2: northY - northSize * .45, color: '#ffffff', lw: 1.2 });
  ops.push({ t: 'line', x1: arrowX, y1: northY - northSize * .45, x2: arrowX - northSize * .22, y2: northY - northSize * .1, color: '#ffffff', lw: 1.2 });
  ops.push({ t: 'line', x1: arrowX, y1: northY - northSize * .45, x2: arrowX + northSize * .22, y2: northY - northSize * .1, color: '#ffffff', lw: 1.2 });
  label('DISTÂNCIAS À ORIGEM · ESQUEMA EM PLANTA', dw * .04, dh * .95, dw * .017, '#ffffff', false, false);
  return ops;
}

/**
 * Gera o layout completo do relatório.
 * @param data dados do relatório (config, meta, plan, scenario, mapCanvas?, mapCaption?)
 * @param measure (texto, tamanho em unidades do projeto, negrito) => largura em unidades do projeto
 * @param imageSize (chave) => {width, height} das imagens usadas: 'brand', 'footerLogo' e 'map'
 */
export function layoutReport(data, {measure, imageSize}) {
  validateReportData(data);
  const { config, meta, plan, scenario } = data, style = config.report;
  const W = style.width, H = style.height, m = style.margin;
  const unit = W / 1240, gap = W * .028, col = (W - m * 2 - gap) / 2, right = m + col + gap;
  const ops = [];

  function wrapped(str, px, bold, width) {
    const result = [];
    for (const paragraph of String(str ?? '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (measure(line ? `${line} ${word}` : word, px, bold) > width && line) { result.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      result.push(line);
    }
    return result;
  }
  function text(str, x, y, width, size = 18, color = style.ink, bold = false, lineHeight = 1.35) {
    const px = size * unit, step = px * lineHeight;
    for (const line of wrapped(str, px, bold, width)) { ops.push({ t: 'text', x, y, str: line, size: px, color, bold }); y += step; }
    return y;
  }
  function heading(str, x, y, width = col) { return text(str, x, y, width, 20, style.accent, true) + 9 * unit; }
  function table(headers, rows, x, y, widths, bodySize = 17) {
    const total = widths.reduce((a, b) => a + b, 0);
    const headerHeight = 42 * unit;
    ops.push({ t: 'rect', x, y, w: total, h: headerHeight, fill: style.ink });
    let dx = x;
    headers.forEach((h, i) => { text(h, dx + 9 * unit, y + 11 * unit, widths[i] - 18 * unit, bodySize, '#fff', true); dx += widths[i]; });
    y += headerHeight;
    for (const row of rows) {
      const rowHeight = Math.max(43 * unit, ...row.map((cell, i) => (wrapped(cell, bodySize * unit, false, widths[i] - 18 * unit).length * bodySize * 1.3 + 16) * unit));
      ops.push({ t: 'rect', x, y, w: total, h: rowHeight, fill: '#f3f4f5' });
      dx = x;
      row.forEach((cell, i) => {
        ops.push({ t: 'rect', x: dx, y, w: widths[i], h: rowHeight, stroke: '#bcc3c8', lw: .8 });
        text(cell, dx + 9 * unit, y + 8 * unit, widths[i] - 18 * unit, bodySize);
        dx += widths[i];
      });
      y += rowHeight;
    }
    return y;
  }
  /** Imagem com ajuste: 'stretch' preenche o retângulo, 'contain' cabe inteira, 'cover' preenche e recorta. */
  function image(key, x, y, w, h, fit) {
    const { width: iw, height: ih } = imageSize(key);
    if (fit === 'stretch') { ops.push({ t: 'image', key, x, y, w, h, clip: null }); return; }
    const ratio = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    const pw = iw * ratio, ph = ih * ratio;
    ops.push({ t: 'image', key, x: x + (w - pw) / 2, y: y + (h - ph) / 2, w: pw, h: ph, clip: fit === 'cover' ? { x, y, w, h } : null });
  }

  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#ffffff' });
  image('brand', 0, 0, W, style.headerHeight, 'stretch');
  text('SISMOGRAFIA', W * .28, style.headerHeight * .25, W * .5, 38, style.accent, true);
  text('MONITORAMENTO PROPOSTO', W * .28, style.headerHeight * .49, W * .64, 21, '#fff');
  text(meta.operation || config.defaults.operation, W * .28, style.headerHeight * .65, W * .68, 19, '#fff');
  let y = style.headerHeight + 31 * unit;
  y = heading(`SISMOGRAFIA - ${reportDate(meta.date)}`, m, y);
  y += 25 * unit;
  y = heading('AVANÇO PLANEJADO', m, y);
  const count = scenario.points.length;
  const schedule = meta.time ? `para as ${meta.time}` : 'com horário a definir';
  const instruments = count === 1 ? '1 sismógrafo instalado no ponto selecionado' : `${count} sismógrafos distribuídos nos pontos selecionados`;
  y = text(`Monitoramento sismográfico programado ${schedule}, com ${instruments}.`, m, y, col, 18) + 9 * unit;
  y = text(`Desmonte: ${meta.blastName || `${plan.polygons?.length || 0} áreas importadas`}.`, m, y, col, 18) + 23 * unit;
  y = heading('LOCALIZAÇÃO DO PONTO', m, y);
  y = text('Origem no centro do menor círculo que contém todas as áreas e linhas de pré-corte importadas.', m, y, col, 18) + 23 * unit;
  y = heading('COORDENADAS - ORIGEM DO DESMONTE', m, y);
  y = table(['Eixo', 'Coordenada'], [
    ['Latitude', coordinateDMM(plan.origin.lat, 'lat')], ['Longitude', coordinateDMM(plan.origin.lon, 'lon')],
    ['Norte (Y)', `${coordinateNumber(plan.origin.y, 4)} m`], ['Leste (X)', `${coordinateNumber(plan.origin.x, 4)} m`],
  ], m, y, [col * .34, col * .66]);
  y = text(`${meta.crsName || config.crs.find(item => item.id === (meta.crs || config.defaults.crs))?.name || meta.crs} · Raio envolvente: ${number(plan.origin.radius, 1)} m`, m, y + 10 * unit, col, 15, style.muted) + 24 * unit;
  y = heading('MONITORAMENTO PROPOSTO', m, y);
  y = table(['Ponto de monitoramento', 'Coordenadas / distância'], scenario.points.map(p => [`${p.name}${p.fixed ? ' (FIXO)' : ''}`, `${coordinateDMM(p.lat, 'lat')}\n${coordinateDMM(p.lon, 'lon')}\n${number(p.distance, 0)} m da origem`]), m, y, [col * .45, col * .55], scenario.points.length > 4 ? 15 : 17);

  let ry = style.headerHeight + 31 * unit;
  ry = heading('SITUAÇÃO ESPACIAL DO DESMONTE', right, ry);
  const block = situationBlock(style, col);
  const diagramK = block.width / block.diagramWidth;
  for (const op of distanceDiagramOps(data, block.diagramWidth, block.diagramHeight, (str, size, bold) => measure(str, size * diagramK, bold) / diagramK)) {
    ops.push(transformOp(op, right, ry, diagramK));
  }
  ry += block.height + 20 * unit;
  if (data.mapCanvas) {
    image('map', right, ry, block.width, block.height, 'cover');
    ry += block.height + 9 * unit;
    ry = text(data.mapCaption || 'Posição do desmonte e dos pontos de monitoramento. Distâncias em planta.', right, ry, col, 14, style.muted) + 20 * unit;
  }
  ry = heading('OBSERVAÇÕES', right, ry);
  ry = text(scenario.description || '', right, ry, col, 17) + 14 * unit;
  const notes = reportNotes(meta.notes, 'Confirmar acesso, autorização de instalação e acoplamento dos instrumentos antes da campanha.');
  if (notes) ry = text(notes, right, ry, col, 17) + 20 * unit;
  ry = heading('DIRECIONAMENTO INFORMADO', right, ry);
  const directionLimit = style.maxDirectionRows || 4;
  const directions = (plan.polygons || []).slice(0, directionLimit).map(p => `${p.name.length > 42 ? p.name.slice(0, 39) + '…' : p.name}: ${p.azimuth === null || p.azimuth === undefined ? 'não informado' : `${number(p.azimuth, 0)}°`}`);
  if ((plan.polygons || []).length > directionLimit) directions.push(`+ ${plan.polygons.length - directionLimit} áreas. Relação completa de direções no projeto JSON e na mensagem TXT.`);
  ry = text(directions.join('\n') || 'Não informado', right, ry, col, 16) + 16 * unit;
  const footerTop = H - style.footerHeight;
  if (Math.max(y, ry) > footerTop - 36 * unit) throw new Error('O conteúdo excede a página. Reduza as observações ou os nomes das áreas para exportar sem cortes.');
  ops.push({ t: 'rect', x: 0, y: footerTop, w: W, h: style.footerHeight, fill: style.ink });
  const logoBox = style.footerLogoBox;
  image('footerLogo', logoBox.x * unit, footerTop + logoBox.y * unit, logoBox.width * unit, logoBox.height * unit, 'contain');
  text(meta.responsible || config.defaults.responsible, W * .23, footerTop + 27 * unit, W * .71, 16, '#fff');
  return { width: W, height: H, ops };
}
