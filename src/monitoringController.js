// Controlador da seção "Avanço do monitoramento": carregamento de dados (API ou snapshot),
// navegação por ano/mês, edição, gravação com login, visão anual e exportação PDF.
// Nenhuma senha é armazenada; falhas da API aparecem na tela com a causa.
import {logEvent} from './logger.js';
import {
  buildSavePayload, daysInMonth, monthSummary, monthView, toggleBlast, toggleMonitored, validateMonitoringData,
} from './monitoringData.js';
import {readRemoteData, saveRemoteMonth, MonitoringApiError} from './monitoringApi.js';
import {renderMonthGrid, renderLegend, renderCounts, renderCommunityTable, renderYearBody, monthTitle} from './monitoringView.js';
import {buildMonitoringPdf, monitoringFileName} from './monitoringPdf.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Carrega a imagem como data URL e obtém suas dimensões (para o PDF). */
async function loadImageAsset(path) {
  const response = await fetch(path, {cache: 'force-cache'});
  if (!response.ok) throw new Error(`HTTP ${response.status} ao obter ${path}.`);
  const blob = await response.blob();
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler o logotipo.'));
    reader.readAsDataURL(blob);
  });
  const size = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
    img.onerror = () => reject(new Error('Falha ao decodificar o logotipo.'));
    img.src = src;
  });
  return {src, format: 'PNG', ...size};
}

export async function initMonitoring(config) {
  const monitoring = config?.monitoring;
  const section = $('monitoring-section');
  if (!monitoring || !section) return;
  const colors = monitoring.colors;
  for (const [key, value] of Object.entries({header: colors.header, monitored: colors.monitored, notInMonth: colors.notInMonth, blast: colors.blastMark, grid: colors.grid})) {
    section.style.setProperty(`--mon-${key}`, value);
  }
  const now = new Date();
  const state = {
    data: {schemaVersion: 1, years: {}},
    source: {kind: 'none', label: '', reason: ''},
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    editing: false,
    draft: null,
    dirty: false,
    busy: false,
    assets: null,
    lastOpener: null,
  };
  const els = {
    year: $('mon-year'), month: $('mon-month'), prev: $('mon-prev'), next: $('mon-next'),
    grid: $('mon-grid-wrap'), legend: $('mon-legend'), counts: $('mon-counts'), community: $('mon-community'),
    notice: $('monitoring-notice'), message: $('mon-message'), sourceLabel: $('monitoring-source-label'),
    editToggle: $('mon-edit-toggle'), save: $('mon-save'), cancel: $('mon-cancel'),
    openYear: $('mon-open-year'), exportMonth: $('mon-export-month'), exportYear: $('mon-export-year'),
    loginDialog: $('mon-login-dialog'), loginForm: $('mon-login-form'), loginUser: $('mon-login-user'),
    loginPassword: $('mon-login-password'), loginError: $('mon-login-error'), loginSubmit: $('mon-login-submit'),
    loginCancel: $('mon-login-cancel'), yearDialog: $('mon-year-dialog'), yearTitle: $('mon-year-title'),
    yearBody: $('mon-year-body'), yearClose: $('mon-year-close'),
  };
  const monthName = (m) => `${monitoring.monthNames[m - 1]}`;

  function say(text, error = false) {
    els.message.hidden = false;
    els.message.textContent = text;
    els.message.className = error ? 'mon-message is-error' : 'mon-message';
    els.message.setAttribute('role', error ? 'alert' : 'status');
    logEvent(error ? 'error' : 'info', text);
  }
  /** Avisos persistentes (fonte dos dados e situação do mês), um parágrafo por aviso. */
  function setNotices(notices) {
    if (!notices.length) { els.notice.hidden = true; els.notice.replaceChildren(); return; }
    els.notice.hidden = false;
    els.notice.replaceChildren(...notices.map(({text, tone}) => {
      const p = document.createElement('p');
      p.className = `mon-notice is-${tone}`;
      p.textContent = text;
      return p;
    }));
  }

  function sourceNotice() {
    if (state.source.kind === 'snapshot') {
      const when = state.source.generatedAt ? ` Gerado em ${new Date(state.source.generatedAt).toLocaleString('pt-BR')}.` : '';
      return {tone: 'warning', text: `Dados do arquivo local, não da API: ${state.source.reason}${when} Os valores exibidos podem não refletir a planilha atual.`};
    }
    if (state.source.kind === 'error') return {tone: 'error', text: `Dados de monitoramento indisponíveis. ${state.source.reason}`};
    return null;
  }

  /** Lê a API; se não houver API ou a leitura falhar, usa o snapshot local com aviso visível. */
  async function loadData() {
    let reason = '';
    if (monitoring.apiUrl) {
      try {
        const data = validateMonitoringData(await readRemoteData(monitoring), monitoring);
        state.data = data;
        state.source = {kind: 'api', label: 'Google Drive (API)', reason: '', generatedAt: data.generatedAt || ''};
        logEvent('info', 'Monitoramento lido pela API', {years: Object.keys(data.years)});
        return;
      } catch (error) {
        reason = `Falha ao ler a API: ${error.message}`;
        logEvent('error', 'Leitura da API do monitoramento falhou; usando snapshot local', {reason});
      }
    } else {
      reason = 'API não configurada (monitoring.apiUrl em config.json está vazio).';
    }
    try {
      const response = await fetch(monitoring.snapshotPath, {cache: 'no-cache'});
      if (!response.ok) throw new Error(`HTTP ${response.status} ao obter ${monitoring.snapshotPath}.`);
      const data = validateMonitoringData(await response.json(), monitoring);
      state.data = data;
      state.source = {kind: 'snapshot', label: monitoring.snapshotPath, reason, generatedAt: data.generatedAt || ''};
    } catch (error) {
      state.data = {schemaVersion: 1, years: {}};
      state.source = {kind: 'error', label: monitoring.snapshotPath, reason: `${reason} Snapshot local indisponível: ${error.message}`};
      logEvent('error', 'Snapshot do monitoramento indisponível', {message: error.message});
    }
  }

  function sourceText() {
    if (state.source.kind === 'api') return 'API do Google Drive.';
    if (state.source.kind === 'snapshot') return `snapshot local (${state.source.label}).`;
    return 'indisponível.';
  }

  function refreshYearOptions() {
    const years = new Set(Object.keys(state.data.years).map(Number));
    years.add(now.getFullYear());
    years.add(state.year);
    els.year.innerHTML = [...years].sort((a, b) => a - b).map(y => `<option value="${y}"${y === state.year ? ' selected' : ''}>${y}</option>`).join('');
    els.month.innerHTML = monitoring.monthNames.map((name, i) => `<option value="${i + 1}"${i + 1 === state.month ? ' selected' : ''}>${esc(name)}</option>`).join('');
  }

  function currentView() {
    if (state.editing && state.draft) return state.draft;
    return monthView(state.data, state.year, state.month, monitoring);
  }

  function focusKeyOf(target) {
    const button = target?.closest?.('[data-mon-blast],[data-mon-point][data-mon-day]');
    if (!button) return '';
    return button.dataset.monBlast !== undefined ? `blast:${button.dataset.monBlast}` : `cell:${button.dataset.monPoint}:${button.dataset.monDay}`;
  }

  function render(restoreFocus = '') {
    const view = currentView();
    const summary = monthSummary(view, monitoring);
    els.grid.innerHTML = renderMonthGrid(view, monitoring, {editable: state.editing});
    els.legend.innerHTML = renderLegend(monitoring);
    els.counts.innerHTML = renderCounts(summary, monitoring);
    els.community.innerHTML = renderCommunityTable(summary, monitoring);
    const label = `${monthTitle(monitoring, state.month)} ${state.year}`;
    const notices = [];
    const source = sourceNotice();
    if (source) notices.push(source);
    if (!view.hasRecord) notices.push({tone: 'warning', text: `Sem dados de monitoramento para ${label} na planilha. A grade mostra apenas o calendário.`});
    else if (!view.desmontes.size && !summary.monitoramentos && !state.editing) notices.push({tone: 'info', text: `Nenhum desmonte ou monitoramento registrado em ${label}.`});
    setNotices(notices);
    els.sourceLabel.textContent = sourceText();
    els.grid.setAttribute('aria-label', `Tabela de avanço do monitoramento, ${label}`);
    els.editToggle.setAttribute('aria-pressed', String(state.editing));
    els.editToggle.textContent = state.editing ? 'Editando' : 'Editar dados';
    els.save.hidden = !state.editing;
    els.cancel.hidden = !state.editing;
    els.save.disabled = state.busy;
    if (restoreFocus) {
      const target = [...els.grid.querySelectorAll('button')].find(b => focusKeyOf(b) === restoreFocus);
      target?.focus();
    }
  }

  function setPeriod(year, month) {
    if (state.editing && state.dirty) {
      say('Alterações não salvas foram descartadas ao trocar de período.', true);
    }
    state.editing = false;
    state.draft = null;
    state.dirty = false;
    state.year = year;
    state.month = month;
    refreshYearOptions();
    render();
  }

  function stepMonth(delta) {
    let year = state.year, month = state.month + delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    setPeriod(year, month);
  }

  function setEditing(on) {
    if (on) {
      state.editing = true;
      state.draft = monthView(state.data, state.year, state.month, monitoring);
      state.dirty = false;
      say('Edição ativa: clique nos dias (D) e nas células (M). Células N não são editáveis. Clique em "Salvar no Google Drive" para gravar.');
    } else {
      state.editing = false;
      state.draft = null;
      state.dirty = false;
    }
    render();
  }

  function onGridClick(event) {
    if (!state.editing) return;
    const button = event.target.closest('button');
    if (!button) return;
    const key = focusKeyOf(button);
    if (button.dataset.monBlast !== undefined) {
      state.draft = toggleBlast(state.draft, Number(button.dataset.monBlast));
    } else if (button.dataset.monPoint !== undefined) {
      state.draft = toggleMonitored(state.draft, button.dataset.monPoint, Number(button.dataset.monDay));
    } else {
      return;
    }
    state.dirty = true;
    render(key);
  }

  function openLogin() {
    if (!monitoring.apiUrl) {
      say('Gravação indisponível: API não configurada. Preencha monitoring.apiUrl em config.json com a URL do Apps Script implantado.', true);
      return;
    }
    els.loginError.hidden = true;
    els.loginError.textContent = '';
    state.lastOpener = document.activeElement;
    els.loginDialog.showModal();
    els.loginUser.focus();
  }

  function closeLogin() {
    els.loginPassword.value = '';
    els.loginDialog.close();
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    const user = els.loginUser.value;
    const password = els.loginPassword.value;
    els.loginPassword.value = '';
    els.loginError.hidden = true;
    let payload;
    try {
      payload = buildSavePayload(state.draft, monitoring, {user, password});
    } catch (error) {
      els.loginError.textContent = error.message;
      els.loginError.hidden = false;
      return;
    }
    state.busy = true;
    els.loginSubmit.disabled = true;
    els.loginSubmit.textContent = 'Gravando…';
    try {
      const result = await saveRemoteMonth(monitoring, payload);
      if (!result.ok) {
        els.loginError.textContent = result.message || 'O servidor recusou a gravação.';
        els.loginError.hidden = false;
        logEvent('error', 'Gravação recusada pela API', {year: payload.year, month: payload.month, message: result.message});
        return;
      }
      logEvent('export', 'Mês gravado pela API', {year: payload.year, month: payload.month});
      const previous = state.data.years[String(payload.year)]?.months?.[String(payload.month)];
      const years = {...state.data.years};
      years[String(payload.year)] = {months: {...(years[String(payload.year)]?.months ?? {}), [String(payload.month)]: {
        desmontes: payload.desmontes, points: payload.points, anomalies: previous?.anomalies ?? [],
      }}};
      state.data = {...state.data, years};
      state.editing = false;
      state.draft = null;
      state.dirty = false;
      closeLogin();
      try {
        state.data = validateMonitoringData(await readRemoteData(monitoring), monitoring);
        state.source = {kind: 'api', label: 'Google Drive (API)', reason: '', generatedAt: state.data.generatedAt || ''};
        say(`${result.message || 'Gravado no Google Drive.'} Dados atualizados pela API.`);
      } catch (error) {
        state.source = {kind: 'api', label: 'Google Drive (API)', reason: '', generatedAt: ''};
        say(`${result.message || 'Gravado no Google Drive.'} Não foi possível reler a API (${error.message}); a grade mostra o valor gravado.`, true);
      }
      refreshYearOptions();
      render();
    } catch (error) {
      const message = error instanceof MonitoringApiError ? error.message : `Erro inesperado: ${error.message}`;
      els.loginError.textContent = message;
      els.loginError.hidden = false;
      logEvent('error', 'Falha ao gravar o monitoramento', {message});
    } finally {
      state.busy = false;
      els.loginSubmit.disabled = false;
      els.loginSubmit.textContent = 'Entrar e salvar';
    }
  }

  function openYear() {
    els.yearTitle.textContent = `Monitoramento de ${state.year}`;
    els.yearBody.innerHTML = renderYearBody(state.data, state.year, monitoring);
    state.lastOpener = document.activeElement;
    els.yearDialog.showModal();
    els.yearClose.focus();
  }

  async function exportPdf(mode) {
    if (state.busy) return;
    const JsPDF = globalThis.jspdf?.jsPDF;
    if (!JsPDF) { say('Biblioteca jsPDF não carregada; não é possível exportar.', true); return; }
    if (state.editing && state.dirty) { say('Grave ou cancele a edição antes de exportar o PDF.', true); return; }
    state.busy = true;
    try {
      if (!state.assets) state.assets = {brand: await loadImageAsset('assets/enaex-white.png')};
      const doc = buildMonitoringPdf(JsPDF, {data: state.data, monitoring, mode, year: state.year, month: state.month, assets: state.assets});
      const fileName = monitoringFileName(monitoring, mode, state.year, state.month);
      doc.save(fileName);
      logEvent('export', 'PDF do monitoramento gerado', {mode, year: state.year, month: state.month, file: fileName});
      say(`PDF gerado: ${fileName}.`);
    } catch (error) {
      say(`Não foi possível exportar o PDF. ${error.message}`, true);
    } finally {
      state.busy = false;
    }
  }

  // Eventos
  els.year.addEventListener('change', () => setPeriod(Number(els.year.value), state.month));
  els.month.addEventListener('change', () => setPeriod(state.year, Number(els.month.value)));
  els.prev.addEventListener('click', () => stepMonth(-1));
  els.next.addEventListener('click', () => stepMonth(1));
  els.editToggle.addEventListener('click', () => setEditing(!state.editing));
  els.cancel.addEventListener('click', () => { state.editing = false; state.draft = null; state.dirty = false; say('Edição cancelada; nenhuma alteração foi gravada.'); render(); });
  els.save.addEventListener('click', openLogin);
  els.loginCancel.addEventListener('click', closeLogin);
  els.loginForm.addEventListener('submit', onLoginSubmit);
  els.loginDialog.addEventListener('close', () => { els.loginPassword.value = ''; state.lastOpener?.focus?.(); });
  els.grid.addEventListener('click', onGridClick);
  els.openYear.addEventListener('click', openYear);
  els.yearClose.addEventListener('click', () => els.yearDialog.close());
  els.yearDialog.addEventListener('close', () => state.lastOpener?.focus?.());
  els.exportMonth.addEventListener('click', () => exportPdf('month'));
  els.exportYear.addEventListener('click', () => exportPdf('year'));

  await loadData();
  refreshYearOptions();
  render();
  logEvent('init', 'Seção de monitoramento inicializada', {source: state.source.kind, year: state.year, month: state.month, days: daysInMonth(state.year, state.month)});
}
