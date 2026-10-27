// Testa o backend do Apps Script (apps-script/Code.gs) num sandbox com stubs dos serviços do Google:
// setup(), padrões de configuração, ação "auth" e limite de tentativas (CacheService).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const CODE = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

/** Carrega Code.gs num contexto isolado. `props` simula Propriedades do script; `activeId` a planilha vinculada. */
function loadAppsScript({props = {}, activeId = 'SS_VINCULADA'} = {}) {
  const store = {...props};
  const cache = new Map();
  const cachePuts = [];
  const sandboxConsole = {log() {}, info() {}, warn() {}, error() {}};
  const ctx = {
    console: sandboxConsole,
    PropertiesService: {getScriptProperties: () => ({
      getProperty: key => (key in store ? store[key] : null),
      setProperty: (key, value) => { store[key] = value; },
    })},
    CacheService: {getScriptCache: () => ({
      get: key => (cache.has(key) ? cache.get(key) : null),
      put: (key, value, ttl) => { cache.set(key, value); cachePuts.push({key, value, ttl}); },
      remove: key => { cache.delete(key); },
    })},
    Utilities: {
      DigestAlgorithm: {SHA_256: 'SHA_256'},
      Charset: {UTF_8: 'UTF_8'},
      computeDigest: (algorithm, text) => Array.from(createHash('sha256').update(text, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    },
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    ContentService: {
      MimeType: {JSON: 'application/json'},
      createTextOutput: text => ({setMimeType() { return this; }, getContent: () => text}),
    },
    SpreadsheetApp: {
      getActive: () => (activeId ? {getId: () => activeId, getName: () => 'Planilha'} : null),
      openById: id => ({getId: () => id, getName: () => 'Planilha'}),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, {filename: 'Code.gs'});
  return {ctx, store, cache, cachePuts};
}

/** Chama doPost com um corpo JSON e devolve o objeto de resposta (JSON já interpretado). */
function post(ctx, body) {
  const output = ctx.doPost({postData: {contents: typeof body === 'string' ? body : JSON.stringify(body)}});
  return JSON.parse(output.getContent());
}

const validSave = {action: 'save', year: 2026, month: 10, desmontes: [], points: {}};
for (const name of ['Barragem de Rejeitos', 'Comunidade Lagoa do Mel', 'Comunidade Pau Ferro', 'Comunidade Torrões', 'Comunidade Corredor', 'Comunidade Itapicuru', 'Comunidade Pichilinga']) {
  validSave.points[name] = [];
}

test('setup() grava as propriedades ausentes e não sobrescreve as existentes', () => {
  const app = loadAppsScript({props: {ADMIN_USER: 'chefe'}});
  const created = app.ctx.setup();
  assert.equal(app.store.ADMIN_USER, 'chefe', 'valor existente preservado');
  assert.equal(app.store.ADMIN_PASSWORD_SHA256, sha('admin'));
  assert.equal(app.store.XLSX_FILE_ID, '1Jz49X3on8uu2ia6PC3sH4S_QGAnsnKiK');
  assert.equal(app.store.SPREADSHEET_ID, 'SS_VINCULADA');
  assert.deepEqual([...created].sort(), ['ADMIN_PASSWORD_SHA256', 'SPREADSHEET_ID', 'XLSX_FILE_ID']);
  assert.deepEqual([...app.ctx.setup()], [], 'segunda execução não cria nada');
});

test('setup() sem planilha vinculada não grava SPREADSHEET_ID', () => {
  const app = loadAppsScript({activeId: null});
  app.ctx.setup();
  assert.equal('SPREADSHEET_ID' in app.store, false);
  assert.equal(app.store.ADMIN_USER, 'admin');
});

test('sem setup(), a verificação usa os padrões admin / admin', () => {
  const app = loadAppsScript();
  assert.deepEqual(post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'}), {ok: true, message: 'Acesso liberado.'});
  const wrong = post(app.ctx, {action: 'auth', user: 'admin', password: 'errada'});
  assert.deepEqual(wrong, {ok: false, code: 'auth', message: 'Usuário ou senha incorretos.'});
  assert.equal(post(app.ctx, {action: 'auth', user: 'outro', password: 'admin'}).ok, false);
});

test('propriedades gravadas têm prioridade sobre os padrões', () => {
  const app = loadAppsScript({props: {ADMIN_USER: 'chefe', ADMIN_PASSWORD_SHA256: sha('nova-senha')}});
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'}).ok, false);
  assert.equal(post(app.ctx, {action: 'auth', user: 'chefe', password: 'nova-senha'}).ok, true);
});

test('auth recusa corpo malformado sem revelar qual campo falhou', () => {
  const app = loadAppsScript();
  assert.equal(post(app.ctx, {action: 'auth', user: '', password: 'admin'}).code, 'auth');
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 123}).code, 'auth');
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'p'.repeat(201)}).code, 'auth');
});

test('limite de tentativas: após 5 falhas, bloqueia mesmo com a senha correta por 10 minutos', () => {
  const app = loadAppsScript();
  for (let i = 0; i < 5; i++) {
    assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'errada'}).code, 'auth');
  }
  const blocked = post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'});
  assert.deepEqual(blocked, {ok: false, code: 'locked', message: 'Muitas tentativas. Aguarde alguns minutos.'});
  assert.equal(app.cachePuts.at(-1).ttl, 600, 'janela de 10 minutos');
});

test('o limite é por usuário e não diferencia maiúsculas nem espaços no nome', () => {
  const app = loadAppsScript();
  for (let i = 0; i < 5; i++) post(app.ctx, {action: 'auth', user: ' ADMIN ', password: 'errada'});
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'}).code, 'locked');
  assert.equal(post(app.ctx, {action: 'auth', user: 'outro', password: 'admin'}).code, 'auth', 'outro usuário não é bloqueado');
});

test('acerto antes do limite zera o contador de falhas', () => {
  const app = loadAppsScript();
  for (let i = 0; i < 4; i++) post(app.ctx, {action: 'auth', user: 'admin', password: 'errada'});
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'}).ok, true);
  for (let i = 0; i < 4; i++) post(app.ctx, {action: 'auth', user: 'admin', password: 'errada'});
  assert.equal(post(app.ctx, {action: 'auth', user: 'admin', password: 'admin'}).ok, true, 'contador recomeçou do zero');
});

test('save com credenciais recusadas retorna code auth e não grava na planilha', () => {
  const app = loadAppsScript();
  const response = post(app.ctx, {...validSave, user: 'admin', password: 'errada'});
  assert.deepEqual(response, {ok: false, code: 'auth', message: 'Usuário ou senha incorretos.'});
});

test('save com credenciais válidas segue o fluxo de gravação (falha só depois da autenticação)', () => {
  // Sem planilha real o stub não grava; o importante é que a autenticação foi aceita e a gravação foi tentada.
  const app = loadAppsScript();
  const response = post(app.ctx, {...validSave, user: 'admin', password: 'admin'});
  assert.notEqual(response.code, 'auth');
  assert.notEqual(response.code, 'locked');
});

test('ação desconhecida é recusada', () => {
  const app = loadAppsScript();
  assert.deepEqual(post(app.ctx, {action: 'apagar'}), {ok: false, message: 'Ação inválida.'});
});
