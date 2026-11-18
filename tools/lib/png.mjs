// Codificador PNG de imagem indexada (8 bits, paleta de 256 cores, sem transparência).
// Filtros adaptativos por linha (None/Sub/Up/Average/Paeth) e deflate nível 9. Só depende de node:zlib.
import {deflateSync} from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Filtra uma linha escolhendo o filtro de menor soma de valores absolutos (heurística padrão do PNG). */
function filterRow(cur, prev, width) {
  let best = null, bestScore = Infinity, bestFilter = 0;
  for (let f = 0; f < 5; f++) {
    const line = Buffer.alloc(width);
    let score = 0;
    for (let x = 0; x < width; x++) {
      const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0, raw = cur[x];
      let v;
      if (f === 0) v = raw;
      else if (f === 1) v = raw - a;
      else if (f === 2) v = raw - b;
      else if (f === 3) v = raw - ((a + b) >> 1);
      else v = raw - paeth(a, b, c);
      v &= 255;
      line[x] = v;
      score += v < 128 ? v : 256 - v;
    }
    if (score < bestScore) { bestScore = score; best = line; bestFilter = f; }
  }
  return Buffer.concat([Buffer.from([bestFilter]), best]);
}

/**
 * Gera o PNG. `indices` tem width*height bytes (uma por pixel); `palette` tem 768 bytes (256 cores RGB).
 * @returns {Buffer}
 */
export function encodePalettePng({width, height, indices, palette}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Dimensões PNG inválidas.');
  if (indices.length !== width * height) throw new Error('Quantidade de índices não confere com as dimensões.');
  if (palette.length !== 768) throw new Error('A paleta PNG precisa de 256 cores RGB.');
  const rows = [];
  let prev = Buffer.alloc(width);
  for (let y = 0; y < height; y++) {
    const cur = Buffer.from(indices.buffer, indices.byteOffset + y * width, width);
    rows.push(filterRow(cur, prev, width));
    prev = cur;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profundidade de bits
  header[9] = 3; // tipo de cor: indexada
  header[10] = 0; header[11] = 0; header[12] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from(palette)),
    chunk('IDAT', deflateSync(Buffer.concat(rows), {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
