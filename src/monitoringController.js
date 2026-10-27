// Controlador da seção "Avanço do monitoramento": carregamento de dados (Google Drive ou última cópia),
// navegação por ano/mês, edição com login em diálogo pequeno, gravação, visão anual e exportação PDF.
// As credenciais ficam apenas em memória (state.credentials) durante a página; nunca são persistidas.
// A tela mostra só mensagens em linguagem simples; detalhes técnicos vão para o log.
import {logEvent} from './logger.js';
import {
  buildAuthPayload, buildSavePayload, daysInMonth, monthSummary, monthView, toggleBlast, toggleMonitored, validateMonitoringData,
} from './monitoringData.js';
import {readRemoteData, saveRemoteMonth, checkRemoteAccess} from './monitoringApi.js';
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
  const ui = monitoring.ui;
  const colors = monitoring.colors;
  for (const [key, value] of Object.entries({header: colors.header, monitored: colors.monitored, notInMonth: colors.notInMonth, blast: colors.blastMark, grid: colors.grid})) {
    section.style.setProperty(`--mon-${key}`, value);
  }
  const now = new Date();
  const state = {
    data: {schemaVersion: 1, years: {}},
    // kind: 'api' (Google Drive), 'snapshot' (última cópia publicada, sem conexão) ou 'error' (nada disponível).
    source: {kind: 'none', generatedAt: ''},
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    editing: false,
    draft: null,
    dirty: false,
    busy: false,
    authPending: false,
    credentials: null,   // {user, password}: somente em memória, durante a sessão da página
    loginUser: '',       // último usuário informado (apenas o nome, para preencher o campo)
    assets: null,
    lastOpener: null,
  };
  const els = {
    year: $('mon-year'), month: $('mon-month'), prev: $('mon-prev'), next: $('mon-next'),
    grid: $('mon-grid-wrap'), legend: $('mon-legend'), counts: $('mon-counts'), community: $('mon-community'),
    notice: $('monitoring-notice'), message: $('mon-message'), sourceLabel: $('monitoring-source-label'),
    editToggle: $('mon-edit-toggle'), save: $('mon-save'), cancel: $('mon-cancel'),
    openYear: $('mon-open-year'), exportMonth: $('mon-export-month'), exportYear: $('mon-export-year'),
    loginDialog: $('mon-login-dialog'), loginForm: $('mon-login-form'), loginTitle: $('mon-login-title'),
    loginHint: $('mon-login-hint'), loginUser: $('mon-login-user'), loginPassword: $('mon-login-password'),
    loginError: $('mon-login-error'), loginSubmit: $('mon-login-submit'), loginCancel: $('mon-login-cancel'),
    yearDialog: $('mon-year-dialog'), yearTitle: $('mon-year-title'), yearBody: $('mon-year-body'), yearClose: $('mon-year-close'),
    toast: $('toast'),
  };

  function say(text, error = false) {
    els.message.hidden = false;
    els.message.textContent = text;
    els.message.className = error ? 'mon-message is-error' : 'mon-message';
    els.message.setAttribute('role', error ? 'alert' : 'status');
    logEvent(error ? 'error' : 'info', text);
  }

  let toastTimer = 0;
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.className = 'toast is-success';
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4000);
  }

  /** Avisos persistentes (conexão e situação do mês), um parágrafo por aviso. */
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

  /** Sem conexão, mostra um aviso neutro; com dados ao vivo não mostra nada. */
  function sourceNotice() {
    if (state.source.kind === 'snapshot') return {tone: 'info', text: ui.offlineNotice};
    if (state.source.kind === 'error') return {tone: 'warning', text: ui.loadFailedNotice};
    return null;
  }

  /** Lê o Google Drive; se não for possível, usa a última cópia publicada e registra o motivo no log. */
  async function loadData() {
    if (!monitoring.apiUrl) {
      logEvent('info', 'monitoring.apiUrl vazio em config.json; exibindo a última cópia publicada.');
    } else {
      try {
        const data = validateMonitoringData(await readRemoteData(monitoring), monitoring);
        state.data = data;
        state.source = {kind: 'api', generatedAt: data.generatedAt || ''};
        logEvent('info', 'Monitoramento lido do Google Drive', {years: Object.keys(data.years)});
        return;
      } catch (error) {
        logEvent('error', 'Leitura do Google Drive falhou; exibindo a última cópia publicada', {kind: error.kind, message: error.message});
      }
    }
    try {
      const response = await fetch(monitoring.snapshotPath, {cache: 'no-cache'});
      if (!response.ok) throw new Error(`HTTP ${response.status} ao obter ${monitoring.snapshotPath}.`);
      const data = validateMonitoringData(await response.json(), monitoring);
      state.data = data;
      state.source = {kind: 'snapshot', generatedAt: data.generatedAt || ''};
    } catch (error) {
      state.data = {schemaVersion: 1, years: {}};
      state.source = {kind: 'error', generatedAt: ''};
      logEvent('error', 'Última cópia do monitoramento indisponível', {message: error.message});
    }
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
    els.grid.setAttribute('aria-label', `Tabela de avanço do monitoramento, ${label}`);
    els.editToggle.hidden = state.editing;
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

  function startEditing() {
    state.editing = true;
    state.draft = monthView(state.data, state.year, state.month, monitoring);
    state.dirty = false;
    say(ui.editHint);
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

  // ---- Diálogo de login (pequeno, com fundo desfocado) ----

  function setLoginError(text) {
    els.loginError.textContent = text;
    els.loginError.hidden = !text;
  }

  function setLoginBusy(busy) {
    state.authPending = busy;
    els.loginUser.disabled = busy;
    els.loginPassword.disabled = busy;
    els.loginSubmit.disabled = busy;
    els.loginSubmit.textContent = busy ? ui.verifying : ui.loginButton;
  }

  /** Abre o diálogo de login. Sem apiUrl configurada, mostra que a edição está indisponível. */
  function openLogin() {
    const unavailable = !monitoring.apiUrl;
    els.loginUser.value = state.loginUser;
    els.loginPassword.value = '';
    setLoginError(unavailable ? ui.editUnavailable : '');
    els.loginUser.disabled = unavailable;
    els.loginPassword.disabled = unavailable;
    els.loginSubmit.disabled = unavailable;
    if (unavailable) logEvent('info', 'Edição indisponível: monitoring.apiUrl vazio em config.json.');
    state.lastOpener = document.activeElement;
    if (!els.loginDialog.open) els.loginDialog.showModal();
    (unavailable ? els.loginCancel : els.loginUser).focus();
  }

  function closeLogin() {
    els.loginPassword.value = '';
    els.loginDialog.close();
  }

  /** Verifica usuário e senha no servidor. Só entra em modo de edição após o acesso ser confirmado. */
  async function onLoginSubmit(event) {
    event.preventDefault();
    if (state.authPending) return;
    const user = els.loginUser.value.trim();
    const password = els.loginPassword.value;
    setLoginError('');
    try {
      buildAuthPayload(monitoring, {user, password});
    } catch (error) {
      setLoginError(error.message);
      return;
    }
    state.loginUser = user;
    setLoginBusy(true);
    let result = null;
    try {
      result = await checkRemoteAccess(monitoring, {user, password});
    } catch (error) {
      logEvent('error', 'Verificação de acesso falhou', {kind: error.kind, message: error.message});
    } finally {
      setLoginBusy(false);
    }
    if (!result) {
      els.loginPassword.value = '';
      setLoginError(ui.editUnavailable);
      return;
    }
    if (!result.ok) {
      logEvent('info', 'Acesso recusado pelo servidor', {code: result.code});
      els.loginPassword.value = '';
      setLoginError(result.message || ui.editUnavailable);
      els.loginPassword.focus();
      return;
    }
    state.credentials = {user, password};
    els.loginPassword.value = '';
    els.loginDialog.close();
    if (state.editing) render();
    else startEditing();
    els.save.focus();
  }

  // ---- Gravação ----

  /** Grava com as credenciais da sessão, sem novo pedido de senha. */
  async function onSave() {
    if (state.busy) return;
    if (!state.credentials) { openLogin(); return; }
    let payload;
    try {
      payload = buildSavePayload(state.draft, monitoring, state.credentials);
    } catch (error) {
      say(error.message, true);
      return;
    }
    state.busy = true;
    els.save.disabled = true;
    els.save.textContent = ui.saving;
    let result = null;
    try {
      result = await saveRemoteMonth(monitoring, payload);
    } catch (error) {
      logEvent('error', 'Falha de comunicação ao gravar o monitoramento', {kind: error.kind, message: error.message});
    } finally {
      state.busy = false;
      els.save.disabled = false;
      els.save.textContent = ui.saveButton;
    }
    if (!result) {
      say(ui.saveFailed, true);
      return;
    }
    if (!result.ok && (result.code === 'auth' || result.code === 'locked')) {
      // Credenciais recusadas (ex.: senha alterada): pede o acesso de novo; o rascunho continua na grade.
      logEvent('error', 'Credenciais recusadas ao gravar', {code: result.code});
      state.credentials = null;
      openLogin();
      setLoginError(result.message || ui.editUnavailable);
      return;
    }
    if (!result.ok) {
      logEvent('error', 'Gravação recusada pelo servidor', {code: result.code, message: result.message});
      say(ui.saveFailed, true);
      return;
    }
    logEvent('export', 'Mês gravado no Google Drive', {year: payload.year, month: payload.month});
    const previous = state.data.years[String(payload.year)]?.months?.[String(payload.month)];
    const years = {...state.data.years};
    years[String(payload.year)] = {months: {...(years[String(payload.year)]?.months ?? {}), [String(payload.month)]: {
      desmontes: payload.desmontes, points: payload.points, anomalies: previous?.anomalies ?? [],
    }}};
    state.data = {...state.data, years};
    state.editing = false;
    state.draft = null;
    state.dirty = false;
    try {
      state.data = validateMonitoringData(await readRemoteData(monitoring), monitoring);
      state.source = {kind: 'api', generatedAt: state.data.generatedAt || ''};
    } catch (error) {
      // A grade mantém o valor gravado; o aviso neutro indica que a releitura não ocorreu.
      state.source = {kind: 'snapshot', generatedAt: ''};
      logEvent('error', 'Releitura do Google Drive falhou após gravar', {kind: error.kind, message: error.message});
    }
    els.message.hidden = true;
    refreshYearOptions();
    render();
    showToast(ui.savedToast);
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

  // Textos fixos vindos de config.json
  els.sourceLabel.textContent = ui.sourceText;
  els.loginTitle.textContent = ui.loginTitle;
  els.loginHint.textContent = ui.loginHint;
  els.loginSubmit.textContent = ui.loginButton;
  els.save.textContent = ui.saveButton;

  // Eventos
  els.year.addEventListener('change', () => setPeriod(Number(els.year.value), state.month));
  els.month.addEventListener('change', () => setPeriod(state.year, Number(els.month.value)));
  els.prev.addEventListener('click', () => stepMonth(-1));
  els.next.addEventListener('click', () => stepMonth(1));
  els.editToggle.addEventListener('click', openLogin);
  els.cancel.addEventListener('click', () => { state.editing = false; state.draft = null; state.dirty = false; say(ui.cancelled); render(); });
  els.save.addEventListener('click', onSave);
  els.loginCancel.addEventListener('click', closeLogin);
  els.loginForm.addEventListener('submit', onLoginSubmit);
  els.loginDialog.addEventListener('close', () => {
    els.loginPassword.value = '';
    if (!state.editing) state.lastOpener?.focus?.();
  });
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
