/**
 * TXT de comunicação (sem coordenadas): saudação conforme o horário do download e a lista dos locais de
 * monitoramento do cenário selecionado. Textos, fuso e limites de horário vêm de report.communication (config.json).
 * Não há campo de coordenadas nem de distâncias neste modelo; campo desconhecido recusa a mensagem.
 */
import {reportDate} from './reportFormat.js';

export const COMMUNICATION_TEXT_FIELDS = ['saudacao', 'data', 'locais', 'regiao', 'operacao'];
export const COMMUNICATION_FILE_FIELDS = ['data', 'cenario'];

const SETTINGS_KEYS = ['fileName', 'timeZone', 'nightUntilHour', 'morningUntilHour', 'afternoonUntilHour', 'greetings', 'template'];
const GREETING_KEYS = ['morning', 'afternoon', 'evening'];

const placeholders = text => [...String(text).matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]);

/** Valida report.communication. Qualquer valor ausente ou inválido recusa com a causa; não há padrão silencioso. */
export function validateCommunicationSettings(settings) {
  if (!settings || typeof settings !== 'object') throw new Error('Configuração report.communication ausente em config.json.');
  // Chave extra é recusada: uma grafia errada não pode ser ignorada em silêncio.
  for (const key of Object.keys(settings)) {
    if (!SETTINGS_KEYS.includes(key)) throw new Error(`Chave desconhecida em report.communication: ${key}.`);
  }
  if (settings.greetings && typeof settings.greetings === 'object') {
    for (const key of Object.keys(settings.greetings)) {
      if (!GREETING_KEYS.includes(key)) throw new Error(`Chave desconhecida em report.communication.greetings: ${key}.`);
    }
  }
  for (const key of ['fileName', 'timeZone', 'template']) {
    if (typeof settings[key] !== 'string' || !settings[key].trim()) throw new Error(`report.communication.${key} ausente em config.json.`);
  }
  for (const key of ['nightUntilHour', 'morningUntilHour', 'afternoonUntilHour']) {
    if (!Number.isInteger(settings[key]) || settings[key] < 0 || settings[key] > 24) throw new Error(`report.communication.${key} deve ser uma hora inteira de 0 a 24.`);
  }
  if (!(settings.nightUntilHour < settings.morningUntilHour && settings.morningUntilHour < settings.afternoonUntilHour)) {
    throw new Error('report.communication: nightUntilHour < morningUntilHour < afternoonUntilHour é obrigatório.');
  }
  for (const key of ['morning', 'afternoon', 'evening']) {
    if (typeof settings.greetings?.[key] !== 'string' || !settings.greetings[key].trim()) throw new Error(`report.communication.greetings.${key} ausente em config.json.`);
  }
  try { new Intl.DateTimeFormat('en-GB', { timeZone: settings.timeZone }); } catch { throw new Error(`report.communication.timeZone inválido: ${settings.timeZone}.`); }
  if (!placeholders(settings.template).includes('saudacao') || !placeholders(settings.template).includes('locais')) {
    throw new Error('report.communication.template precisa conter {saudacao} e {locais}.');
  }
  for (const key of placeholders(settings.template)) {
    if (!COMMUNICATION_TEXT_FIELDS.includes(key)) throw new Error(`Campo desconhecido no TXT de comunicação (report.communication.template): {${key}}`);
  }
  for (const key of placeholders(settings.fileName)) {
    if (!COMMUNICATION_FILE_FIELDS.includes(key)) throw new Error(`Campo desconhecido no nome do TXT de comunicação (report.communication.fileName): {${key}}`);
  }
  // Nome do arquivo com valores de exemplo: precisa terminar em .txt e não pode ter caracteres proibidos em nomes de arquivo.
  const sampleName = settings.fileName.replace(/\{([a-z]+)\}/g, (match, key) => (key === 'data' ? '20000101' : '1'));
  if (!/\.txt$/i.test(sampleName) || /[\\/:*?"<>|\x00-\x1f]/.test(sampleName)) {
    throw new Error('report.communication.fileName precisa ser um nome .txt sem caracteres proibidos (\\ / : * ? " < > |).');
  }
  return settings;
}

/** Hora (0 a 23) do instante `now` no fuso configurado. */
function localHour(now, timeZone) {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).find(p => p.type === 'hour');
  return Number(part.value) % 24;
}

/**
 * Saudação para o horário local: antes de nightUntilHour (madrugada) e a partir de afternoonUntilHour é boa noite;
 * antes de morningUntilHour é bom dia; até afternoonUntilHour é boa tarde.
 */
export function greetingFor(now, settings) {
  validateCommunicationSettings(settings);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Horário inválido para a saudação.');
  const hour = localHour(now, settings.timeZone);
  if (hour < settings.nightUntilHour) return settings.greetings.evening;
  if (hour < settings.morningUntilHour) return settings.greetings.morning;
  if (hour < settings.afternoonUntilHour) return settings.greetings.afternoon;
  return settings.greetings.evening;
}

/** Texto do TXT de comunicação: saudação do horário e os locais do cenário, sem coordenadas. */
export function buildCommunicationMessage(data, settings, now = new Date()) {
  validateCommunicationSettings(settings);
  if (!data?.scenario?.points?.length) throw new Error('Calcule e selecione um cenário antes de exportar.');
  const fields = {
    saudacao: greetingFor(now, settings),
    data: reportDate(data.meta.date),
    locais: data.scenario.points.map((p, i) => `${i + 1}. ${p.name}`).join('\n'),
    regiao: data.meta.blastName || '',
    operacao: data.meta.operation || '',
  };
  // Campo usado no modelo sem valor é recusado: não sai linha em branco sem aviso.
  for (const key of placeholders(settings.template)) {
    if (fields[key] === '') throw new Error(`Campo {${key}} sem valor na campanha; preencha-o antes de gerar o TXT de comunicação.`);
  }
  return settings.template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!(key in fields)) throw new Error(`Campo desconhecido no TXT de comunicação: ${match}`);
    return fields[key];
  }).trim();
}

/** Nome do arquivo: {data} em AAAAMMDD e {cenario} com o número do cenário. */
export function communicationFileName(data, settings) {
  validateCommunicationSettings(settings);
  reportDate(data.meta.date);
  const values = { data: data.meta.date.replaceAll('-', ''), cenario: String(data.scenario.id) };
  return settings.fileName.replace(/\{([a-z]+)\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Campo desconhecido no nome do TXT de comunicação: ${match}`);
    return values[key];
  });
}
