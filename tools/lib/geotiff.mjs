// Leitor de GeoTIFF de um canal float32, usado somente pelo build da superfície (tools/build-superficie.mjs).
// Aceita TIFF clássico com imagem em faixas ou blocos, compressão nenhuma, LZW ou deflate e predictor 1.
// Qualquer outra característica é recusada com a causa; nada é adivinhado.
import {inflateSync} from 'node:zlib';

const TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8};
const TAG = {
  ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259, SampleFormat: 339,
  SamplesPerPixel: 277, PlanarConfig: 284, Predictor: 317, RowsPerStrip: 278, StripOffsets: 273, StripByteCounts: 279,
  TileWidth: 322, TileLength: 323, TileOffsets: 324, TileByteCounts: 325,
  ModelPixelScale: 33550, ModelTiepoint: 33922, ModelTransformation: 34264,
  GeoKeyDirectory: 34735, GeoDoubleParams: 34736, GeoAsciiParams: 34737, GdalNoData: 42113,
};
const GEO_KEY = {GTModelType: 1024, GTRasterType: 1025, ProjectedCSType: 3072};
const SUPPORTED_COMPRESSION = new Set([1, 5, 8, 32946]);

function fail(message) {
  throw new Error(`GeoTIFF não suportado: ${message}`);
}

/** Decodifica LZW do TIFF (bits do mais significativo, largura antecipada). Para ao encontrar EOI. */
export function lzwDecode(input, expectedLength) {
  const out = Buffer.alloc(expectedLength);
  let outPos = 0;
  let dict = [];
  let codeLength = 9;
  let prev = null;
  let bitBuf = 0;
  let bitCount = 0;
  let pos = 0;
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push(Buffer.from([i]));
    dict.push(null, null); // 256 = clear, 257 = fim
    codeLength = 9;
    prev = null;
  };
  reset();
  for (;;) {
    while (bitCount < codeLength) {
      if (pos >= input.length) return out.subarray(0, outPos);
      bitBuf = ((bitBuf << 8) | input[pos++]) & 0xffffff;
      bitCount += 8;
    }
    bitCount -= codeLength;
    const code = (bitBuf >>> bitCount) & ((1 << codeLength) - 1);
    bitBuf &= (1 << bitCount) - 1;
    if (code === 256) { reset(); continue; }
    if (code === 257) break;
    let entry;
    if (prev === null) {
      if (code > 255) fail('LZW com código inválido no início do bloco');
      entry = dict[code];
    } else if (code < dict.length && dict[code]) {
      entry = dict[code];
    } else if (code === dict.length) {
      entry = Buffer.concat([prev, prev.subarray(0, 1)]);
    } else {
      fail('LZW com código fora da tabela');
    }
    if (outPos + entry.length > expectedLength) fail('bloco LZW maior que o esperado');
    entry.copy(out, outPos);
    outPos += entry.length;
    if (prev !== null && dict.length < 4096) dict.push(Buffer.concat([prev, entry.subarray(0, 1)]));
    prev = entry;
    if (dict.length + 1 >= (1 << codeLength) && codeLength < 12) codeLength++;
  }
  return out.subarray(0, outPos);
}

/**
 * Lê o GeoTIFF do canal float32 e devolve a grade, a origem do canto superior esquerdo e o tamanho do pixel.
 * @returns {{width:number,height:number,origin:{x:number,y:number},cellSize:number,epsg:number|null,nodata:number|null,data:Float32Array}}
 */
export function readGeoTiff(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes.length < 16) fail('arquivo muito pequeno');
  const order = bytes.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') fail('cabeçalho TIFF ausente');
  const le = order === 'II';
  const u16 = o => (le ? bytes.readUInt16LE(o) : bytes.readUInt16BE(o));
  const u32 = o => (le ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o));
  const f64 = o => (le ? bytes.readDoubleLE(o) : bytes.readDoubleBE(o));
  const f32 = o => (le ? bytes.readFloatLE(o) : bytes.readFloatBE(o));
  if (u16(2) !== 42) fail('somente TIFF clássico (BigTIFF não é aceito)');

  const readEntry = o => {
    const type = u16(o + 2), count = u32(o + 4), size = TYPE_SIZE[type];
    if (!size) return null;
    const total = size * count;
    const at = total <= 4 ? o + 8 : u32(o + 8);
    if (at + total > bytes.length) fail('campo do TIFF aponta para fora do arquivo');
    if (type === 2) return {type, text: bytes.toString('latin1', at, at + count).replace(/\0+$/, '')};
    const values = new Array(count);
    for (let i = 0; i < count; i++) {
      const p = at + i * size;
      if (type === 1 || type === 7) values[i] = bytes[p];
      else if (type === 3) values[i] = u16(p);
      else if (type === 4) values[i] = u32(p);
      else if (type === 5) values[i] = u32(p) / u32(p + 4);
      else if (type === 11) values[i] = f32(p);
      else if (type === 12) values[i] = f64(p);
      else if (type === 16) values[i] = Number(bytes.readBigUInt64LE(p));
    }
    return {type, values};
  };

  const ifdOffset = u32(4);
  const entryCount = u16(ifdOffset);
  const tags = new Map();
  for (let i = 0; i < entryCount; i++) {
    const o = ifdOffset + 2 + i * 12;
    tags.set(u16(o), readEntry(o));
  }
  const num = name => {
    const entry = tags.get(TAG[name]);
    return entry?.values?.[0];
  };
  const list = name => tags.get(TAG[name])?.values ?? null;

  const width = num('ImageWidth'), height = num('ImageLength');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail('dimensões ausentes');
  // SamplesPerPixel ausente vale 1 pela especificação TIFF (o PIL, por exemplo, não grava a tag para canal único).
  if ((num('SamplesPerPixel') ?? 1) !== 1) fail('apenas um canal (elevação) é suportado');
  if (num('BitsPerSample') !== 32 || num('SampleFormat') !== 3) fail('apenas float32 é suportado');
  const compression = num('Compression') ?? 1;
  if (!SUPPORTED_COMPRESSION.has(compression)) fail(`compressão ${compression} não suportada`);
  if ((num('Predictor') ?? 1) !== 1) fail('predictor diferente de 1 não é suportado');
  if ((num('PlanarConfig') ?? 1) !== 1) fail('organização planar não suportada');
  if (tags.has(TAG.ModelTransformation)) fail('ModelTransformationTag (rotação/cisalhamento) não é suportada');

  const scale = list('ModelPixelScale');
  const tiepoint = list('ModelTiepoint');
  if (!scale || scale.length < 2 || !tiepoint || tiepoint.length < 6) fail('georreferenciamento ausente (ModelPixelScale/ModelTiepoint)');
  if (tiepoint[0] !== 0 || tiepoint[1] !== 0) fail('a âncora do TIFF precisa estar no pixel (0,0)');
  if (Math.abs(scale[0] - scale[1]) > 1e-9) fail('pixel não quadrado');

  // Chaves GeoTIFF: datum/CRS (3072 = EPSG da projeção) e tipo de raster (1 = área, 2 = ponto).
  const keyDir = list('GeoKeyDirectory') ?? [];
  const doubles = list('GeoDoubleParams') ?? [];
  const keys = new Map();
  for (let i = 4; i + 3 < keyDir.length; i += 4) {
    const [id, location, , value] = keyDir.slice(i, i + 4);
    keys.set(id, location === 0 ? value : doubles[value]);
  }
  const rasterType = keys.get(GEO_KEY.GTRasterType) ?? 1;
  const epsg = keys.get(GEO_KEY.ProjectedCSType) ?? null;
  const cellSize = scale[0];
  // Em PixelIsPoint a âncora está no centro do pixel; o canto superior esquerdo é meio pixel antes.
  const half = rasterType === 2 ? 0.5 : 0;
  const origin = {x: tiepoint[3] - half * cellSize, y: tiepoint[4] + half * cellSize};

  const gdalNoData = tags.get(TAG.GdalNoData)?.text;
  const nodata = gdalNoData !== undefined && gdalNoData !== '' ? Number(gdalNoData) : null;
  if (nodata !== null && !Number.isFinite(nodata)) fail('valor de NoData inválido');

  const data = new Float32Array(width * height);
  const view = (buf) => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decompress = (raw, expected) => {
    let out;
    if (compression === 1) out = raw;
    else if (compression === 5) out = lzwDecode(raw, expected);
    else out = inflateSync(raw);
    if (out.length < expected) fail('bloco de dados menor que o esperado');
    return out;
  };
  const tileWidth = num('TileWidth');
  if (tileWidth) {
    const tileLength = num('TileLength');
    const offsets = list('TileOffsets'), counts = list('TileByteCounts');
    if (!tileLength || !offsets || !counts) fail('blocos incompletos');
    const across = Math.ceil(width / tileWidth), down = Math.ceil(height / tileLength);
    // Bloco faltando não pode virar terreno em 0 m: a contagem precisa cobrir a imagem inteira.
    if (offsets.length !== across * down || counts.length !== across * down) fail(`blocos: esperados ${across * down}, encontrados ${offsets.length}`);
    const expected = tileWidth * tileLength * 4;
    offsets.forEach((offset, t) => {
      const raw = bytes.subarray(offset, offset + counts[t]);
      const block = view(decompress(raw, expected));
      const x0 = (t % across) * tileWidth, y0 = Math.floor(t / across) * tileLength;
      for (let y = 0; y < tileLength && y0 + y < height; y++) {
        for (let x = 0; x < tileWidth && x0 + x < width; x++) {
          data[(y0 + y) * width + x0 + x] = block.getFloat32((y * tileWidth + x) * 4, le);
        }
      }
    });
  } else {
    const offsets = list('StripOffsets'), counts = list('StripByteCounts');
    if (!offsets || !counts) fail('faixas ausentes');
    const rowsPerStrip = num('RowsPerStrip') ?? height;
    const strips = Math.ceil(height / rowsPerStrip);
    if (offsets.length !== strips || counts.length !== strips) fail(`faixas: esperadas ${strips}, encontradas ${offsets.length}`);
    offsets.forEach((offset, s) => {
      const y0 = s * rowsPerStrip, rows = Math.min(rowsPerStrip, height - y0);
      const raw = bytes.subarray(offset, offset + counts[s]);
      const block = view(decompress(raw, rows * width * 4));
      for (let i = 0; i < rows * width; i++) data[y0 * width + i] = block.getFloat32(i * 4, le);
    });
  }

  return {width, height, origin, cellSize, epsg, nodata, data};
}
