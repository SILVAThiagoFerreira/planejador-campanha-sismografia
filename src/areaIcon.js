/**
 * Miniatura da forma de uma área ou linha importada, para a lista "Áreas de desmonte".
 * Gera apenas o caminho SVG (norte para cima, proporção preservada, centralizado). Não altera geometria.
 * Parâmetros vêm de config.json (visual.areaIcon); nada é assumido aqui.
 */
export function validateAreaIconConfig(icon) {
  const fail = key => { throw new Error(`visual.areaIcon.${key} inválido em config.json.`); };
  if (!icon) throw new Error('Bloco visual.areaIcon ausente em config.json.');
  for (const key of ['size', 'strokeWidth', 'lineStrokeWidth']) if (!Number.isFinite(icon[key]) || icon[key] <= 0) fail(key);
  if (!Number.isInteger(icon.maxPoints) || icon.maxPoints < 2) fail('maxPoints');
  if (!Number.isFinite(icon.padding) || icon.padding < 0 || icon.padding * 2 >= icon.size) fail('padding');
  if (!/^#[0-9a-fA-F]{6}$/.test(icon.color ?? '')) fail('color');
  if (!Number.isFinite(icon.fillOpacity) || icon.fillOpacity < 0 || icon.fillOpacity > 1) fail('fillOpacity');
  if (typeof icon.lineDash !== 'string' || !/^\d+(\.\d+)?( \d+(\.\d+)?)*$/.test(icon.lineDash)) fail('lineDash');
  return icon;
}

export function shapeIconPath(vertices, {size, padding, maxPoints}) {
  const points = (vertices || []).filter(v => Number.isFinite(v?.x) && Number.isFinite(v?.y));
  if (points.length < 2) return null;
  // Contornos com mais pontos que maxPoints são reamostrados em índices igualmente espaçados,
  // incluindo o primeiro e o último vértice: no máximo maxPoints pontos no desenho.
  const n = points.length;
  let sampled = points;
  if (n > maxPoints) {
    sampled = Array.from({length: maxPoints}, (_, i) => points[Math.round(i * (n - 1) / (maxPoints - 1))]);
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const inner = size - padding * 2;
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = inner / span;
  const offsetX = padding + (inner - (maxX - minX) * scale) / 2;
  const offsetY = padding + (inner - (maxY - minY) * scale) / 2;
  return 'M' + sampled
    .map(p => `${(offsetX + (p.x - minX) * scale).toFixed(2)} ${(offsetY + (maxY - p.y) * scale).toFixed(2)}`)
    .join(' L');
}
