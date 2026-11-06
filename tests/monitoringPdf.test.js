import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMonitoringPdf, monthBottomColumns} from '../src/monitoringPdf.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const monitoring = config.monitoring;
const snapshot = JSON.parse(fs.readFileSync(new URL('../data/monitoramento.json', import.meta.url), 'utf8'));
const loadJsPDF = async () => (await import('jspdf')).jsPDF;

test('PDF do mês cabe em uma página; o anual tem os 12 meses e o resumo', async () => {
  const JsPDF = await loadJsPDF();
  const month = buildMonitoringPdf(JsPDF, {data: snapshot, monitoring, mode: 'month', year: 2026, month: 2});
  assert.equal(month.getNumberOfPages(), 1);
  const year = buildMonitoringPdf(JsPDF, {data: snapshot, monitoring, mode: 'year', year: 2026, month: 10});
  assert.equal(year.getNumberOfPages(), 13);
});

test('bloco inferior do mês: legenda, contagens e tabela não se sobrepõem e ficam dentro da margem', async () => {
  const JsPDF = await loadJsPDF();
  const width = new JsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'}).internal.pageSize.getWidth();
  const cols = monthBottomColumns(monitoring, width);
  assert.ok(cols.legend.x + cols.legend.w <= cols.kpi.x, 'legenda termina antes dos cartões');
  assert.ok(cols.kpi.x + cols.kpi.w <= cols.community.x, 'cartões terminam antes da tabela');
  assert.ok(cols.community.x + cols.community.w <= width - monitoring.pdf.margin + 0.001, 'tabela respeita a margem direita');
  // Espaço para o nome mais longo ("Comunidade Lagoa do Mel") e a contagem.
  assert.ok(cols.community.w >= 150, `tabela com ${cols.community.w.toFixed(1)} pt`);
});

test('PDF exige as chaves de layout, tamanhos e cores em config.json (sem valor padrão silencioso)', async () => {
  const JsPDF = await loadJsPDF();
  const missingKey = structuredClone(monitoring);
  delete missingKey.pdf.layout.kpiWidth;
  assert.throws(
    () => buildMonitoringPdf(JsPDF, {data: snapshot, monitoring: missingKey, mode: 'month', year: 2026, month: 2}),
    /monitoring\.pdf\.layout\.kpiWidth/,
  );
  const badColor = structuredClone(monitoring);
  badColor.pdf.colors.ink = 'azul';
  assert.throws(
    () => buildMonitoringPdf(JsPDF, {data: snapshot, monitoring: badColor, mode: 'month', year: 2026, month: 2}),
    /Cor inválida em config\.json/,
  );
});

test('página do planejador mantém rótulos e perde os parágrafos de instrução removidos', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('Configuração da campanha'), 'rótulo do painel permanece');
  assert.ok(!html.includes('Importe as áreas de desmonte, compare os cenários'), 'parágrafo do painel removido');
  for (const removed of ['field-help', 'direction-note', 'method-note', 'mon-login-hint', 'Arquivos processados no seu navegador']) {
    assert.ok(!html.includes(removed), `${removed} removido da página`);
  }
  assert.ok(!monitoring.ui.loginHint, 'texto de login removido do config.json');
});
