/**
 * Superfície georreferenciada da mina (fundo do esquema de distâncias).
 * Módulo puro, usado pelo build (tools/build-superficie.mjs, tools/build.mjs) e pelo navegador (reports.js).
 * Contrato: config.json (bloco surface) e data/superficie.json (gerado). Erros sempre com a causa; nada é preenchido por padrão.
 */
export const SURFACE_KIND = 'superficie-mina';
export const SURFACE_SCHEMA_VERSION = 1;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) throw new Error(`Cor inválida na superfície: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const isPositive = v => Number.isFinite(v) && v > 0;
const isPositiveInt = v => Number.isInteger(v) && v > 0;

/** Valida config.surface contra config.crs. Lança com o caminho da chave que falhou. */
export function validateSurfaceConfig(config) {
  const s = config?.surface;
  if (!s || typeof s !== 'object') throw new Error('Bloco surface ausente em config.json.');
  if (typeof s.enabled !== 'boolean') throw new Error('surface.enabled deve ser verdadeiro ou falso.');
  if (!s.source || typeof s.source.crs !== 'string' || !/^EPSG:\d+$/.test(s.source.crs)) throw new Error('surface.source.crs inválido (ex.: EPSG:29194).');
  if (typeof s.source.definition !== 'string' || !s.source.definition.includes('+proj=')) throw new Error('surface.source.definition ausente ou inválida (definição proj4).');
  if (!isPositiveInt(s.source.maxSourceBytes)) throw new Error('surface.source.maxSourceBytes deve ser inteiro positivo.');
  if (!Array.isArray(config.crs) || !config.crs.some(c => c.id === s.targetCrs)) throw new Error(`surface.targetCrs (${s.targetCrs}) precisa existir em config.crs.`);
  if (typeof s.imagePath !== 'string' || !s.imagePath.endsWith('.png')) throw new Error('surface.imagePath deve apontar para um PNG.');
  if (typeof s.metadataPath !== 'string' || !s.metadataPath.endsWith('.json')) throw new Error('surface.metadataPath deve apontar para um JSON.');
  const h = s.hillshade;
  if (!h || !Number.isFinite(h.azimuthDegrees) || h.azimuthDegrees < 0 || h.azimuthDegrees >= 360) throw new Error('surface.hillshade.azimuthDegrees deve estar em [0, 360).');
  if (!Number.isFinite(h.altitudeDegrees) || h.altitudeDegrees <= 0 || h.altitudeDegrees > 90) throw new Error('surface.hillshade.altitudeDegrees deve estar em (0, 90].');
  if (!isPositive(h.zFactor)) throw new Error('surface.hillshade.zFactor deve ser positivo.');
  const p = s.palette;
  if (!p || !isPositive(p.gamma)) throw new Error('surface.palette.gamma deve ser positivo.');
  for (const key of ['shadeDark', 'shadeLight', 'nodata']) if (!HEX.test(p[key] ?? '')) throw new Error(`surface.palette.${key} precisa ser cor hexadecimal #RRGGBB.`);
  if (!s.footprint || !isPositive(s.footprint.maxResidualMeters)) throw new Error('surface.footprint.maxResidualMeters deve ser positivo.');
  return s;
}

/** Valida data/superficie.json contra config.surface. Tolerância de geometria vem de surface.footprint. */
export function validateSurfaceMetadata(meta, config) {
  const s = config.surface;
  const fail = msg => { throw new Error(`Superfície da mina (data/superficie.json): ${msg}`); };
  if (meta?.schemaVersion !== SURFACE_SCHEMA_VERSION) fail('schemaVersion diferente do esperado');
  if (meta.kind !== SURFACE_KIND) fail('tipo de arquivo diferente de superficie-mina');
  if (meta.source?.crs !== s.source.crs) fail(`CRS de origem ${meta.source?.crs} diferente de ${s.source.crs}`);
  if (meta.source?.definition !== s.source.definition) fail('definição proj4 de origem diferente de surface.source.definition');
  // O PNG precisa ter sido gerado com o sombreamento e a paleta atuais; mudança na configuração exige novo build:superficie.
  const h = s.hillshade, p = s.palette, m = meta.method;
  if (m?.hillshade?.azimuthDegrees !== h.azimuthDegrees || m?.hillshade?.altitudeDegrees !== h.altitudeDegrees || m?.hillshade?.zFactor !== h.zFactor) {
    fail('sombreamento gravado diferente de surface.hillshade; gere de novo com npm run build:superficie');
  }
  for (const key of ['shadeDark', 'shadeLight', 'gamma', 'nodata']) {
    if (m?.palette?.[key] !== p[key]) fail(`paleta gravada diferente de surface.palette.${key}; gere de novo com npm run build:superficie`);
  }
  if (!SHA256.test(meta.source?.sha256 ?? '')) fail('hash do TIF ausente');
  if (!isPositiveInt(meta.source?.width) || !isPositiveInt(meta.source?.height)) fail('dimensões da grade de origem inválidas');
  if (!isPositive(meta.source?.pixelSizeMeters)) fail('tamanho do pixel inválido');
  if (meta.crs !== s.targetCrs) fail(`CRS ${meta.crs} diferente de surface.targetCrs (${s.targetCrs})`);
  const b = meta.bounds;
  if (!b || ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) || b.maxX <= b.minX || b.maxY <= b.minY) fail('limites (bounds) inválidos');
  if (meta.image?.path !== s.imagePath) fail('caminho da imagem diferente de surface.imagePath');
  if (!isPositiveInt(meta.image.width) || !isPositiveInt(meta.image.height) || !isPositiveInt(meta.image.bytes)) fail('dimensões ou tamanho da imagem inválidos');
  if (!SHA256.test(meta.image.sha256 ?? '')) fail('hash da imagem ausente');
  // A área do PNG em metros precisa bater com os limites (mesmo pixel do TIF), dentro da tolerância de geometria.
  const tol = s.footprint.maxResidualMeters;
  if (Math.abs((b.maxX - b.minX) - meta.image.width * meta.source.pixelSizeMeters) > tol
    || Math.abs((b.maxY - b.minY) - meta.image.height * meta.source.pixelSizeMeters) > tol) fail('limites não correspondem às dimensões da imagem');
  return meta;
}

/**
 * Leva os limites de uma CRS para outra pelos quatro cantos (bounding box).
 * Com CRS iguais devolve cópia. `proj4` é injetado: o navegador usa globalThis.proj4, o build usa o pacote.
 */
export function footprintInCrs(bounds, fromId, toId, proj4) {
  if (fromId === toId) return {minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY};
  const corners = [[bounds.minX, bounds.minY], [bounds.maxX, bounds.minY], [bounds.minX, bounds.maxY], [bounds.maxX, bounds.maxY]]
    .map(([x, y]) => proj4(fromId, toId, [x, y]));
  const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
  return {minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys)};
}
