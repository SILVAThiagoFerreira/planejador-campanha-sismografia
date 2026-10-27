import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import {
  buildAuthPayload, buildSavePayload, cellState, daysInMonth, monthSummary, monthView, parseApiResponse, toggleBlast, toggleMonitored,
  validateMonitoringData, yearSummary,
} from '../src/monitoringData.js';
import {checkRemoteAccess, MonitoringApiError, readRemoteData, saveRemoteMonth} from '../src/monitoringApi.js';
import {parseGanttSheet} from '../tools/lib/ganttParser.mjs';
import {columnLetters, columnNumber, readXlsxSheets} from '../tools/lib/xlsxReader.mjs';
import {monitoringFileName} from '../src/monitoringPdf.js';
import {renderCommunityTable, renderMonthGrid, renderYearBody} from '../src/monitoringView.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const monitoring = config.monitoring;
const snapshot = JSON.parse(fs.readFileSync(new URL('../data/monitoramento.json', import.meta.url), 'utf8'));
const [BARRAGEM, LAGOA, PAU, TORROES, CORREDOR, ITAPICURU, PICHILINGA] = monitoring.points;

/**
 * Monta uma aba sintética no mesmo layout da planilha: cabeçalho do mês, linha de D,
 * linha dos dias e uma linha por ponto. `shift` simula a divergência de março/agosto.
 */
function ganttRows({month, year, blast = [], marks = {}, shift = false, cached = null}) {
  const rows = Array.from({length: 40}, () => Array(40).fill(''));
  const set = (r, c, v) => { rows[r - 1][c - 1] = v; };
  const dim = daysInMonth(year, month);
  set(1, 2, `${String(month).padStart(2, '0')}. ${monitoring.monthNames[month - 1]}`);
  set(1, 3, monitoring.labels.tableTitle);
  set(2, 2, monitoring.labels.pointHeader);
  for (const d of blast) set(2, 2 + d, 'D');
  for (let d = 1; d <= 31; d++) set(3, 2 + d, String(d));
  monitoring.points.forEach((name, k) => {
    // Com shift, os rótulos sobem uma linha e a última linha fica sem rótulo.
    const labelRow = shift ? 3 + k : 4 + k;
    if (!(shift && k === 0)) set(labelRow, 2, name);
    const dataRow = 4 + k;
    for (let d = 1; d <= 31; d++) {
      if (d > dim) set(dataRow, 2 + d, 'N');
    }
    for (const d of marks[name] ?? []) set(dataRow, 2 + d, 'M');
  });
  if (shift) set(3, 2, monitoring.points[0]);
  if (cached) {
    set(4, 35, monitoring.labels.desmontesCount);
    set(4, 37, String(cached.desmontes));
    set(5, 35, monitoring.labels.monitoringCount);
    set(5, 37, String(cached.monitoramentos));
  }
  return rows;
}

test('configuração de monitoramento tem 7 pontos, 12 meses e cores', () => {
  assert.equal(monitoring.points.length, 7);
  assert.equal(new Set(monitoring.points).size, 7);
  assert.equal(monitoring.monthNames.length, 12);
  assert.match(monitoring.colors.monitored, /^#[0-9a-f]{6}$/i);
  assert.equal(monitoring.api.saveAction, 'save');
  assert.equal(monitoring.api.authAction, 'auth');
  for (const key of ['sourceText', 'offlineNotice', 'editUnavailable', 'saveButton', 'savedToast']) {
    assert.equal(typeof monitoring.ui[key], 'string', `texto monitoring.ui.${key}`);
    assert.ok(monitoring.ui[key].trim(), `texto monitoring.ui.${key} não vazio`);
  }
  // Nenhum texto exibido ao usuário pode citar API, configuração ou arquivo local.
  const visible = [monitoring.ui.offlineNotice, monitoring.ui.loadFailedNotice, monitoring.ui.sourceText, monitoring.ui.editUnavailable];
  for (const text of visible) assert.doesNotMatch(text, /API|config|json|snapshot|monitoring\.apiUrl/i);
  assert.equal(monitoring.ui.sourceText, 'planilha de acompanhamento no Google Drive.');
  assert.equal(monitoring.ui.offlineNotice, 'Sem conexão com o Google Drive no momento — exibindo a última cópia publicada.');
  assert.equal(monitoring.ui.editUnavailable, 'Edição indisponível no momento.');
});

test('parser lê dias com desmonte, dias monitorados e contagens em cache', () => {
  const rows = ganttRows({
    year: 2026, month: 10, blast: [3, 10, 20],
    marks: {[BARRAGEM]: [3, 10, 20], [LAGOA]: [3, 15], [PICHILINGA]: [30]},
    cached: {desmontes: 3, monitoramentos: 6},
  });
  const parsed = parseGanttSheet(rows, monitoring, 2026);
  const oct = parsed.months['10'];
  assert.deepEqual(oct.desmontes, [3, 10, 20]);
  assert.deepEqual(oct.points[BARRAGEM], [3, 10, 20]);
  assert.deepEqual(oct.points[LAGOA], [3, 15]);
  assert.deepEqual(oct.points[PICHILINGA], [30]);
  assert.deepEqual(oct.anomalies, []);
  assert.equal(Object.keys(parsed.months).length, 1);
});

test('parser sinaliza contagem em cache divergente sem corrigir em silêncio', () => {
  const rows = ganttRows({year: 2026, month: 10, blast: [3], marks: {[BARRAGEM]: [3]}, cached: {desmontes: 5, monitoramentos: 1}});
  const oct = parseGanttSheet(rows, monitoring, 2026).months['10'];
  assert.deepEqual(oct.desmontes, [3]);
  assert.ok(oct.anomalies.some(a => a.includes('Contagem informada (5) difere da calculada (1)')));
});

test('parser lê linhas deslocadas pela posição e registra cada divergência', () => {
  // Mesmo padrão de março/agosto de 2025: a linha dos dias recebe o rótulo do primeiro ponto.
  const rows = ganttRows({year: 2025, month: 3, blast: [5], marks: {[BARRAGEM]: [5, 7], [PICHILINGA]: [9]}, shift: true});
  const mar = parseGanttSheet(rows, monitoring, 2025).months['3'];
  assert.deepEqual(mar.points[BARRAGEM], [5, 7]);
  assert.deepEqual(mar.points[PICHILINGA], [9]);
  assert.ok(mar.anomalies.some(a => a.includes('linha dos dias') && a.includes(BARRAGEM)));
  assert.ok(mar.anomalies.some(a => a.includes('Linha 5') || a.includes('rótulo') && a.includes('difere')));
  assert.ok(mar.anomalies.some(a => a.includes('sem rótulo')));
});

test('parser recusa bloco sem linha de dias', () => {
  const rows = ganttRows({year: 2026, month: 10});
  rows[2] = Array(40).fill(''); // remove a linha 3 (dias)
  assert.throws(() => parseGanttSheet(rows, monitoring, 2026), /linha de dias/);
});

test('parser aponta marcação M em dia inexistente e N faltante', () => {
  const rows = ganttRows({year: 2025, month: 2, marks: {[BARRAGEM]: [29]}});
  // Remove o N do dia 29 de Lagoa (fora do calendário) para provocar anomalia.
  rows[4][2 + 29 - 1] = '';
  const feb = parseGanttSheet(rows, monitoring, 2025).months['2'];
  assert.ok(feb.anomalies.some(a => a.includes('Monitoramento "M" no dia 29')));
  assert.ok(feb.anomalies.some(a => a.includes('Dia 29 de Comunidade Lagoa do Mel fora do calendário sem marcação')));
});

test('dias fora do mês seguem o calendário (fevereiro e ano bissexto)', () => {
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 10), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  const view = monthView(snapshot, 2025, 2, monitoring);
  assert.equal(cellState(view, BARRAGEM, 28), 'M', 'Feb/2025 Barragem foi monitorada no dia 28 (AD17 da planilha)');
  assert.equal(cellState(view, BARRAGEM, 29), 'N');
  assert.equal(cellState(view, BARRAGEM, 31), 'N');
});

test('contagens do mês e do ano batem com a planilha (valores em cache)', () => {
  const mar2025 = monthSummary(monthView(snapshot, 2025, 3, monitoring), monitoring);
  assert.equal(mar2025.desmontes, 10);
  assert.equal(mar2025.monitoramentos, 30);
  const oct2026 = monthSummary(monthView(snapshot, 2026, 10, monitoring), monitoring);
  assert.equal(oct2026.desmontes, 4);
  assert.equal(oct2026.monitoramentos, 12);
  assert.equal(oct2026.perPoint[PICHILINGA], 0);
  const year = yearSummary(snapshot, 2026, monitoring);
  assert.equal(year.totals.monitoramentos, 204);
  assert.equal(year.totals.desmontes, 8 + 8 + 8 + 6 + 7 + 7 + 7 + 7 + 6 + 4);
});

test('snapshot committed valida contra o contrato e cobre 2025 e 2026', () => {
  assert.doesNotThrow(() => validateMonitoringData(snapshot, monitoring));
  assert.equal(snapshot.schemaVersion, 1);
  assert.deepEqual(Object.keys(snapshot.years).sort(), ['2025', '2026']);
  assert.equal(Object.keys(snapshot.years['2025'].months).length, 12);
  assert.equal(snapshot.source.driveFileId, monitoring.source.driveFileId);
});

test('validação rejeita dia fora do mês, ponto desconhecido e ponto ausente', () => {
  const clone = () => structuredClone(snapshot);
  const feb = clone();
  feb.years['2025'].months['2'].desmontes = [29];
  assert.throws(() => validateMonitoringData(feb, monitoring), /dia inválido \(29\)/);
  const unknown = clone();
  unknown.years['2025'].months['1'].points.Desconhecido = [];
  assert.throws(() => validateMonitoringData(unknown, monitoring), /ponto desconhecido/);
  const missing = clone();
  delete missing.years['2025'].months['1'].points[PICHILINGA];
  assert.throws(() => validateMonitoringData(missing, monitoring), /ausente/);
  const version = clone();
  version.schemaVersion = 2;
  assert.throws(() => validateMonitoringData(version, monitoring), /schemaVersion/);
});

test('edição: N e dias fora do mês não são alteráveis; D e M alternam', () => {
  const view = monthView(snapshot, 2025, 2, monitoring);
  assert.throws(() => toggleMonitored(view, BARRAGEM, 29), /não pode ser editado/);
  assert.throws(() => toggleBlast(view, 29), /fora do mês/);
  const on = toggleMonitored(view, BARRAGEM, 1);
  assert.equal(cellState(on, BARRAGEM, 1), 'M');
  const off = toggleMonitored(on, BARRAGEM, 1);
  assert.equal(cellState(off, BARRAGEM, 1), '');
  assert.equal(view.points[BARRAGEM].has(1), false, 'a visão original não é alterada');
});

test('payload de gravação exige usuário e senha e envia dias ordenados', () => {
  const view = toggleBlast(toggleMonitored(monthView(snapshot, 2026, 10, monitoring), LAGOA, 2), 2);
  assert.throws(() => buildSavePayload(view, monitoring, {user: '', password: 'x'}), /usuário/);
  assert.throws(() => buildSavePayload(view, monitoring, {user: 'admin', password: ''}), /senha/);
  const payload = buildSavePayload(view, monitoring, {user: ' admin ', password: 'segredo'});
  assert.equal(payload.action, 'save');
  assert.equal(payload.user, 'admin');
  assert.equal(payload.year, 2026);
  assert.equal(payload.month, 10);
  assert.deepEqual(payload.desmontes, [...view.desmontes].sort((a, b) => a - b));
  assert.deepEqual(Object.keys(payload.points), monitoring.points);
  assert.equal(payload.points[LAGOA][0], 2);
});

test('resposta da API: JSON válido com campo ok e código de erro opcional', () => {
  assert.deepEqual(parseApiResponse('{"ok":true,"message":"Gravado"}').ok, true);
  assert.equal(parseApiResponse('{"ok":false,"message":"Senha incorreta"}').message, 'Senha incorreta');
  assert.equal(parseApiResponse('{"ok":false,"code":"auth","message":"x"}').code, 'auth');
  assert.equal(parseApiResponse('{"ok":true,"message":"x"}').code, '');
  assert.throws(() => parseApiResponse('<html>erro</html>'), /não é JSON/);
  assert.throws(() => parseApiResponse('{"message":"sem ok"}'), /campo "ok"/);
});

test('payload de acesso (auth) leva só ação, usuário e senha, sem dados da grade', () => {
  const payload = buildAuthPayload(monitoring, {user: ' admin ', password: 'segredo'});
  assert.deepEqual(payload, {action: 'auth', user: 'admin', password: 'segredo'});
  assert.throws(() => buildAuthPayload(monitoring, {user: '  ', password: 'x'}), /usuário/);
  assert.throws(() => buildAuthPayload(monitoring, {user: 'admin', password: ''}), /senha/);
  assert.throws(() => buildAuthPayload(monitoring, {user: 'u'.repeat(101), password: 'x'}), /100 caracteres/);
  assert.throws(() => buildAuthPayload(monitoring, {user: 'admin', password: 'p'.repeat(201)}), /200 caracteres/);
});

/** fetch simulado: registra a chamada e devolve a resposta indicada. */
function fakeFetch(bodyText, {status = 200} = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({url, options});
    return {ok: status >= 200 && status < 300, status, text: async () => bodyText};
  };
  return {impl, calls};
}

test('acesso: envia POST text/plain com action auth e devolve ok ou código de erro', async () => {
  const api = {...monitoring, apiUrl: 'https://script.example/exec'};
  const ok = fakeFetch('{"ok":true,"message":"Acesso liberado."}');
  const granted = await checkRemoteAccess(api, {user: 'admin', password: 'admin'}, ok.impl);
  assert.equal(granted.ok, true);
  assert.equal(ok.calls[0].url, 'https://script.example/exec');
  assert.equal(ok.calls[0].options.method, 'POST');
  assert.equal(ok.calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(ok.calls[0].options.body), {action: 'auth', user: 'admin', password: 'admin'});

  const denied = fakeFetch('{"ok":false,"code":"locked","message":"Muitas tentativas. Aguarde alguns minutos."}');
  const refused = await checkRemoteAccess(api, {user: 'admin', password: 'x'}, denied.impl);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'locked');
});

test('acesso sem apiUrl falha como indisponível, sem chamar a rede', async () => {
  const offline = fakeFetch('{}');
  await assert.rejects(
    () => checkRemoteAccess({...monitoring, apiUrl: ''}, {user: 'admin', password: 'admin'}, offline.impl),
    (error) => error instanceof MonitoringApiError && error.kind === 'not-configured',
  );
  assert.equal(offline.calls.length, 0);
});

test('acesso com falha de rede ou HTTP lança MonitoringApiError com tipo', async () => {
  const api = {...monitoring, apiUrl: 'https://script.example/exec'};
  const failing = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => checkRemoteAccess(api, {user: 'admin', password: 'admin'}, failing), (e) => e.kind === 'network');
  const http500 = fakeFetch('erro', {status: 500});
  await assert.rejects(() => checkRemoteAccess(api, {user: 'admin', password: 'admin'}, http500.impl), (e) => e.kind === 'http');
});

test('gravação e leitura usam o mesmo cliente; leitura valida o JSON recebido', async () => {
  const api = {...monitoring, apiUrl: 'https://script.example/exec'};
  const view = monthView(snapshot, 2026, 10, monitoring);
  const payload = buildSavePayload(view, monitoring, {user: 'admin', password: 'admin'});
  const saved = fakeFetch('{"ok":false,"code":"auth","message":"Usuário ou senha incorretos."}');
  const result = await saveRemoteMonth(api, payload, saved.impl);
  assert.equal(result.code, 'auth');
  assert.equal(JSON.parse(saved.calls[0].options.body).action, 'save');
  const read = fakeFetch(JSON.stringify({ok: true, data: snapshot}));
  const data = await readRemoteData(api, read.impl);
  assert.equal(data.schemaVersion, 1);
  assert.match(read.calls[0].url, /\?action=read$/);
});

test('nome do arquivo PDF segue o modelo do config', () => {
  assert.equal(monitoringFileName(monitoring, 'month', 2026, 10), 'monitoramento-2026-10.pdf');
  assert.equal(monitoringFileName(monitoring, 'year', 2026, 10), 'monitoramento-2026-anual.pdf');
});

test('grade renderiza M, N e botões somente em modo de edição', () => {
  const view = monthView(snapshot, 2025, 2, monitoring);
  const read = renderMonthGrid(view, monitoring, {editable: false});
  assert.equal(read.includes('<button'), false);
  assert.ok(read.includes('is-N'));
  const edit = renderMonthGrid(view, monitoring, {editable: true});
  assert.ok(edit.includes('data-mon-blast="1"'));
  assert.ok(!edit.includes('data-mon-point="' + BARRAGEM + '" data-mon-day="29"'), 'célula N não é editável');
  assert.ok(renderYearBody(snapshot, 2026, monitoring).includes('Resumo anual 2026'));
});

test('leitor de xlsx lê abas, textos compartilhados e valores em cache', async () => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="2025" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>01. JANEIRO</t></si><si><t>Barragem &amp; Cia</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c><c r="C1"><v>5</v></c></row><row r="2"><c r="B2" t="s"><v>1</v></c><c r="AK2"><f>COUNTIF(A1:A2,"M")</f><v>3</v></c><c r="D2" s="4"/></row></sheetData></worksheet>');
  const buffer = await zip.generateAsync({type: 'nodebuffer'});
  const [sheet] = await readXlsxSheets(buffer);
  assert.equal(sheet.name, '2025');
  assert.equal(sheet.rows[0][1], '01. JANEIRO');
  assert.equal(sheet.rows[0][2], 5);
  assert.equal(sheet.rows[1][1], 'Barragem & Cia');
  assert.equal(sheet.rows[1][36], 3);
  assert.equal(columnNumber('AG'), 33);
  assert.equal(columnLetters(33), 'AG');
});

test('ponto sem monitoramento no mês recebe classe is-zero (rótulo cinza); demais não', () => {
  const view = monthView(snapshot, 2026, 10, monitoring);
  const summary = monthSummary(view, monitoring);
  const zeros = monitoring.points.filter(name => summary.perPoint[name] === 0);
  const busy = monitoring.points.filter(name => summary.perPoint[name] > 0);
  assert.ok(zeros.length > 0 && busy.length > 0, 'fixture precisa de pontos com e sem monitoramento');
  const grid = renderMonthGrid(view, monitoring, {editable: false});
  for (const name of zeros) assert.ok(grid.includes(`<th scope="row" class="mon-point is-zero">${name}</th>`), name);
  for (const name of busy) assert.ok(grid.includes(`<th scope="row" class="mon-point">${name}</th>`), name);
  const community = renderCommunityTable(summary, monitoring);
  for (const name of zeros) assert.ok(community.includes(`<th scope="row" class="is-zero">${name}</th>`), name);
  assert.match(monitoring.colors.mutedPoint, /^#[0-9a-f]{6}$/i);
});

test('layout: barra de controles vem antes da área de status, que tem altura reservada', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const toolbar = html.indexOf('class="mon-toolbar"');
  const status = html.indexOf('class="mon-status"');
  const notice = html.indexOf('id="monitoring-notice"');
  const message = html.indexOf('id="mon-message"');
  const grid = html.indexOf('id="mon-grid-wrap"');
  assert.ok(toolbar > 0 && status > toolbar, 'status fica abaixo da barra de controles');
  assert.ok(notice > status && message > status && grid > message, 'avisos e mensagens ficam dentro de .mon-status, acima da grade');
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.mon-status\{[^}]*min-height:\d+px/);
  assert.match(css, /\.mon-actions \.is-off\{visibility:hidden\}/);
  // Botões de edição continuam sempre presentes no DOM (mesma posição em qualquer estado).
  for (const id of ['mon-edit-toggle', 'mon-save', 'mon-cancel']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!/id="mon-save"[^>]*\bhidden\b/.test(html), 'Salvar não usa o atributo hidden');
});

test('login: campos com autocomplete username/current-password', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="mon-login-user"[^>]*autocomplete="username"/);
  assert.match(html, /id="mon-login-password"[^>]*autocomplete="current-password"/);
});
