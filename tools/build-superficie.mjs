// Gera a superfície georreferenciada da mina a partir de um GeoTIFF local (npm run build:superficie -- "arquivo.tif").
// Saídas: PNG sombreado (config.surface.imagePath) e data/superficie.json (limites na CRS do projeto).
// O TIF nunca é copiado para o repositório; o caminho do arquivo não entra nos metadados (só o nome e o hash).
import {readFile, writeFile, mkdir, stat, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, dirname} from 'node:path';
import proj4 from 'proj4';
import {readGeoTiff} from './lib/geotiff.mjs';
import {hillshadeIndices, buildPalette} from './lib/hillshade.mjs';
import {encodePalettePng} from './lib/png.mjs';
import {validateSurfaceConfig, validateSurfaceMetadata, footprintInCrs, hexToRgb, SURFACE_KIND, SURFACE_SCHEMA_VERSION} from '../src/superficie.js';

const tifPath = process.argv[2];
if (!tifPath) throw Error('Informe o GeoTIFF: npm run build:superficie -- "caminho/arquivo.tif".');

const raw = (await readFile('config.json', 'utf8')).replace(/\r\n/g, '\n');
const config = JSON.parse(raw);
validateSurfaceConfig(config);
const s = config.surface;
const targetDefinition = config.crs.find(c => c.id === s.targetCrs).definition;
proj4.defs(s.source.crs, s.source.definition);
proj4.defs(s.targetCrs, targetDefinition);

const info = await stat(tifPath);
if (!info.isFile()) throw Error('O caminho informado não é um arquivo.');
if (info.size > s.source.maxSourceBytes) throw Error(`TIF maior que surface.source.maxSourceBytes (${info.size} > ${s.source.maxSourceBytes}).`);
const buffer = await readFile(tifPath);
const sourceSha256 = createHash('sha256').update(buffer).digest('hex');
const tif = readGeoTiff(buffer);
const expectedEpsg = Number(s.source.crs.split(':')[1]);
if (tif.epsg !== expectedEpsg) throw Error(`CRS do TIF (EPSG ${tif.epsg ?? 'ausente'}) diferente de surface.source.crs (${s.source.crs}).`);

// Limites de origem: a grade é 1 m por pixel, canto superior esquerdo em origin.
const cell = tif.cellSize;
const src = {minX: tif.origin.x, maxX: tif.origin.x + tif.width * cell, minY: tif.origin.y - tif.height * cell, maxY: tif.origin.y};
// Geometria: os quatro cantos transformados precisam formar um retângulo alinhado (tolerância em surface.footprint).
const corner = (x, y) => proj4(s.source.crs, s.targetCrs, [x, y]);
const [tl, tr, bl, br] = [corner(src.minX, src.maxY), corner(src.maxX, src.maxY), corner(src.minX, src.minY), corner(src.maxX, src.minY)];
const residual = Math.max(Math.abs(tl[1] - tr[1]), Math.abs(bl[1] - br[1]), Math.abs(tl[0] - bl[0]), Math.abs(tr[0] - br[0]));
if (residual > s.footprint.maxResidualMeters) throw Error(`Geometria da transformação não é retangular (${residual.toFixed(4)} m > ${s.footprint.maxResidualMeters} m).`);
const bounds = footprintInCrs(src, s.source.crs, s.targetCrs, proj4);
// Zona UTM errada ou TIF de outra região: os cantos precisam cair dentro da região de validação (config.validation.regionBounds).
const [westLon, southLat, eastLon, northLat] = config.validation.regionBounds;
for (const [x, y] of [[src.minX, src.minY], [src.maxX, src.minY], [src.minX, src.maxY], [src.maxX, src.maxY]]) {
  const [lon, lat] = proj4(s.source.crs, 'EPSG:4326', [x, y]);
  if (lon < westLon || lon > eastLon || lat < southLat || lat > northLat) {
    throw Error(`Canto do TIF fora da região de validação (${lon.toFixed(4)}, ${lat.toFixed(4)}). Confira a zona UTM e o CRS de origem.`);
  }
}
const cx = (src.minX + src.maxX) / 2, cy = (src.minY + src.maxY) / 2;
const centerTarget = corner(cx, cy);
const datumShiftMeters = {dx: Number((centerTarget[0] - cx).toFixed(3)), dy: Number((centerTarget[1] - cy).toFixed(3))};

const shade = hillshadeIndices(tif.data, tif.width, tif.height, cell, s.hillshade, tif.nodata);
const palette = buildPalette(s.palette, hexToRgb);
const png = encodePalettePng({width: tif.width, height: tif.height, indices: shade.indices, palette});
const meta = {
  schemaVersion: SURFACE_SCHEMA_VERSION,
  kind: SURFACE_KIND,
  generatedAt: new Date().toISOString(),
  source: {
    fileName: basename(tifPath), sha256: sourceSha256, crs: s.source.crs, definition: s.source.definition, width: tif.width, height: tif.height,
    pixelSizeMeters: cell, nodataPixels: shade.nodataCount,
  },
  crs: s.targetCrs,
  bounds,
  datumShiftMeters,
  method: {hillshade: s.hillshade, palette: s.palette},
  image: {path: s.imagePath, format: 'PNG', width: tif.width, height: tif.height, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex')},
};
// Valida antes de gravar: nenhum arquivo parcial vai para o repositório se algo não conferir.
validateSurfaceMetadata(meta, config);
await mkdir(dirname(s.imagePath), {recursive: true});
await mkdir(dirname(s.metadataPath), {recursive: true});
// Escrita em arquivos temporários e renomeação ao final: nunca fica PNG novo com metadados antigos.
const metaText = JSON.stringify(meta, null, 2) + '\n';
await writeFile(`${s.imagePath}.tmp`, png);
await writeFile(`${s.metadataPath}.tmp`, metaText);
await rename(`${s.imagePath}.tmp`, s.imagePath);
await rename(`${s.metadataPath}.tmp`, s.metadataPath);
// Cotas absolutas só aparecem no log local; não entram no PNG nem nos metadados.
console.log(JSON.stringify({
  event: 'surface_built', time: meta.generatedAt, file: meta.source.fileName, width: tif.width, height: tif.height,
  bytes: png.length, validPixels: shade.validCount, nodataPixels: shade.nodataCount, residualMeters: Number(residual.toFixed(6)),
  datumShiftMeters, bounds, elevationMinMeters: Number(shade.elevationMin.toFixed(2)), elevationMaxMeters: Number(shade.elevationMax.toFixed(2)),
}));
