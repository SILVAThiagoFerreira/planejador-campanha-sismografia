// Leitura de planilhas .xlsx (OOXML) com JSZip, sem dependências adicionais.
// Devolve, para cada aba, uma matriz densa rows[linha-1][coluna-1] com valores
// de texto ou número, incluindo o valor em cache das fórmulas.
import JSZip from 'jszip';

const decodeXml = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const textRuns = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('');

/** Converte "AG" em 33 (1-based). */
export function columnNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Converte 33 em "AG". */
export function columnLetters(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Lê todas as abas do arquivo.
 * @param {Buffer|Uint8Array} buffer conteúdo do .xlsx
 * @returns {Promise<Array<{name:string, rows:Array<Array<string|number>>}>>}
 */
export async function readXlsxSheets(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = path => zip.file(path);
  const workbookFile = entry('xl/workbook.xml');
  if (!workbookFile) throw new Error('Arquivo não é uma planilha .xlsx válida (xl/workbook.xml ausente).');
  const workbook = await workbookFile.async('string');
  const relsFile = entry('xl/_rels/workbook.xml.rels');
  if (!relsFile) throw new Error('Relações da planilha ausentes (xl/_rels/workbook.xml.rels).');
  const rels = await relsFile.async('string');
  const targets = new Map();
  for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = m[0].match(/\sId="([^"]+)"/)?.[1];
    const target = m[0].match(/\sTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, ''));
  }
  const sharedFile = entry('xl/sharedStrings.xml');
  const shared = [];
  if (sharedFile) {
    const sst = await sharedFile.async('string');
    for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(si[1]));
  }
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const name = decodeXml(m[0].match(/\sname="([^"]*)"/)?.[1] ?? '');
    const rid = m[0].match(/\sr:id="([^"]+)"/)?.[1];
    const target = targets.get(rid);
    const file = target && entry(`xl/${target}`);
    if (!file) throw new Error(`Aba "${name}" sem arquivo de planilha correspondente.`);
    sheets.push({name, rows: parseSheetXml(await file.async('string'), shared)});
  }
  return sheets;
}

/** Converte o XML de uma aba em matriz densa. */
export function parseSheetXml(xml, shared = []) {
  const cells = [];
  let maxRow = 0, maxCol = 0;
  for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1];
    const ref = attrs.match(/(?:^|\s)r="([A-Z]+)(\d+)"/);
    if (!ref) continue;
    const col = columnNumber(ref[1]), row = Number(ref[2]);
    const type = attrs.match(/\st="(\w+)"/)?.[1];
    const body = c[2] || '';
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    const inline = body.match(/<is>([\s\S]*?)<\/is>/)?.[1];
    let value;
    if (type === 's') value = shared[Number(raw)] ?? '';
    else if (inline !== undefined) value = textRuns(inline);
    else if (raw === undefined) continue;
    else if (type === 'str' || type === 'e' || type === 'b') value = decodeXml(raw);
    else value = Number.isFinite(Number(raw)) && raw.trim() !== '' ? Number(raw) : decodeXml(raw);
    if (value === '' || value === undefined) continue;
    cells.push({row, col, value});
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  const rows = Array.from({length: maxRow}, () => Array(maxCol).fill(''));
  for (const {row, col, value} of cells) rows[row - 1][col - 1] = value;
  return rows;
}
