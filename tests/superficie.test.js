import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
import proj4 from 'proj4';
import {readGeoTiff, lzwDecode} from '../tools/lib/geotiff.mjs';
import {hillshadeIndices, buildPalette} from '../tools/lib/hillshade.mjs';
import {encodePalettePng, crc32} from '../tools/lib/png.mjs';
import {validateSurfaceConfig, validateSurfaceMetadata, footprintInCrs, hexToRgb, SURFACE_KIND} from '../src/superficie.js';
import {shapeIconPath, validateAreaIconConfig} from '../src/areaIcon.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

// Codificador LZW de teste (bits do mais significativo, largura antecipada), para gerar entradas reais de TIFF.
function lzwEncode(input) {
  const out = [];
  let acc = 0, nbits = 0, table, next, width;
  const put = (code, w) => {
    acc = ((acc << w) | code) & 0xffffff;
    nbits += w;
    while (nbits >= 8) { nbits -= 8; out.push((acc >>> nbits) & 0xff); }
    acc &= (1 << nbits) - 1;
  };
  const reset = () => { table = new Map(); next = 258; width = 9; };
  reset();
  put(256, width);
  let w = '';
  for (const ch of Buffer.from(input).toString('latin1')) {
    const wc = w + ch;
    if (w === '' || wc.length === 1 || table.has(wc)) { w = wc; continue; }
    put(w.length === 1 ? w.charCodeAt(0) : table.get(w), width);
    table.set(wc, next++);
    if (next >= (1 << width) && width < 12) width++;
    if (next >= 4000) { put(256, width); reset(); }
    w = ch;
  }
  if (w !== '') put(w.length === 1 ? w.charCodeAt(0) : table.get(w), width);
  put(257, width);
  if (nbits > 0) out.push((acc << (8 - nbits)) & 0xff);
  return Buffer.from(out);
}

function floatBytes(values, le) {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => (le ? buf.writeFloatLE(v, i * 4) : buf.writeFloatBE(v, i * 4)));
  return buf;
}

/** Monta um GeoTIFF mínimo: tiles ou faixas, compressão, predictor e chaves de georreferenciamento configuráveis. */
function makeTiff({width, height, values, tile = 0, compression = 1, predictor = 1, le = true, bits = 32, sampleFormat = 3,
  pixelIsPoint = false, rotate = false, epsg = 29194, nodata = '-32767', origin = [748169.99375, 8930830.00032517], cell = 1, rowsPerStrip = 2,
  dropLast = false, omitSamples = false, samples = 1}) {
  const blocks = [];
  let offsets, counts;
  if (tile) {
    const across = Math.ceil(width / tile), down = Math.ceil(height / tile);
    for (let t = 0; t < across * down; t++) {
      const x0 = (t % across) * tile, y0 = Math.floor(t / across) * tile;
      const block = new Array(tile * tile).fill(0);
      for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
        if (x0 + x < width && y0 + y < height) block[y * tile + x] = values[(y0 + y) * width + x0 + x];
      }
      blocks.push(block);
    }
  } else {
    for (let y0 = 0; y0 < height; y0 += rowsPerStrip) {
      const rows = Math.min(rowsPerStrip, height - y0);
      blocks.push(Array.from(values.slice(y0 * width, (y0 + rows) * width)));
    }
  }
  const encoded = blocks.map(b => {
    const raw = floatBytes(b, le);
    return compression === 5 ? lzwEncode(raw) : raw;
  });
  let pos = 8;
  offsets = encoded.map(e => { const o = pos; pos += e.length; return o; });
  counts = encoded.map(e => e.length);
  // dropLast omite o último bloco do índice (o dado continua no arquivo): o leitor precisa recusar.
  const keep = dropLast ? encoded.length - 1 : encoded.length;
  const external = [];
  const entries = [];
  const add = (tag, type, vals) => entries.push({tag, type, vals});
  add(256, 4, [width]);
  add(257, 4, [height]);
  add(258, 3, [bits]);
  add(259, 3, [compression]);
  add(262, 3, [1]);
  if (tile) { add(324, 4, offsets.slice(0, keep)); add(325, 4, counts.slice(0, keep)); add(322, 4, [tile]); add(323, 4, [tile]); }
  else { add(273, 4, offsets.slice(0, keep)); add(279, 4, counts.slice(0, keep)); add(278, 4, [rowsPerStrip]); }
  if (!omitSamples) add(277, 3, [samples]);
  add(284, 3, [1]);
  if (predictor !== 1) add(317, 3, [predictor]);
  add(339, 3, [sampleFormat]);
  add(33550, 12, [cell, cell, 0]);
  add(33922, 12, [0, 0, 0, origin[0], origin[1], 0]);
  if (rotate) add(34264, 12, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  add(34735, 3, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, pixelIsPoint ? 2 : 1, 3072, 0, 1, epsg]);
  if (nodata !== null) add(42113, 2, [...Buffer.from(nodata + '\0', 'latin1')]);
  entries.sort((a, b) => a.tag - b.tag);
  // Valores que não cabem em 4 bytes vão para uma área própria antes do IFD.
  const sizes = {2: 1, 3: 2, 4: 4, 12: 8};
  for (const e of entries) {
    const total = e.vals.length * sizes[e.type];
    if (e.type === 2 || total > 4) { e.at = pos; const buf = Buffer.alloc(total); writeVals(buf, 0, e, le); external.push(buf); pos += total; }
  }
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
  const writeU16 = (o, v) => (le ? ifd.writeUInt16LE(v, o) : ifd.writeUInt16BE(v, o));
  const writeU32 = (o, v) => (le ? ifd.writeUInt32LE(v, o) : ifd.writeUInt32BE(v, o));
  writeU16(0, entries.length);
  entries.forEach((e, i) => {
    const o = 2 + i * 12;
    writeU16(o, e.tag); writeU16(o + 2, e.type); writeU32(o + 4, e.vals.length);
    const total = e.vals.length * sizes[e.type];
    if (e.type === 2 || total > 4) writeU32(o + 8, e.at);
    else { const tmp = Buffer.alloc(4); writeVals(tmp, 0, e, le); tmp.copy(ifd, o + 8); }
  });
  const header = Buffer.alloc(8);
  header.write(le ? 'II' : 'MM', 0, 'latin1');
  if (le) { header.writeUInt16LE(42, 2); header.writeUInt32LE(pos, 4); } else { header.writeUInt16BE(42, 2); header.writeUInt32BE(pos, 4); }
  return Buffer.concat([header, ...encoded, ...external, ifd]);
}

function writeVals(buf, base, e, le) {
  let o = base;
  for (const v of e.vals) {
    if (e.type === 2) { buf[o++] = v; continue; }
    if (e.type === 3) { if (le) buf.writeUInt16LE(v, o); else buf.writeUInt16BE(v, o); o += 2; }
    else if (e.type === 4) { if (le) buf.writeUInt32LE(v, o); else buf.writeUInt32BE(v, o); o += 4; }
    else { if (le) buf.writeDoubleLE(v, o); else buf.writeDoubleBE(v, o); o += 8; }
  }
}

const RAMP = Array.from({length: 6 * 5}, (_, i) => 100 + (i % 6) * 2.5 + Math.floor(i / 6) * 0.5);

test('LZW decodes the encoder output across code-width changes', () => {
  const bytes = Buffer.from(Array.from({length: 4000}, (_, i) => (i * 37 + (i >> 3)) & 0xff));
  assert.deepEqual(lzwDecode(lzwEncode(bytes), bytes.length), bytes);
  const runs = Buffer.alloc(3000, 7);
  assert.deepEqual(lzwDecode(lzwEncode(runs), runs.length), runs);
});

test('reads tiled LZW float32 GeoTIFF with origin, cell size, EPSG and NoData', () => {
  const tif = readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, tile: 4, compression: 5}));
  assert.equal(tif.width, 6);
  assert.equal(tif.height, 5);
  assert.equal(tif.cellSize, 1);
  assert.equal(tif.epsg, 29194);
  assert.equal(tif.nodata, -32767);
  assert.equal(tif.origin.x, 748169.99375);
  assert.equal(tif.origin.y, 8930830.00032517);
  assert.deepEqual(Array.from(tif.data), RAMP.map(v => Math.fround(v)));
});

test('reads striped uncompressed big-endian GeoTIFF and applies half-pixel shift for PixelIsPoint', () => {
  const tif = readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, le: false, pixelIsPoint: true, origin: [1000, 2000], cell: 2}));
  assert.deepEqual(Array.from(tif.data), RAMP.map(v => Math.fround(v)));
  assert.equal(tif.cellSize, 2);
  assert.equal(tif.origin.x, 999);
  assert.equal(tif.origin.y, 2001);
});

test('rejects unsupported GeoTIFF features with the cause', () => {
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, bits: 16, sampleFormat: 1})), /float32/);
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, predictor: 2})), /predictor/);
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, rotate: true})), /ModelTransformation/);
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, compression: 99})), /compressão 99/);
  assert.throws(() => readGeoTiff(Buffer.from('not a tiff at all, sorry!')), /cabeçalho TIFF/);
});

test('hillshade is 1 + round(254·sin(altitude)) on flat ground and follows the NW light direction', () => {
  const cfg = {azimuthDegrees: 315, altitudeDegrees: 45, zFactor: 1};
  const flat = hillshadeIndices(new Float32Array(25).fill(200), 5, 5, 1, cfg, null);
  // Índice 0 é reservado ao NoData: o plano com sol a 45° cai em 1 + round(254 · 0,7071) = 181.
  assert.equal(flat.indices[12], 181);
  assert.equal(flat.indices[12], 1 + Math.round(254 * Math.sin(Math.PI / 4)));
  // Encosta suave (0,5 m/m) subindo para leste: vira para oeste, em direção à luz do NW, e fica mais clara que o plano.
  // Encosta muito íngreme (3 m/m) ficaria mais escura que o plano com sol a 45°, o que é físico, por isso não é usada.
  const eastUp = Float32Array.from({length: 25}, (_, i) => (i % 5) * 0.5);
  const westUp = Float32Array.from({length: 25}, (_, i) => (4 - (i % 5)) * 0.5);
  const east = hillshadeIndices(eastUp, 5, 5, 1, cfg, null);
  const west = hillshadeIndices(westUp, 5, 5, 1, cfg, null);
  assert.ok(east.indices[12] > flat.indices[12], `leste ${east.indices[12]} deveria ser mais claro que plano`);
  assert.ok(west.indices[12] < flat.indices[12], `oeste ${west.indices[12]} deveria ser mais escuro que plano`);
});

test('NoData pixels are excluded from counts and rendered with the darkest index', () => {
  const values = new Float32Array(9).fill(50);
  values[0] = -32767;
  values[8] = Number.NaN;
  const r = hillshadeIndices(values, 3, 3, 1, {azimuthDegrees: 315, altitudeDegrees: 45, zFactor: 1}, -32767);
  assert.equal(r.nodataCount, 2);
  assert.equal(r.validCount, 7);
  assert.equal(r.indices[0], 0);
  assert.equal(r.indices[8], 0);
  assert.equal(r.elevationMin, 50);
  assert.equal(r.elevationMax, 50);
});

test('palette reserves index 0 for NoData and runs from the dark to the light colour in 1..255', () => {
  const palette = buildPalette({shadeDark: '#101010', shadeLight: '#f0f0f0', gamma: 1, nodata: '#253442'}, hexToRgb);
  assert.deepEqual([...palette.subarray(0, 3)], [0x25, 0x34, 0x42], 'índice 0 = cor do NoData');
  assert.deepEqual([...palette.subarray(3, 6)], [16, 16, 16], 'índice 1 = tom mais escuro');
  assert.deepEqual([...palette.subarray(128 * 3, 128 * 3 + 3)], [128, 128, 128], 'meio da escala');
  assert.deepEqual([...palette.subarray(255 * 3, 255 * 3 + 3)], [240, 240, 240], 'índice 255 = tom mais claro');
  assert.throws(() => hexToRgb('azul'), /Cor inválida/);
});

test('PNG round-trips: filters undo to the original indices and CRCs are valid', () => {
  const width = 7, height = 6;
  const indices = Uint8Array.from({length: width * height}, (_, i) => (i * 29) % 256);
  const palette = Uint8Array.from({length: 768}, (_, i) => i % 256);
  const png = encodePalettePng({width, height, indices, palette});
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let pos = 8;
  const chunks = {};
  while (pos < png.length) {
    const len = png.readUInt32BE(pos), type = png.toString('latin1', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    assert.equal(png.readUInt32BE(pos + 8 + len), crc32(png.subarray(pos + 4, pos + 8 + len)), `CRC de ${type}`);
    chunks[type] = data;
    pos += 12 + len;
  }
  assert.equal(chunks.IEND.length, 0);
  assert.equal(png.readUInt32BE(png.length - 4), 0xae426082, 'CRC conhecido do chunk IEND');
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
  assert.equal(chunks.IHDR[9], 3, 'tipo de cor indexada');
  assert.equal(chunks.PLTE.length, 768);
  const raw = inflateSync(chunks.IDAT);
  assert.equal(raw.length, height * (width + 1));
  // Desfaz os filtros e compara com os índices originais.
  const out = Buffer.alloc(width * height);
  let prev = Buffer.alloc(width);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (width + 1)];
    const cur = Buffer.alloc(width);
    for (let x = 0; x < width; x++) {
      const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0, v = raw[y * (width + 1) + 1 + x];
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f];
      assert.ok(f >= 0 && f <= 4, 'filtro conhecido');
      cur[x] = (v + pred) & 255;
    }
    cur.copy(out, y * width);
    prev = cur;
  }
  assert.deepEqual(out, Buffer.from(indices));
});

test('surface config must reference a known target CRS and valid colours', () => {
  assert.equal(validateSurfaceConfig(config).targetCrs, 'EPSG:31984');
  assert.throws(() => validateSurfaceConfig({...config, surface: {...config.surface, targetCrs: 'EPSG:9999'}}), /targetCrs/);
  assert.throws(() => validateSurfaceConfig({...config, surface: {...config.surface, palette: {...config.surface.palette, shadeDark: 'preto'}}}), /shadeDark/);
  assert.throws(() => validateSurfaceConfig({...config, surface: undefined}), /surface ausente/);
  assert.throws(() => validateSurfaceConfig({...config, surface: {...config.surface, palette: {...config.surface.palette, nodata: 'x'}}}), /nodata/);
});

test('GeoTIFF with a missing strip or tile is refused instead of becoming terrain at 0 m', () => {
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, dropLast: true})), /faixas: esperadas 3, encontradas 2/);
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, tile: 4, compression: 5, dropLast: true})), /blocos: esperados 4, encontrados 3/);
});

test('missing SamplesPerPixel means one band; a multi-band file is refused', () => {
  const tif = readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, omitSamples: true}));
  assert.deepEqual(Array.from(tif.data), RAMP.map(v => Math.fround(v)));
  assert.throws(() => readGeoTiff(makeTiff({width: 6, height: 5, values: RAMP, samples: 3})), /apenas um canal/);
});

const goodMeta = () => ({
  schemaVersion: 1, kind: SURFACE_KIND,
  source: {fileName: 'mina.tif', sha256: 'a'.repeat(64), crs: 'EPSG:29194', definition: config.surface.source.definition, width: 1299, height: 1906, pixelSizeMeters: 1, nodataPixels: 0},
  crs: 'EPSG:31984',
  method: {hillshade: config.surface.hillshade, palette: config.surface.palette},
  bounds: {minX: 748135.47, minY: 8928879.89, maxX: 749434.48, maxY: 8930785.9},
  image: {path: config.surface.imagePath, format: 'PNG', width: 1299, height: 1906, bytes: 10, sha256: 'b'.repeat(64)},
});

test('surface metadata is accepted only when it matches the config and the image geometry', () => {
  assert.equal(validateSurfaceMetadata(goodMeta(), config).crs, 'EPSG:31984');
  assert.throws(() => validateSurfaceMetadata({...goodMeta(), crs: 'EPSG:32724'}, config), /CRS/);
  assert.throws(() => validateSurfaceMetadata({...goodMeta(), bounds: {minX: 2, minY: 0, maxX: 1, maxY: 1}}, config), /limites/);
  const off = goodMeta();
  off.bounds.maxX += 10;
  assert.throws(() => validateSurfaceMetadata(off, config), /não correspondem/);
  assert.throws(() => validateSurfaceMetadata({...goodMeta(), image: {...goodMeta().image, path: 'outro.png'}}, config), /imagePath/);
});

test('metadata must match the config datum and the rendering method that produced the image', () => {
  const datum = {...goodMeta(), source: {...goodMeta().source, definition: '+proj=utm +zone=23 +south'}};
  assert.throws(() => validateSurfaceMetadata(datum, config), /definição proj4/);
  const azimuth = {...goodMeta(), method: {hillshade: {...config.surface.hillshade, azimuthDegrees: 0}, palette: config.surface.palette}};
  assert.throws(() => validateSurfaceMetadata(azimuth, config), /sombreamento/);
  const nodata = {...goodMeta(), method: {hillshade: config.surface.hillshade, palette: {...config.surface.palette, nodata: '#000000'}}};
  assert.throws(() => validateSurfaceMetadata(nodata, config), /paleta gravada diferente de surface\.palette\.nodata/);
});

test('area icon config is validated before the app draws it', () => {
  const icon = config.visual.areaIcon;
  assert.equal(validateAreaIconConfig(icon), icon);
  assert.throws(() => validateAreaIconConfig(undefined), /ausente/);
  assert.throws(() => validateAreaIconConfig({...icon, color: 'vermelho'}), /visual\.areaIcon\.color/);
  assert.throws(() => validateAreaIconConfig({...icon, padding: 20}), /visual\.areaIcon\.padding/);
  assert.throws(() => validateAreaIconConfig({...icon, maxPoints: 1}), /visual\.areaIcon\.maxPoints/);
  assert.throws(() => validateAreaIconConfig({...icon, fillOpacity: 2}), /visual\.areaIcon\.fillOpacity/);
});

test('corner transform from SAD69 UTM 24S to SIRGAS 2000 shows the expected datum shift', () => {
  proj4.defs(config.surface.source.crs, config.surface.source.definition);
  proj4.defs('EPSG:31984', config.crs.find(c => c.id === 'EPSG:31984').definition);
  const src = {minX: 748169.99375, minY: 8928924.00, maxX: 749468.99375, maxY: 8930830.00032517};
  const out = footprintInCrs(src, 'EPSG:29194', 'EPSG:31984', proj4);
  assert.ok(Math.abs((out.minX - src.minX) - -34.52) < 0.1, `dx ${out.minX - src.minX}`);
  assert.ok(Math.abs((out.minY - src.minY) - -44.1) < 0.1, `dy ${out.minY - src.minY}`);
  assert.deepEqual(footprintInCrs(src, 'EPSG:31984', 'EPSG:31984', proj4), {minX: src.minX, minY: src.minY, maxX: src.maxX, maxY: src.maxY});
});

test('area icon path is normalized, north-up and keeps proportions', () => {
  const opts = config.visual.areaIcon;
  assert.equal(shapeIconPath([{x: 0, y: 0}], opts), null);
  // Retângulo 2:1 em viewBox 40 com margem 4: escala 16; ocupa a largura inteira e fica centralizado na vertical.
  // Norte (y=1) vai para cima (SVG y menor): (0,0)->(4,28), (2,0)->(36,28), (2,1)->(36,12), (0,1)->(4,12).
  const d = shapeIconPath([{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 1}, {x: 0, y: 1}], {size: 40, padding: 4, maxPoints: 400});
  assert.equal(d, 'M4.00 28.00 L36.00 28.00 L36.00 12.00 L4.00 12.00');
});

test('dense outlines are resampled to exactly maxPoints, keeping the first and last real vertices', () => {
  const dense = Array.from({length: 1000}, (_, i) => ({x: i, y: i % 2}));
  const dd = shapeIconPath(dense, {size: 40, padding: 4, maxPoints: 100});
  assert.equal(dd.split(' L').length, 100);
  // Primeiro vértice (0,0): x = 4,00 e y = 20,02 (base inferior do retângulo de dados, norte em cima).
  assert.ok(dd.startsWith('M4.00 20.02 L'), dd.slice(0, 30));
  assert.ok(dd.endsWith(' L36.00 19.98'), dd.slice(-30));
  // Abaixo do limite nada é reamostrado: todos os vértices aparecem na mesma ordem.
  const few = shapeIconPath(dense.slice(0, 50), {size: 40, padding: 4, maxPoints: 100});
  assert.equal(few.split(' L').length, 50);
});
