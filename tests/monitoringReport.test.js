import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMonitoringReport, issuedLabel, layoutReport, periodLabel, reportFileName} from '../src/monitoringReportPdf.js';
import {measureWith} from '../src/monitoringGantt.js';
import {reportSettings, hexRgb} from '../src/monitoringReportConfig.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const monitoring = config.monitoring;
const snapshot = JSON.parse(fs.readFileSync(new URL('../data/monitoramento.json', import.meta.url), 'utf8'));
const loadJsPDF = async () => (await import('jspdf')).jsPDF;
const rs = reportSettings(monitoring);
// PNG 1x1 válido: basta para o jsPDF incorporar os logotipos nos testes.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const assets = {client: {src: PIXEL, format: 'PNG', width: 241, height: 103}, enaex: {src: PIXEL, format: 'PNG', width: 400, height: 120}};
const issued = new Date(2026, 10, 6, 9, 5);
const pageMeasure = async () => measureWith(new (await loadJsPDF())({orientation: 'landscape', unit: 'pt', format: [rs.page.width, rs.page.height]}), rs.font);

/** Operações de desenho das três páginas para um período (sem gerar o PDF). */
async function pagesFor(year, month, source = 'api', data = snapshot) {
  return layoutReport({data, monitoring, year, month, source, issued, assets, measure: await pageMeasure()});
}
const texts = ops => ops.filter(o => o.t === 'text');
const kpiValues = cover => texts(cover).filter(o => o.size === rs.sizes.kpiValue).map(o => o.s);
/** Contagem independente, feita direto no JSON (sem as funções do módulo de dados). */
function expectedFor(year, month) {
  const perPoint = {};
  const record = snapshot.years[String(year)]?.months?.[String(month)];
  for (const name of monitoring.points) perPoint[name] = record ? record.points[name].length : 0;
  return {blasts: record ? record.desmontes.length : 0, monitorings: Object.values(perPoint).reduce((s, n) => s + n, 0), perPoint};
}

test('configuração do relatório: chaves, cores e logotipos são validados com o caminho da chave', () => {
  const missing = structuredClone(monitoring);
  delete missing.report.layout.gridTop;
  assert.throws(() => reportSettings(missing), /monitoring\.report\.layout\.gridTop/);
  const badColor = structuredClone(monitoring);
  badColor.report.colors.title = 'vermelho';
  assert.throws(() => reportSettings(badColor), /Cor inválida em config\.json \(monitoring\.report\.colors\.title\)/);
  const noLabel = structuredClone(monitoring);
  delete noLabel.report.labels.footer;
  assert.throws(() => reportSettings(noLabel), /monitoring\.report\.labels\.footer/);
  const badRatio = structuredClone(monitoring);
  badRatio.report.layout.monthColumnRatio = 1.4;
  assert.throws(() => reportSettings(badRatio), /monitoring\.report\.layout\.monthColumnRatio/);
  assert.throws(
    () => reportSettings(monitoring, {fileExists: p => !p.endsWith('mineracao-vale-verde.png')}),
    /Logotipo ausente: monitoring\.report\.logos\.client \(assets\/mineracao-vale-verde\.png\)/,
  );
  assert.equal(hexRgb('#B5121B')[0], 0xB5);
});

test('capa: filtros aplicados e indicadores conferem com os dados (outubro/2026)', async () => {
  const [cover] = await pagesFor(2026, 10);
  const exp = expectedFor(2026, 10);
  const yearBlasts = Array.from({length: 12}, (_, i) => expectedFor(2026, i + 1).blasts).reduce((s, n) => s + n, 0);
  const yearMonitorings = Array.from({length: 12}, (_, i) => expectedFor(2026, i + 1).monitorings).reduce((s, n) => s + n, 0);
  const monthsWithMonitoring = Array.from({length: 12}, (_, i) => expectedFor(2026, i + 1).monitorings).filter(n => n > 0).length;
  const zero = Object.values(exp.perPoint).filter(n => n === 0).length;
  assert.deepEqual(kpiValues(cover), [String(exp.blasts), String(exp.monitorings), String(zero), String(yearBlasts), String(yearMonitorings), String(monthsWithMonitoring)]);
  const all = texts(cover).map(o => o.s);
  assert.ok(all.includes('Outubro de 2026'), 'período na faixa de filtros');
  assert.ok(all.includes('Todos os 7 pontos cadastrados'), 'pontos informados como filtro');
  assert.ok(all.includes('Planilha de acompanhamento no Google Drive'), 'fonte ao vivo');
  assert.ok(all.includes('06/11/2026 09:05'), 'data de emissão');
  // Tabela por comunidade: uma linha por ponto, valores do mês e do ano, e o total.
  for (const name of monitoring.points) {
    const row = all.indexOf(name);
    assert.ok(row >= 0, `ponto ${name} na tabela`);
  }
  assert.ok(all.includes(String(exp.monitorings)), 'total do mês na tabela');
});

test('filtros diferentes mudam capa, grade e resumo; fonte em cópia publicada aparece na capa', async () => {
  const [cover, grid, annual] = await pagesFor(2026, 2, 'snapshot');
  assert.ok(texts(cover).some(o => o.s === 'Fevereiro de 2026'), 'período da capa acompanha o filtro');
  assert.ok(texts(cover).some(o => o.s === monitoring.report.labels.sourceSnapshot), 'fonte: última cópia publicada');
  assert.ok(texts(cover).some(o => o.s === 'MONITORAMENTO SISMOGRÁFICO - FEVEREIRO 2026'), 'título da capa com o mês filtrado');
  assert.ok(texts(grid).some(o => o.s === 'GRADE DE MONITORAMENTO - FEVEREIRO 2026'), 'título da grade com o mês filtrado');
  assert.ok(texts(annual).some(o => o.s === 'RESUMO ANUAL - 2026'), 'título do resumo com o ano filtrado');
});

test('grade do mês: uma marca D por desmonte, M por monitoramento e N para dias fora do calendário', async () => {
  const [, grid] = await pagesFor(2026, 2);   // fevereiro de 2026 tem 28 dias
  const exp = expectedFor(2026, 2);
  const count = label => texts(grid).filter(o => o.s === label && o.size === rs.sizes.mark).length;
  // A legenda tem uma marca de cada tipo; as demais são as células da grade.
  assert.equal(count(monitoring.layout.dayMarker), exp.blasts + 1);
  assert.equal(count(monitoring.layout.monitoredMarker), exp.monitorings + 1);
  assert.equal(count(monitoring.layout.notInMonthMarker), monitoring.points.length * 3 + 1, 'dias 29 a 31 em cada ponto');
});

test('mês sem registro: aviso na grade e todos os meses listados como sem dados no resumo', async () => {
  const [cover, grid, annual] = await pagesFor(2024, 3);
  assert.ok(texts(grid).some(o => o.s === monitoring.report.labels.noRecordWarning), 'aviso de mês sem registro');
  const note = texts(annual).find(o => o.s.startsWith('Sem dados de monitoramento na planilha: '));
  assert.ok(note, 'nota de meses sem registro');
  assert.ok(note.s.includes('JANEIRO') && note.s.includes('DEZEMBRO'), 'todos os 12 meses listados');
  assert.deepEqual(kpiValues(cover).slice(0, 2), ['0', '0'], 'indicadores do mês zerados sem dados');
});

test('resumo anual: 12 meses, linha Total e o mês do relatório destacado no título', async () => {
  const [, , annual] = await pagesFor(2026, 10);
  const monthRows = texts(annual).filter(o => /^\d{2}\. [A-ZÇÃ]+$/.test(o.s));
  assert.equal(monthRows.length, 12);
  const selected = monthRows.find(o => o.s === '10. OUTUBRO');
  assert.deepEqual(selected.color, hexRgb(monitoring.report.colors.title), 'mês do relatório em vermelho de título');
  assert.ok(selected.bold, 'mês do relatório em negrito');
  assert.ok(texts(annual).some(o => o.s === 'Total' && o.bold));
});

test('todo texto usa a paleta de monitoring.report.colors e todo desenho fica dentro das margens', async () => {
  const palette = Object.values(rs.colors).map(c => JSON.stringify(c));
  const pages = await pagesFor(2026, 10);
  const M = rs.margin, W = rs.page.width, H = rs.page.height;
  pages.forEach((ops, i) => {
    for (const op of ops) {
      if (op.t === 'text') {
        assert.ok(palette.includes(JSON.stringify(op.color)), `página ${i + 1}: cor fora da paleta em "${op.s}"`);
        assert.ok(op.y > 0 && op.y < H, `página ${i + 1}: texto fora da página em y=${op.y}`);
        assert.ok(op.x >= 0 && op.x <= W, `página ${i + 1}: texto fora da página em x=${op.x}`);
      }
      if (op.t === 'line') {
        assert.ok(Math.min(op.x1, op.x2) >= M - 0.01 && Math.max(op.x1, op.x2) <= W - M + 0.01, `página ${i + 1}: filete além da margem`);
      }
      if (op.t === 'rect' || op.t === 'image') {
        assert.ok(op.x >= 0 && op.x + op.w <= W + 0.01, `página ${i + 1}: retângulo fora da página`);
      }
    }
    const footer = ops.find(o => o.t === 'line' && o.y1 === rs.layout.footerRuleY);
    assert.ok(footer, `página ${i + 1}: filete do rodapé`);
    assert.deepEqual(footer.color, rs.colors.footerRule);
  });
});

test('PDF: três páginas no tamanho do modelo, título com período e nome de arquivo por mês', async () => {
  const JsPDF = await loadJsPDF();
  const doc = buildMonitoringReport(JsPDF, {data: snapshot, monitoring, year: 2026, month: 10, source: 'api', issued, assets});
  assert.equal(doc.getNumberOfPages(), 3);
  assert.ok(Math.abs(doc.getPageWidth(1) - rs.page.width) < 0.01);
  assert.ok(Math.abs(doc.getPageHeight(1) - rs.page.height) < 0.01);
  assert.equal(reportFileName(monitoring, 2026, 10), 'relatorio-monitoramento-2026-10.pdf');
  assert.equal(reportFileName(monitoring, 2026, 2), 'relatorio-monitoramento-2026-02.pdf');
  const bytes = Buffer.from(doc.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
});

test('sem dados de monitoramento, o relatório é recusado; sem logotipos também', async () => {
  const JsPDF = await loadJsPDF();
  assert.throws(() => buildMonitoringReport(JsPDF, {data: snapshot, monitoring, year: 2026, month: 10, source: 'error', issued, assets}), /Sem dados de monitoramento/);
  assert.throws(() => buildMonitoringReport(JsPDF, {data: snapshot, monitoring, year: 2026, month: 10, source: 'api', issued, assets: {client: assets.client}}), /Logotipos do relatório/);
});

test('texto de data e período seguem o formato pt-BR sem valores fixos', () => {
  assert.equal(issuedLabel(new Date(2026, 10, 6, 9, 5)), '06/11/2026 09:05');
  assert.equal(periodLabel(monitoring, 2026, 10), 'Outubro de 2026');
  assert.equal(periodLabel(monitoring, 2026, 3), 'Março de 2026');
});

test('o módulo do relatório não contém cores nem medidas fixas no código (tudo vem de config.json)', () => {
  const source = fs.readFileSync(new URL('../src/monitoringReportPdf.js', import.meta.url), 'utf8');
  assert.equal((source.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length, 0, 'nenhuma cor literal');
});
