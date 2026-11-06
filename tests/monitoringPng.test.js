import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ganttPages, measureWith} from '../src/monitoringGantt.js';
import {pngFileName, pngSize} from '../src/monitoringPng.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const monitoring = config.monitoring;
const snapshot = JSON.parse(fs.readFileSync(new URL('../data/monitoramento.json', import.meta.url), 'utf8'));
const loadJsPDF = async () => (await import('jspdf')).jsPDF;
/** Medidas da página A4 paisagem, obtidas do jsPDF como na exportação. */
const pageMeasure = async () => {
  const JsPDF = await loadJsPDF();
  return measureWith(new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'}), monitoring.pdf.fontFamily);
};
const brand = {src: 'data:image/png;base64,AAAA', format: 'PNG', width: 400, height: 120};

test('PNG 4K: largura de monitoring.png.widthPx (3840 px no mínimo) e altura pela proporção da página', async () => {
  const m = await pageMeasure();
  const size = pngSize(monitoring, m.pageW, m.pageH);
  assert.equal(size.width, 3840);
  assert.ok(size.width >= monitoring.png.minWidthPx, 'largura não abaixo do mínimo');
  assert.equal(size.height, Math.round(m.pageH * 3840 / m.pageW));
  assert.ok(Math.abs(size.width / size.height - m.pageW / m.pageH) < 0.002, 'mantém a proporção do layout do PDF');
});

test('PNG recusa largura abaixo do mínimo antes de renderizar', async () => {
  const m = await pageMeasure();
  const small = structuredClone(monitoring);
  small.png.widthPx = 3000;
  assert.throws(() => pngSize(small, m.pageW, m.pageH), /abaixo do mínimo: 3000 px/);
});

test('PNG exige as chaves de monitoring.png (sem valor padrão silencioso)', async () => {
  const m = await pageMeasure();
  const missing = structuredClone(monitoring);
  delete missing.png.fontStack;
  assert.throws(() => pngSize(missing, m.pageW, m.pageH), /monitoring\.png\.fontStack/);
});

test('mês gera uma página; ano gera 12 meses e o resumo', async () => {
  const m = await pageMeasure();
  const one = ganttPages({data: snapshot, monitoring, mode: 'month', year: 2026, month: 10, assets: null, measure: m});
  assert.equal(one.length, 1);
  assert.equal(one[0].kind, 'month');
  const year = ganttPages({data: snapshot, monitoring, mode: 'year', year: 2026, month: 10, assets: null, measure: m});
  assert.equal(year.length, 13);
  assert.equal(year[0].month, 1);
  assert.equal(year[12].kind, 'summary');
});

test('logotipo entra como operação de imagem só quando há assets.brand', async () => {
  const m = await pageMeasure();
  const withLogo = ganttPages({data: snapshot, monitoring, mode: 'month', year: 2026, month: 2, assets: {brand}, measure: m})[0];
  assert.equal(withLogo.ops.filter(op => op.t === 'image').length, 1);
  const noLogo = ganttPages({data: snapshot, monitoring, mode: 'month', year: 2026, month: 2, assets: null, measure: m})[0];
  assert.equal(noLogo.ops.filter(op => op.t === 'image').length, 0);
});

test('legenda do mês fica numa linha só e dentro da margem', async () => {
  const m = await pageMeasure();
  const [page] = ganttPages({data: snapshot, monitoring, mode: 'month', year: 2026, month: 2, assets: null, measure: m});
  const labels = monitoring.labels;
  const legendOps = [labels.blankLegend, labels.monitoredLegend, labels.notInMonthLegend, labels.blastLegend]
    .map(s => page.ops.find(op => op.t === 'text' && op.s === s));
  assert.ok(legendOps.every(Boolean), 'todos os textos da legenda estão no layout');
  assert.equal(new Set(legendOps.map(op => op.y)).size, 1, 'mesma linha de base');
  const last = legendOps[legendOps.length - 1];
  const end = last.x + m.textWidth(last.s, monitoring.pdf.sizes.legend);
  assert.ok(end <= m.pageW - monitoring.pdf.margin, `legenda termina em ${end.toFixed(1)} pt`);
});

test('nomes dos arquivos PNG: mês, ZIP do ano e resumo', () => {
  assert.equal(pngFileName(monitoring, 'month', 2026, 2), 'monitoramento-2026-02-4k.png');
  assert.equal(pngFileName(monitoring, 'year', 2026), 'monitoramento-2026-anual-4k.zip');
  assert.equal(pngFileName(monitoring, 'summary', 2026), 'monitoramento-2026-resumo-4k.png');
});
