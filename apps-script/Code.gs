/**
 * Backend do monitoramento sismográfico (Google Apps Script, web app).
 * Planilha nativa convertida do .xlsx da Gantt, uma aba por ano (AAAA), mesmo layout do arquivo original.
 *
 * Contrato (ver apps-script/README.md):
 *   GET  ?action=read              -> {ok, data:{schemaVersion, source, generatedAt, years}}
 *   POST corpo JSON (text/plain)   -> {action:"auth", user, password}  -> {ok, message, code?}
 *                                     -> {action:"save", user, password, year, month, desmontes, points}
 *                                     -> {ok, message, code?, data?}
 *   code: "auth" (usuário ou senha incorretos), "locked" (muitas tentativas) ou ausente.
 *
 * IMPORTANTE: as constantes abaixo espelham config.json (bloco "monitoring") do projeto.
 * Ao alterar pontos, nomes de meses ou rótulos no config.json, altere também aqui.
 */

// ---- Constantes espelhadas de config.json (monitoring) ----
var SCHEMA_VERSION = 1;
var YEAR_SHEET_PATTERN = /^\d{4}$/;
var MONTH_HEADER_PATTERN = /^(\d{2})\.\s*(.+)$/;
var MONTH_NAMES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
var POINTS = [
  'Barragem de Rejeitos',
  'Comunidade Lagoa do Mel',
  'Comunidade Pau Ferro',
  'Comunidade Torrões',
  'Comunidade Corredor',
  'Comunidade Itapicuru',
  'Comunidade Pichilinga'
];
var LABEL_COLUMN = 2;        // B
var FIRST_DAY_COLUMN = 3;    // C
var DAY_COUNT = 31;          // C..AG
var DAY_MARKER = 'D';
var MONITORED_MARKER = 'M';
var NOT_IN_MONTH_MARKER = 'N';
var POINT_HEADER = 'Ponto de Monitoramento';
var DESMONTES_QUESTION = 'Quantos desmontes houveram no mês?';
var MONITORING_QUESTION = 'Quantos monitoramentos foram realizados no mês?';
var COMMUNITY_TABLE_TITLE = 'Qtd. Monitoramentos/Comunidade';

// ---- Padrões de configuração (usados quando a propriedade do script não existe) ----
// Os mesmos valores são gravados por setup(). Os padrões são configuração, não dados:
// a validação dos dados continua sem fallback silencioso.
var DEFAULT_ADMIN_USER = 'admin';
var DEFAULT_ADMIN_PASSWORD = 'admin';             // apenas o SHA-256 é usado; trocar em produção (ADMIN_PASSWORD_SHA256)
var DEFAULT_XLSX_FILE_ID = '1Jz49X3on8uu2ia6PC3sH4S_QGAnsnKiK';

// ---- Limite de tentativas de login (por usuário, CacheService) ----
var AUTH_MAX_FAILURES = 5;
var AUTH_WINDOW_SECONDS = 600;                    // 10 minutos; cada falha renova a janela
var INVALID_CREDENTIALS_MESSAGE = 'Usuário ou senha incorretos.';
var LOCKED_MESSAGE = 'Muitas tentativas. Aguarde alguns minutos.';

// ---- Entrada HTTP ----

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'read';
  try {
    if (action !== 'read') return jsonOut_({ok: false, message: 'Ação desconhecida: ' + action + '.'});
    return jsonOut_({ok: true, data: readAll_()});
  } catch (error) {
    logLine_('ERROR', 'read', error.message);
    return jsonOut_({ok: false, message: 'Falha ao ler a planilha: ' + error.message});
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (error) {
    return jsonOut_({ok: false, message: 'Corpo da requisição não é JSON válido.'});
  }
  if (body && body.action === 'auth') return jsonOut_(handleAuth_(body));
  if (!body || body.action !== 'save') return jsonOut_({ok: false, message: 'Ação inválida.'});
  var lock = LockService.getScriptLock();
  try {
    var check = validateSavePayload_(body);
    if (!check.ok) {
      logLine_('WARN', 'save', 'Payload recusado: ' + check.message);
      return jsonOut_(check);
    }
    var access = checkCredentials_(body.user, body.password);
    if (!access.ok) {
      logLine_('WARN', 'save', 'Acesso recusado (' + access.code + ').');
      return jsonOut_(access);
    }
    lock.waitLock(30000);
    var ss = getSpreadsheet_();
    var sheet = ensureYearSheet_(ss, body.year);
    writeMonth_(sheet, body.year, body.month, body.desmontes, body.points);
    SpreadsheetApp.flush();
    logLine_('INFO', 'save', 'Mês ' + body.month + '/' + body.year + ' gravado por ' + body.user + '.');
    var message = 'Gravado na planilha ' + body.month + '/' + body.year + '.';
    var exportWarning = exportXlsxIfConfigured_(ss);
    if (exportWarning) message += ' ' + exportWarning;
    return jsonOut_({
      ok: true,
      message: message,
      data: {year: body.year, month: body.month, desmontes: body.desmontes, points: body.points}
    });
  } catch (error) {
    logLine_('ERROR', 'save', error.message);
    return jsonOut_({ok: false, message: 'Não foi possível gravar: ' + error.message});
  } finally {
    try { lock.releaseLock(); } catch (ignored) { /* lock não obtido */ }
  }
}

// ---- Autenticação ----

/** Ação "auth": valida somente as credenciais (não grava nada). */
function handleAuth_(body) {
  if (typeof body.user !== 'string' || !body.user.trim() || body.user.length > 100 ||
      typeof body.password !== 'string' || !body.password || body.password.length > 200) {
    return {ok: false, code: 'auth', message: INVALID_CREDENTIALS_MESSAGE};
  }
  var access = checkCredentials_(body.user, body.password);
  logLine_(access.ok ? 'INFO' : 'WARN', 'auth', access.ok ? 'Acesso liberado.' : 'Acesso recusado (' + access.code + ').');
  return access.ok ? {ok: true, message: 'Acesso liberado.'} : access;
}

/**
 * Confere usuário e senha com limite de tentativas por usuário: após AUTH_MAX_FAILURES falhas
 * em AUTH_WINDOW_SECONDS, recusa sem verificar a senha. Sucesso zera o contador.
 * Retorna {ok, code?, message}. Usado por "auth" e por "save".
 */
function checkCredentials_(user, password) {
  var cache = CacheService.getScriptCache();
  var key = 'auth-fail:' + String(user).trim().toLowerCase();
  var failures = Number(cache.get(key) || 0);
  if (failures >= AUTH_MAX_FAILURES) return {ok: false, code: 'locked', message: LOCKED_MESSAGE};
  if (credentialsMatch_(user, password)) {
    cache.remove(key);
    return {ok: true, message: 'Acesso liberado.'};
  }
  cache.put(key, String(failures + 1), AUTH_WINDOW_SECONDS);
  return {ok: false, code: 'auth', message: INVALID_CREDENTIALS_MESSAGE};
}

/** Compara usuário e o hash SHA-256 (hex minúsculo) da senha com as propriedades (ou os padrões). */
function credentialsMatch_(user, password) {
  var adminUser = getConfig_('ADMIN_USER');
  var adminHash = getConfig_('ADMIN_PASSWORD_SHA256').toLowerCase();
  return String(user).trim() === adminUser && sha256Hex_(String(password)) === adminHash;
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// ---- Validação do payload ----

function validateSavePayload_(body) {
  var fail = function (message) { return {ok: false, message: message}; };
  if (typeof body.user !== 'string' || !body.user.trim() || body.user.length > 100) return fail('Usuário inválido.');
  if (typeof body.password !== 'string' || !body.password || body.password.length > 200) return fail('Senha inválida.');
  if (!Number.isInteger(body.year) || !YEAR_SHEET_PATTERN.test(String(body.year))) return fail('Ano inválido.');
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return fail('Mês inválido.');
  var dim = daysIn_(body.year, body.month);
  var checkDays = function (days, label) {
    if (!Array.isArray(days)) return label + ': lista de dias ausente.';
    var previous = 0;
    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      if (!Number.isInteger(d) || d < 1 || d > dim) return label + ': dia inválido (' + d + ').';
      if (d <= previous) return label + ': dias repetidos ou fora de ordem.';
      previous = d;
    }
    return null;
  };
  var problem = checkDays(body.desmontes, 'Desmontes');
  if (problem) return fail(problem);
  if (!body.points || typeof body.points !== 'object') return fail('Campo "points" ausente.');
  for (var key in body.points) {
    if (POINTS.indexOf(key) < 0) return fail('Ponto desconhecido: ' + key + '.');
  }
  for (var j = 0; j < POINTS.length; j++) {
    if (!(POINTS[j] in body.points)) return fail('Ponto ausente: ' + POINTS[j] + '.');
    problem = checkDays(body.points[POINTS[j]], POINTS[j]);
    if (problem) return fail(problem);
  }
  return {ok: true};
}

function daysIn_(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---- Leitura ----

function readAll_() {
  var ss = getSpreadsheet_();
  var years = {};
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (!YEAR_SHEET_PATTERN.test(name)) continue;
    var parsed = parseGanttGrid_(sheets[i].getDataRange().getValues(), Number(name));
    years[name] = {months: parsed.months};
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    source: {fileName: ss.getName(), sheets: Object.keys(years).sort()},
    generatedAt: new Date().toISOString(),
    years: years
  };
}

/**
 * Interpreta a aba de um ano (mesma lógica de tools/lib/ganttParser.mjs).
 * Linhas deslocadas (março/agosto de 2025) são lidas pela posição e geram anomalias.
 */
function parseGanttGrid_(values, year) {
  var rowCount = values.length;
  var cell = function (r, c) {
    var v = values[r - 1] ? values[r - 1][c - 1] : '';
    return (v === null || v === undefined) ? '' : String(v).trim();
  };
  var headers = [];
  for (var r = 1; r <= rowCount; r++) {
    var m = cell(r, LABEL_COLUMN).match(MONTH_HEADER_PATTERN);
    if (m) headers.push({row: r, month: Number(m[1]), name: m[2].trim()});
  }
  if (!headers.length) throw new Error('Aba ' + year + ': nenhum bloco de mês encontrado.');
  var months = {};
  headers.forEach(function (header, index) {
    var anomalies = [];
    var start = header.row;
    var end = index + 1 < headers.length ? headers[index + 1].row - 1 : rowCount;
    var dim = daysIn_(year, header.month);
    var dayRow = 0;
    for (var rr = start + 1; rr <= Math.min(start + 3, end); rr++) {
      if (cell(rr, FIRST_DAY_COLUMN) === '1' && cell(rr, FIRST_DAY_COLUMN + 1) === '2') { dayRow = rr; break; }
    }
    if (!dayRow) throw new Error('Aba ' + year + ', ' + header.name + ': linha de dias não encontrada.');
    if (dayRow !== start + 2) anomalies.push('Linha dos dias na linha ' + dayRow + '; esperado ' + (start + 2) + '.');
    if (cell(dayRow, LABEL_COLUMN)) anomalies.push('A linha dos dias (' + dayRow + ') traz o rótulo "' + cell(dayRow, LABEL_COLUMN) + '"; pontos lidos pela posição.');
    var markRow = dayRow - 1;
    var desmontes = [];
    for (var d = 1; d <= DAY_COUNT; d++) {
      var v = cell(markRow, FIRST_DAY_COLUMN + d - 1);
      if (v === DAY_MARKER) {
        if (d > dim) anomalies.push('Desmonte marcado no dia ' + d + ', que não existe no mês.');
        else desmontes.push(d);
      } else if (v !== '') {
        anomalies.push('Marcação "' + v + '" inesperada no dia ' + d + ' da linha ' + markRow + '.');
      }
    }
    var monthPoints = {};
    POINTS.forEach(function (name, k) {
      var row = dayRow + 1 + k;
      var label = cell(row, LABEL_COLUMN);
      if (!label) anomalies.push('Linha ' + row + ' sem rótulo; dados lidos pela posição (' + name + ').');
      else if (label !== name) anomalies.push('Linha ' + row + ': rótulo "' + label + '" difere de "' + name + '"; dados lidos pela posição.');
      var days = [];
      for (var day = 1; day <= DAY_COUNT; day++) {
        var mark = cell(row, FIRST_DAY_COLUMN + day - 1);
        var inMonth = day <= dim;
        if (mark === MONITORED_MARKER) {
          if (inMonth) days.push(day);
          else anomalies.push('Monitoramento "M" no dia ' + day + ' de ' + name + ', que não existe no mês.');
        } else if (mark === '' && !inMonth) {
          anomalies.push('Dia ' + day + ' de ' + name + ' fora do calendário sem marcação "N".');
        } else if (mark !== '' && mark !== NOT_IN_MONTH_MARKER) {
          anomalies.push('Marcação "' + mark + '" inesperada no dia ' + day + ' de ' + name + '.');
        }
      }
      monthPoints[name] = days;
    });
    months[String(header.month)] = {desmontes: desmontes, points: monthPoints, anomalies: anomalies};
  });
  return {months: months};
}

// ---- Escrita ----

/**
 * Grava D (desmontes, linha acima dos dias) e M (pontos) no bloco do mês.
 * Células N e rótulos não são alterados; as contagens são fórmulas da própria planilha.
 */
function writeMonth_(sheet, year, month, desmontes, points) {
  var values = sheet.getDataRange().getValues();
  var header = findMonthHeader_(values, month);
  if (!header) throw new Error('Bloco do mês ' + month + ' não encontrado na aba ' + year + '.');
  var dim = daysIn_(year, month);
  var dayRow = findDayRow_(values, header.row);
  if (!dayRow) throw new Error('Linha de dias do mês ' + month + ' não encontrada.');
  var markRow = dayRow - 1;
  var lastRow = dayRow + POINTS.length;
  var height = lastRow - markRow + 1;
  var block = sheet.getRange(markRow, FIRST_DAY_COLUMN, height, DAY_COUNT).getValues();
  for (var d = 1; d <= dim; d++) {
    block[0][d - 1] = desmontes.indexOf(d) >= 0 ? DAY_MARKER : '';
  }
  for (var k = 0; k < POINTS.length; k++) {
    var days = points[POINTS[k]];
    for (var day = 1; day <= dim; day++) {
      // block[0] = linha D, block[1] = linha dos dias, block[2 + k] = ponto k.
      block[k + 2][day - 1] = days.indexOf(day) >= 0 ? MONITORED_MARKER : '';
    }
  }
  sheet.getRange(markRow, FIRST_DAY_COLUMN, height, DAY_COUNT).setValues(block);
}

/** Localiza o cabeçalho "MM. NOME" do mês (coluna B). */
function findMonthHeader_(values, month) {
  for (var r = 0; r < values.length; r++) {
    var m = String(values[r][LABEL_COLUMN - 1] || '').trim().match(MONTH_HEADER_PATTERN);
    if (m && Number(m[1]) === month) return {row: r + 1};
  }
  return null;
}

function findDayRow_(values, headerRow) {
  for (var r = headerRow + 1; r <= Math.min(headerRow + 3, values.length); r++) {
    if (String(values[r - 1][FIRST_DAY_COLUMN - 1]).trim() === '1' && String(values[r - 1][FIRST_DAY_COLUMN]).trim() === '2') return r;
  }
  return 0;
}

/** Garante a aba do ano; se não existir, copia a aba-modelo mais recente e recalcula as células N. */
function ensureYearSheet_(ss, year) {
  var name = String(year);
  var existing = ss.getSheetByName(name);
  if (existing) return existing;
  var templateName = '';
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (YEAR_SHEET_PATTERN.test(n) && n > templateName) templateName = n;
  });
  if (!templateName) throw new Error('Não há aba-modelo de ano para copiar.');
  var copy = ss.getSheetByName(templateName).copyTo(ss).setName(name);
  var values = copy.getDataRange().getValues();
  for (var month = 1; month <= 12; month++) {
    var header = findMonthHeader_(values, month);
    if (!header) throw new Error('Bloco do mês ' + month + ' ausente na aba-modelo.');
    var dayRow = findDayRow_(values, header.row);
    var dim = daysIn_(year, month);
    var height = POINTS.length + 2;
    var block = copy.getRange(dayRow - 1, FIRST_DAY_COLUMN, height, DAY_COUNT).getValues();
    for (var r = 0; r < height; r++) {
      if (r === 1) continue; // linha dos dias (1..31) permanece como está
      for (var d = 1; d <= DAY_COUNT; d++) {
        if (r === 0) block[r][d - 1] = '';                                  // linha D: sem desmontes
        else block[r][d - 1] = d > dim ? NOT_IN_MONTH_MARKER : '';           // pontos: N fora do calendário, senão vazio
      }
    }
    copy.getRange(dayRow - 1, FIRST_DAY_COLUMN, height, DAY_COUNT).setValues(block);
    values = copy.getDataRange().getValues();
  }
  logLine_('INFO', 'sheet', 'Aba ' + name + ' criada a partir de ' + templateName + '.');
  return copy;
}

// ---- Exportação do xlsx para o Drive ----

/**
 * Se XLSX_FILE_ID estiver definido, exporta a planilha nativa como .xlsx e sobrescreve o arquivo
 * original no Drive (Drive API v3, serviço avançado). Retorna aviso textual em caso de falha.
 */
function exportXlsxIfConfigured_(ss) {
  var fileId = getConfig_('XLSX_FILE_ID');
  if (!fileId) return '';
  try {
    var response = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('exportação HTTP ' + response.getResponseCode());
    var blob = response.getBlob().setName(ss.getName() + '.xlsx');
    Drive.Files.update({}, fileId, blob);
    logLine_('INFO', 'export', 'Arquivo xlsx atualizado no Drive (' + fileId + ').');
    return 'Arquivo xlsx do Drive atualizado.';
  } catch (error) {
    logLine_('ERROR', 'export', error.message);
    return 'Atenção: a planilha foi gravada, mas o arquivo xlsx no Drive não foi atualizado (' + error.message + ').';
  }
}

// ---- Utilidades ----

/**
 * Lê uma propriedade do script. Se ausente, usa o padrão (configuração, não dado):
 * ADMIN_USER, ADMIN_PASSWORD_SHA256 e XLSX_FILE_ID têm padrões fixos; SPREADSHEET_ID vazio
 * significa a planilha vinculada ao script.
 */
function getConfig_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (value) return value;
  var defaults = {
    ADMIN_USER: DEFAULT_ADMIN_USER,
    ADMIN_PASSWORD_SHA256: sha256Hex_(DEFAULT_ADMIN_PASSWORD),
    XLSX_FILE_ID: DEFAULT_XLSX_FILE_ID,
    SPREADSHEET_ID: ''
  };
  return defaults[key] || '';
}

function getSpreadsheet_() {
  var id = getConfig_('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  if (!ss) throw new Error('Planilha não encontrada: defina SPREADSHEET_ID em Propriedades do script.');
  return ss;
}

function jsonOut_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function logLine_(level, scope, message) {
  console.log(JSON.stringify({level: level, scope: scope, message: message, time: new Date().toISOString()}));
}

// ---- Configuração inicial (executar manualmente no editor) ----

/**
 * Grava as propriedades do script que estiverem ausentes:
 * ADMIN_USER = "admin", ADMIN_PASSWORD_SHA256 = SHA-256 de "admin", XLSX_FILE_ID (arquivo .xlsx no Drive)
 * e SPREADSHEET_ID = planilha vinculada. Não sobrescreve valores já existentes.
 * Opcional: o script funciona mesmo sem executar setup(), pelos mesmos padrões (getConfig_).
 * Troque a senha em produção: execute gerarHashSenha() após editar NOVA_SENHA e grave o hash
 * em ADMIN_PASSWORD_SHA256 (Projeto > Propriedades do script).
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var defaults = {
    ADMIN_USER: DEFAULT_ADMIN_USER,
    ADMIN_PASSWORD_SHA256: sha256Hex_(DEFAULT_ADMIN_PASSWORD),
    XLSX_FILE_ID: DEFAULT_XLSX_FILE_ID
  };
  var active = SpreadsheetApp.getActive();
  if (active) defaults.SPREADSHEET_ID = active.getId();
  var created = [];
  for (var key in defaults) {
    if (!props.getProperty(key)) {
      props.setProperty(key, defaults[key]);
      created.push(key);
    }
  }
  logLine_('INFO', 'setup', 'Propriedades criadas: ' + (created.join(', ') || 'nenhuma (já existiam)') + '.');
  return created;
}

/** Edite NOVA_SENHA, execute esta função e copie o hash registrado no log para ADMIN_PASSWORD_SHA256. */
function gerarHashSenha() {
  var NOVA_SENHA = 'troque-esta-senha';
  var hash = sha256Hex_(NOVA_SENHA);
  logLine_('INFO', 'hash', 'ADMIN_PASSWORD_SHA256 = ' + hash);
  return hash;
}
