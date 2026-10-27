// Renderização (HTML) das tabelas do monitoramento: grade do mês, legenda, contagens,
// tabela por comunidade e visão anual. Textos e cores vêm de config.json (bloco monitoring).
import {cellState, monthSummary, monthView, yearSummary} from './monitoringData.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Nome do mês para títulos, a partir de config.monitoring.monthNames (ex.: "OUTUBRO"). */
export function monthTitle(monitoring, month) {
  return `${String(month).padStart(2, '0')}. ${monitoring.monthNames[month - 1]}`;
}

/** Grade do mês (tabela 1). Em modo de edição, D e M viram botões acessíveis. */
export function renderMonthGrid(view, monitoring, {editable = false, compact = false, idPrefix = 'mon'} = {}) {
  const days = Array.from({length: monitoring.layout.dayCount}, (_, i) => i + 1);
  const headerCells = days.map(d => `<th scope="col" class="${d > view.daysInMonth ? 'is-out' : ''}">${d}</th>`).join('');
  const blastCells = days.map(d => {
    const isBlast = view.desmontes.has(d);
    const out = d > view.daysInMonth;
    const mark = isBlast ? esc(monitoring.layout.dayMarker) : '';
    if (editable && !out) {
      return `<td class="mon-blast-cell"><button type="button" class="mon-toggle mon-blast-toggle" data-mon-blast="${d}" aria-pressed="${isBlast}" aria-label="Dia ${d}: ${isBlast ? 'com desmonte' : 'sem desmonte'}. Alternar">${mark}</button></td>`;
    }
    return `<td class="mon-blast-cell${out ? ' is-out' : ''}" aria-label="${isBlast ? `Dia ${d} com desmonte` : ''}">${out ? '' : mark}</td>`;
  }).join('');
  const bodyRows = monitoring.points.map(name => {
    const cells = days.map(d => {
      const state = cellState(view, name, d);
      const label = state === 'M' ? monitoring.layout.monitoredMarker : state === 'N' ? monitoring.layout.notInMonthMarker : '';
      const cls = state === 'M' ? 'is-M' : state === 'N' ? 'is-N' : '';
      if (editable && state !== 'N') {
        const on = state === 'M';
        return `<td class="mon-cell ${cls}"><button type="button" class="mon-toggle mon-cell-toggle" data-mon-point="${esc(name)}" data-mon-day="${d}" aria-pressed="${on}" aria-label="${esc(name)}, dia ${d}: ${on ? 'monitorado' : 'não monitorado'}. Alternar">${label}</button></td>`;
      }
      return `<td class="mon-cell ${cls}">${label}</td>`;
    }).join('');
    return `<tr><th scope="row" class="mon-point">${esc(name)}</th>${cells}</tr>`;
  }).join('');
  const headerLabel = esc(monitoring.labels.pointHeader);
  return `<table class="mon-grid${compact ? ' is-compact' : ''}" id="${idPrefix}-grid" data-year="${view.year}" data-month="${view.month}">
    <caption class="sr-only">${esc(monitoring.labels.tableTitle)} — ${esc(monthTitle(monitoring, view.month))} ${view.year}</caption>
    <thead>
      <tr class="mon-blast-row"><th scope="row" class="mon-point mon-point--head">${headerLabel}</th>${blastCells}</tr>
      <tr class="mon-day-row"><th scope="col" class="mon-point mon-point--head"><span class="sr-only">Dia</span></th>${headerCells}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

/** Legenda (blank, M, N e D), com os mesmos textos da planilha. */
export function renderLegend(monitoring) {
  const l = monitoring.labels;
  return `<div class="mon-legend"><p class="mon-block-title">${esc(l.legendTitle)}</p><ul>
    <li><span class="mon-swatch"></span><span>${esc(l.blankLegend)}</span></li>
    <li><span class="mon-swatch is-M">${esc(monitoring.layout.monitoredMarker)}</span><span>${esc(l.monitoredLegend)}</span></li>
    <li><span class="mon-swatch is-N">${esc(monitoring.layout.notInMonthMarker)}</span><span>${esc(l.notInMonthLegend)}</span></li>
    <li><span class="mon-swatch is-D">${esc(monitoring.layout.dayMarker)}</span><span>${esc(l.blastLegend)}</span></li>
  </ul></div>`;
}

/** Contagens do mês (desmontes e monitoramentos totais). */
export function renderCounts(summary, monitoring) {
  const l = monitoring.labels;
  return `<div class="mon-counts">
    <div class="mon-count"><span>${esc(l.desmontesCount)}</span><strong data-mon-count="desmontes">${summary.desmontes}</strong></div>
    <div class="mon-count"><span>${esc(l.monitoringCount)}</span><strong data-mon-count="monitoramentos">${summary.monitoramentos}</strong></div>
  </div>`;
}

/** Tabela "Qtd. Monitoramentos/Comunidade". */
export function renderCommunityTable(summary, monitoring) {
  const rows = monitoring.points.map(name => `<tr><th scope="row">${esc(name)}</th><td>${summary.perPoint[name]}</td></tr>`).join('');
  return `<div class="mon-community"><p class="mon-block-title">${esc(monitoring.labels.communityTable)}</p>
    <table class="mon-mini-table"><tbody>${rows}</tbody><tfoot><tr><th scope="row">Total</th><td>${summary.monitoramentos}</td></tr></tfoot></table></div>`;
}

/** Corpo do diálogo anual: os 12 meses e o resumo do ano. */
export function renderYearBody(data, year, monitoring) {
  const months = Array.from({length: 12}, (_, i) => i + 1).map(month => {
    const view = monthView(data, year, month, monitoring);
    const summary = monthSummary(view, monitoring);
    return `<section class="mon-year-month" aria-labelledby="mon-year-${month}">
      <h3 id="mon-year-${month}">${esc(monthTitle(monitoring, month))} ${year}</h3>
      ${view.hasRecord ? '' : '<p class="mon-notice-inline">Sem dados de monitoramento para este mês na planilha.</p>'}
      <div class="mon-table-wrap">${renderMonthGrid(view, monitoring, {compact: true, idPrefix: `mon-y${month}`})}</div>
      <p class="mon-inline-counts">Desmontes: <strong>${summary.desmontes}</strong> · Monitoramentos: <strong>${summary.monitoramentos}</strong></p>
    </section>`;
  }).join('');
  const {months: rows, totals} = yearSummary(data, year, monitoring);
  const head = monitoring.points.map(name => `<th scope="col">${esc(name.replace(/^Comunidade /, ''))}</th>`).join('');
  const body = rows.map(r => `<tr><th scope="row">${esc(monthTitle(monitoring, r.month))}</th><td>${r.desmontes}</td><td>${r.monitoramentos}</td>${monitoring.points.map(n => `<td>${r.perPoint[n]}</td>`).join('')}</tr>`).join('');
  const summary = `<section class="mon-year-summary" aria-labelledby="mon-year-summary-title">
    <h3 id="mon-year-summary-title">Resumo anual ${year}</h3>
    <div class="mon-table-wrap"><table class="mon-summary-table">
      <thead><tr><th scope="col">Mês</th><th scope="col">Desmontes</th><th scope="col">Monitoramentos</th>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th scope="row">Total</th><td>${totals.desmontes}</td><td>${totals.monitoramentos}</td>${monitoring.points.map(n => `<td>${totals.perPoint[n]}</td>`).join('')}</tr></tfoot>
    </table></div></section>`;
  return months + summary;
}

