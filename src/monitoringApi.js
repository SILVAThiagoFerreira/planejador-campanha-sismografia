// Cliente da API do monitoramento (Google Apps Script). Contrato em apps-script/README.md.
// - Leitura: GET {apiUrl}?action=read  -> {ok, data:{schemaVersion, years, ...}}
// - Acesso: POST {apiUrl} {action:"auth", user, password} -> {ok, message, code?}
// - Gravação: POST {apiUrl} com corpo JSON enviado como text/plain (evita preflight CORS)
//   -> {ok, message, code?, data?}
// A senha trafega apenas no corpo do POST e não é armazenada pela aplicação.
import {buildAuthPayload, parseApiResponse} from './monitoringData.js';

/** Erro de comunicação com a API, com a causa legível. */
export class MonitoringApiError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'MonitoringApiError';
    this.kind = kind;
  }
}

async function requestWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {...options, signal: controller.signal, redirect: 'follow'});
  } catch (error) {
    if (error.name === 'AbortError') throw new MonitoringApiError(`A API não respondeu em ${Math.round(timeoutMs / 1000)} s.`, 'timeout');
    throw new MonitoringApiError(`Não foi possível contatar a API (rede, URL ou permissão de acesso). ${error.message}`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** Lê os dados do monitoramento pela API. Lança MonitoringApiError em qualquer falha. */
export async function readRemoteData(monitoring, fetchImpl = globalThis.fetch) {
  if (!monitoring.apiUrl) throw new MonitoringApiError('API não configurada (monitoring.apiUrl em config.json está vazio).', 'not-configured');
  const url = `${monitoring.apiUrl}${monitoring.apiUrl.includes('?') ? '&' : '?'}action=${encodeURIComponent(monitoring.api.readAction)}`;
  const response = await requestWithTimeout(url, {method: 'GET', cache: 'no-store'}, monitoring.api.timeoutMs, fetchImpl);
  if (!response.ok) throw new MonitoringApiError(`A API respondeu HTTP ${response.status}.`, 'http');
  const parsed = parseApiResponse(await response.text());
  if (!parsed.ok) throw new MonitoringApiError(parsed.message || 'A API recusou a leitura.', 'api');
  if (!parsed.data) throw new MonitoringApiError('A API não devolveu dados.', 'api');
  return parsed.data;
}

/** POST JSON como text/plain. Retorna {ok, message, code?, data?}; falhas de transporte lançam MonitoringApiError. */
async function postAction(monitoring, body, fetchImpl) {
  if (!monitoring.apiUrl) throw new MonitoringApiError('API não configurada (monitoring.apiUrl em config.json está vazio).', 'not-configured');
  const response = await requestWithTimeout(monitoring.apiUrl, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    body: JSON.stringify(body),
    cache: 'no-store',
  }, monitoring.api.timeoutMs, fetchImpl);
  if (!response.ok) throw new MonitoringApiError(`A API respondeu HTTP ${response.status}.`, 'http');
  return parseApiResponse(await response.text());
}

/** Verifica usuário e senha no servidor ({action:"auth"}). Não grava nada. */
export function checkRemoteAccess(monitoring, credentials, fetchImpl = globalThis.fetch) {
  return postAction(monitoring, buildAuthPayload(monitoring, credentials), fetchImpl);
}

/** Envia a gravação de um mês. Retorna {ok, message, code?, data?}; erros de rede lançam MonitoringApiError. */
export function saveRemoteMonth(monitoring, payload, fetchImpl = globalThis.fetch) {
  return postAction(monitoring, payload, fetchImpl);
}
