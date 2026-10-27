// Dados do monitoramento sismográfico: validação do contrato JSON, cálculo de contagens,
// regras de calendário (dias fora do mês) e montagem/validação do payload de gravação.
// Módulo puro (sem DOM) usado pelo navegador, pelo importador e pelos testes.

/** Normaliza texto para comparação de rótulos (sem acento, espaços e caixa). */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Número de dias do mês (mês 1-12), considerando anos bissextos. */
export function daysInMonth(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Mês inválido: ${month}.`);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const isInt = v => Number.isInteger(v);

/** Valida uma lista de dias: inteiros, únicos, em ordem crescente e dentro do mês. */
export function validateDays(days, dim, label) {
  if (!Array.isArray(days)) throw new Error(`${label}: a lista de dias deve ser um array.`);
  let previous = 0;
  for (const d of days) {
    if (!isInt(d) || d < 1 || d > dim) throw new Error(`${label}: dia inválido (${d}); o mês tem ${dim} dias.`);
    if (d <= previous) throw new Error(`${label}: dias repetidos ou fora de ordem (${d}).`);
    previous = d;
  }
  return days;
}

/** Registro de um mês vazio para os pontos configurados. */
export function emptyMonth(points) {
  return {desmontes: [], points: Object.fromEntries(points.map(name => [name, []]))};
}

/**
 * Valida o snapshot ou a resposta da API (mesmo schema). Lança Error com a causa.
 * Anomalias do importador são aceitas e preservadas; dias fora do mês são erro.
 */
export function validateMonitoringData(data, monitoring) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dados de monitoramento: objeto JSON esperado.');
  if (data.schemaVersion !== 1) throw new Error(`Dados de monitoramento: schemaVersion ${data.schemaVersion} não suportada (esperado 1).`);
  if (!data.years || typeof data.years !== 'object' || Array.isArray(data.years)) throw new Error('Dados de monitoramento: campo "years" ausente.');
  const points = monitoring.points;
  for (const [yearKey, yearData] of Object.entries(data.years)) {
    if (!/^\d{4}$/.test(yearKey)) throw new Error(`Ano inválido nos dados: "${yearKey}".`);
    const year = Number(yearKey);
    if (!yearData || !yearData.months || typeof yearData.months !== 'object') throw new Error(`Ano ${yearKey}: campo "months" ausente.`);
    for (const [monthKey, record] of Object.entries(yearData.months)) {
      const month = Number(monthKey);
      if (!/^\d{1,2}$/.test(monthKey) || month < 1 || month > 12) throw new Error(`Ano ${yearKey}: mês inválido "${monthKey}".`);
      const label = `${yearKey}-${String(month).padStart(2, '0')}`;
      const dim = daysInMonth(year, month);
      if (!record || typeof record !== 'object') throw new Error(`${label}: registro de mês inválido.`);
      validateDays(record.desmontes, dim, `${label} desmontes`);
      if (!record.points || typeof record.points !== 'object' || Array.isArray(record.points)) throw new Error(`${label}: campo "points" ausente.`);
      for (const name of Object.keys(record.points)) {
        if (!points.includes(name)) throw new Error(`${label}: ponto desconhecido "${name}".`);
      }
      for (const name of points) {
        if (!(name in record.points)) throw new Error(`${label}: ponto "${name}" ausente.`);
        validateDays(record.points[name], dim, `${label} ${name}`);
      }
      if (record.anomalies !== undefined && (!Array.isArray(record.anomalies) || record.anomalies.some(a => typeof a !== 'string'))) {
        throw new Error(`${label}: "anomalies" deve ser uma lista de textos.`);
      }
    }
  }
  return data;
}

/** Vista de um mês: dias com desmonte e dias monitorados por ponto, com o calendário real. */
export function monthView(data, year, month, monitoring) {
  const dim = daysInMonth(year, month);
  const record = data?.years?.[String(year)]?.months?.[String(month)] ?? null;
  const base = record ?? emptyMonth(monitoring.points);
  return {
    year,
    month,
    daysInMonth: dim,
    hasRecord: record !== null,
    desmontes: new Set(base.desmontes),
    points: Object.fromEntries(monitoring.points.map(name => [name, new Set(base.points[name] ?? [])])),
    anomalies: record?.anomalies ?? [],
  };
}

/** Estado de uma célula: 'D' (desmonte no cabeçalho), 'M', 'N' (fora do calendário) ou ''. */
export function cellState(view, pointName, day) {
  if (day > view.daysInMonth) return 'N';
  return view.points[pointName]?.has(day) ? 'M' : '';
}

/** Contagens do mês: desmontes, monitoramentos totais e por ponto. */
export function monthSummary(view, monitoring) {
  const perPoint = Object.fromEntries(monitoring.points.map(name => [name, view.points[name].size]));
  return {
    desmontes: view.desmontes.size,
    monitoramentos: Object.values(perPoint).reduce((sum, n) => sum + n, 0),
    perPoint,
  };
}

/** Resumo anual: uma linha por mês e totais por ponto. */
export function yearSummary(data, year, monitoring) {
  const months = [];
  for (let month = 1; month <= 12; month++) {
    const view = monthView(data, year, month, monitoring);
    months.push({month, ...monthSummary(view, monitoring)});
  }
  const totals = {
    desmontes: months.reduce((s, m) => s + m.desmontes, 0),
    monitoramentos: months.reduce((s, m) => s + m.monitoramentos, 0),
    perPoint: Object.fromEntries(monitoring.points.map(name => [name, months.reduce((s, m) => s + m.perPoint[name], 0)])),
  };
  return {months, totals};
}

/** Alterna um dia de desmonte (somente dias do mês). Retorna nova vista. */
export function toggleBlast(view, day) {
  if (day < 1 || day > view.daysInMonth) throw new Error('Dia fora do mês.');
  const desmontes = new Set(view.desmontes);
  desmontes.has(day) ? desmontes.delete(day) : desmontes.add(day);
  return {...view, desmontes};
}

/** Alterna a marcação M de um ponto em um dia (N e dias fora do mês não são editáveis). */
export function toggleMonitored(view, pointName, day) {
  if (day < 1 || day > view.daysInMonth) throw new Error('Dia fora do calendário do mês não pode ser editado.');
  if (!(pointName in view.points)) throw new Error(`Ponto desconhecido: ${pointName}.`);
  const set = new Set(view.points[pointName]);
  set.has(day) ? set.delete(day) : set.add(day);
  return {...view, points: {...view.points, [pointName]: set}};
}

const sortDays = set => [...set].sort((a, b) => a - b);

/**
 * Monta o corpo do POST de gravação. Valida usuário, senha e a grade antes do envio.
 * A senha é usada apenas nesta montagem e nunca é persistida pela aplicação.
 */
export function buildSavePayload(view, monitoring, credentials) {
  const user = String(credentials?.user ?? '').trim();
  const password = String(credentials?.password ?? '');
  if (!user) throw new Error('Informe o usuário.');
  if (user.length > 100) throw new Error('Usuário com mais de 100 caracteres.');
  if (!password) throw new Error('Informe a senha.');
  if (password.length > 200) throw new Error('Senha com mais de 200 caracteres.');
  const desmontes = sortDays(view.desmontes);
  validateDays(desmontes, view.daysInMonth, 'Desmontes');
  const points = {};
  for (const name of monitoring.points) {
    const days = sortDays(view.points[name] ?? []);
    validateDays(days, view.daysInMonth, name);
    points[name] = days;
  }
  return {action: monitoring.api.saveAction, user, password, year: view.year, month: view.month, desmontes, points};
}

/**
 * Monta o corpo do POST de verificação de acesso ({action:"auth", user, password}).
 * Não grava nada no servidor; serve apenas para confirmar as credenciais.
 */
export function buildAuthPayload(monitoring, credentials) {
  const user = String(credentials?.user ?? '').trim();
  const password = String(credentials?.password ?? '');
  if (!user) throw new Error('Informe o usuário.');
  if (user.length > 100) throw new Error('Usuário com mais de 100 caracteres.');
  if (!password) throw new Error('Informe a senha.');
  if (password.length > 200) throw new Error('Senha com mais de 200 caracteres.');
  return {action: monitoring.api.authAction, user, password};
}

/** Interpreta a resposta JSON da API: {ok, message, code?, data?}. `code` é "auth", "locked" ou vazio. */
export function parseApiResponse(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('A resposta do servidor não é JSON válido. Verifique a implantação do Apps Script.');
  }
  if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') throw new Error('Resposta do servidor sem campo "ok".');
  return {ok: body.ok, message: String(body.message ?? ''), code: String(body.code ?? ''), data: body.data};
}
