// Converte a planilha Gantt (.xlsx exportada do Google Drive) em data/monitoramento.json.
// Uso: npm run import:gantt -- "caminho/para/Tabela 1 - Gantt Chart.xlsx"
// A lista de pontos, nomes de meses, rótulos e caminhos vem de config.json (bloco monitoring).
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {basename, dirname} from 'node:path';
import {readXlsxSheets} from './lib/xlsxReader.mjs';
import {parseGanttSheet} from './lib/ganttParser.mjs';
import {validateMonitoringData} from '../src/monitoringData.js';

const log = (event, details = {}) => console.log(JSON.stringify({event, time: new Date().toISOString(), ...details}));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: npm run import:gantt -- "caminho/para/planilha.xlsx"');
  process.exit(2);
}

try {
  const raw = (await readFile('config.json', 'utf8')).replace(/\r\n/g, '\n');
  const config = JSON.parse(raw);
  const monitoring = config.monitoring;
  if (!monitoring) throw new Error('config.json sem bloco "monitoring".');
  const sheetPattern = new RegExp(monitoring.source.sheetNamePattern);

  const buffer = await readFile(inputPath);
  const sheets = await readXlsxSheets(buffer);
  log('import_started', {file: basename(inputPath), sheets: sheets.map(s => s.name)});

  const years = {};
  const importedSheets = [];
  let anomalyTotal = 0;
  for (const sheet of sheets) {
    if (!sheetPattern.test(sheet.name)) {
      log('sheet_ignored', {sheet: sheet.name, reason: 'Nome da aba não é um ano (AAAA).'});
      continue;
    }
    const year = Number(sheet.name);
    const parsed = parseGanttSheet(sheet.rows, monitoring, year);
    for (const [month, data] of Object.entries(parsed.months)) {
      anomalyTotal += data.anomalies.length;
      for (const message of data.anomalies) log('anomaly', {year, month: Number(month), message});
    }
    years[sheet.name] = {months: parsed.months};
    importedSheets.push(sheet.name);
    log('sheet_parsed', {year, months: Object.keys(parsed.months).length});
  }
  if (!importedSheets.length) throw new Error('Nenhuma aba com nome de ano (AAAA) foi encontrada.');

  const snapshot = {
    schemaVersion: 1,
    source: {
      fileName: monitoring.source.fileName,
      driveFileId: monitoring.source.driveFileId,
      importedFile: basename(inputPath),
      sheets: importedSheets,
    },
    generatedAt: new Date().toISOString(),
    years,
  };
  // A própria validação do front-end garante que o snapshot gerado é aceito pela aplicação.
  validateMonitoringData(snapshot, monitoring);

  await mkdir(dirname(monitoring.snapshotPath), {recursive: true});
  await writeFile(monitoring.snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  log('import_completed', {output: monitoring.snapshotPath, years: importedSheets, anomalies: anomalyTotal});
} catch (error) {
  log('import_failed', {message: error.message});
  console.error(error.message);
  process.exit(1);
}
