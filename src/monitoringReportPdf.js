// Relatório de apresentação do monitoramento (PDF no modelo da referência "RT - DESVIOS DE PERFURAÇÃO - PC56B").
// Três páginas: capa e resumo (filtros, indicadores e comunidades), grade do mês e resumo anual.
// Usa os mesmos dados do dashboard (monitoringData.js) e o mesmo desenho do Gantt (painter de monitoringGantt.js);
// layout, cores, tamanhos e textos vêm de monitoring.report (config.json). Não grava nenhum dado.
import {cellState, monthSummary, monthView, yearSummary} from './monitoringData.js';
import {measureWith, painter} from './monitoringGantt.js?v=1.5.0';
import {drawOpsPdf} from './monitoringPdf.js?v=1.5.0';
import {monthTitle} from './monitoringView.js';
import {reportSettings} from './monitoringReportConfig.js?v=1.5.0';

/** Preenche marcadores {chave} de um texto de config.json. */
const fill = (template, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
const pad2 = n => String(n).padStart(2, '0');
const upper = s => s.toLocaleUpperCase('pt-BR');

/** "Outubro" a partir de monitoring.monthNames (que vêm em maiúsculas). */
export function monthNameCapitalized(monitoring, month) {
  const name = monitoring.monthNames[month - 1].toLocaleLowerCase('pt-BR');
  return `${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)}`;
}

/** "Outubro de 2026". */
export function periodLabel(monitoring, year, month) {
  return `${monthNameCapitalized(monitoring, month)} de ${year}`;
}

/** Data e hora de emissão no formato dd/mm/aaaa hh:mm (horário local de quem gera o relatório). */
export function issuedLabel(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Nome do arquivo a partir de monitoring.report.fileName (ex.: relatorio-monitoramento-2026-10.pdf). */
export function reportFileName(monitoring, year, month) {
  return fill(reportSettings(monitoring).fileName, {year, month: pad2(month)});
}

/** Cabeçalho de todas as páginas: logotipos à direita, título em caixa alta e subtítulo. */
function header(P, ctx, title, subtitle) {
  const {rs, assets, W, M} = ctx;
  const {layout: L, sizes: S, colors: C, logos} = rs;
  const right = W - M;
  const enaexW = logos.height * assets.enaex.width / assets.enaex.height;
  const clientW = logos.height * assets.client.width / assets.client.height;
  const enaexX = right - enaexW;
  const clientX = enaexX - logos.gap - clientW;
  P.ops.push({t: 'image', key: 'client', x: clientX, y: logos.top, w: clientW, h: logos.height});
  P.ops.push({t: 'image', key: 'enaex', x: enaexX, y: logos.top, w: enaexW, h: logos.height});
  P.text(upper(title), M, L.titleY, {size: S.title, color: C.title});
  P.text(subtitle, M, L.subtitleY, {size: S.subtitle, color: C.secondary});
}

/** Rodapé: filete grafite de 1 pt e texto de classificação alinhado à direita. */
function footer(P, ctx) {
  const {rs, W, M} = ctx;
  const {layout: L, sizes: S, colors: C, labels} = rs;
  P.hline(M, W - M, L.footerRuleY, C.footerRule, 0.99);
  P.text(labels.footer, W - M, L.footerY, {size: S.footer, color: C.secondary, align: 'right'});
}

/** Página 1: título, filtros aplicados, seis indicadores e tabela por comunidade. */
function coverPage(ctx, P) {
  const {rs, monitoring, year, month, source, issued, summary, annual, W, M} = ctx;
  const {layout: L, sizes: S, colors: C, labels} = rs;
  const CW = W - 2 * M;
  header(P, ctx, `${labels.title} - ${monitoring.monthNames[month - 1]} ${year}`, monitoring.subtitle);

  // Filtros aplicados: rótulo pequeno e valor, em sequência na mesma linha.
  const filters = [
    [labels.periodLabel, periodLabel(monitoring, year, month)],
    [labels.pointsLabel, fill(labels.pointsAll, {count: monitoring.points.length})],
    [labels.sourceLabel, source === 'api' ? labels.sourceLive : labels.sourceSnapshot],
    [labels.issuedLabel, issuedLabel(issued)],
  ];
  let fx = M;
  for (const [label, value] of filters) {
    P.text(label, fx, L.filterLabelY, {size: S.filterLabel, bold: true, color: C.muted});
    P.text(value, fx, L.filterValueY, {size: S.filterValue, color: C.ink});
    fx += Math.max(P.textWidth(label, S.filterLabel, true), P.textWidth(value, S.filterValue)) + L.filterGap;
  }

  // Indicadores em três colunas, duas linhas: mês (linha 1) e ano (linha 2).
  const zeroPoints = monitoring.points.filter(name => summary.perPoint[name] === 0).length;
  const monthsWithMonitoring = annual.months.filter(r => r.monitoramentos > 0).length;
  const colW = CW / 3;
  const kpi = (col, labelY, valueY, label, value, note, alert) => {
    const x = M + L.kpiInset + col * colW;
    P.text(label, x, labelY, {size: S.kpiLabel, color: C.secondary});
    P.text(String(value), x, valueY, {size: S.kpiValue, bold: true, color: alert ? C.alert : C.ink});
    if (note) P.text(note, x, valueY + L.kpiNoteOffset, {size: S.kpiNote, color: C.secondary});
  };
  kpi(0, L.kpiRow1LabelY, L.kpiRow1ValueY, labels.blastsMonth, summary.desmontes);
  kpi(1, L.kpiRow1LabelY, L.kpiRow1ValueY, labels.monitoringsMonth, summary.monitoramentos);
  kpi(2, L.kpiRow1LabelY, L.kpiRow1ValueY, labels.pointsWithoutMonth, zeroPoints, fill(labels.pointsNote, {total: monitoring.points.length}), zeroPoints > 0);
  kpi(0, L.kpiRow2LabelY, L.kpiRow2ValueY, labels.blastsYear, annual.totals.desmontes);
  kpi(1, L.kpiRow2LabelY, L.kpiRow2ValueY, labels.monitoringsYear, annual.totals.monitoramentos);
  kpi(2, L.kpiRow2LabelY, L.kpiRow2ValueY, labels.monthsWithMonitoring, monthsWithMonitoring, labels.monthsNote, false);

  // Tabela por comunidade: coluna do mês e coluna do ano; filete no cabeçalho e total com filete grafite.
  const nameX = M + L.tableInset;
  const monthX = M + L.monthColumnRatio * CW, yearX = M + L.yearColumnRatio * CW;
  P.text(labels.communityTitle, M, L.tableTitleY, {size: S.sectionTitle, color: C.ink});
  P.text(labels.communityColumn, nameX, L.tableHeaderY, {size: S.tableHeader, bold: true, color: C.muted});
  P.text(monthNameCapitalized(monitoring, month), monthX, L.tableHeaderY, {size: S.tableHeader, bold: true, color: C.muted, align: 'center'});
  P.text(fill(labels.yearHeader, {year}), yearX, L.tableHeaderY, {size: S.tableHeader, bold: true, color: C.muted, align: 'center'});
  P.hline(M, W - M, L.tableRuleY, C.rule, 0.71);
  monitoring.points.forEach((name, i) => {
    const y = L.tableTop + i * L.tableRowHeight, base = P.vcenter(y, L.tableRowHeight, S.tableBody);
    P.text(name, nameX, base, {size: S.tableBody, color: C.ink});
    P.text(String(summary.perPoint[name]), monthX, base, {size: S.tableBody, color: C.ink, align: 'center'});
    P.text(String(annual.totals.perPoint[name]), yearX, base, {size: S.tableBody, color: C.ink, align: 'center'});
  });
  const totalY = L.tableTop + monitoring.points.length * L.tableRowHeight;
  const totalBase = P.vcenter(totalY, L.tableRowHeight, S.tableBody);
  P.hline(M, W - M, totalY, C.ink, 0.99);
  P.text(labels.totalRow, nameX, totalBase, {size: S.tableBody, bold: true, color: C.ink});
  P.text(String(summary.monitoramentos), monthX, totalBase, {size: S.tableBody, bold: true, color: C.ink, align: 'center'});
  P.text(String(annual.totals.monitoramentos), yearX, totalBase, {size: S.tableBody, bold: true, color: C.ink, align: 'center'});
  footer(P, ctx);
}

/** Desenha um marcador quadrado (D, M ou N) centralizado no dia e na linha. */
function marker(P, ctx, x, rowTop, rowH, fill, label, textColor) {
  const {rs} = ctx;
  const size = rs.layout.markSize, top = rowTop + (rowH - size) / 2;
  P.fillRect(x, top, size, size, fill);
  P.boxText([label], x, top, size, size, {size: rs.sizes.mark, bold: true, color: textColor});
}

/** Página 2: grade do mês (linha D e uma linha por ponto), legenda e aviso quando não há registro. */
function gridPage(ctx, P) {
  const {rs, monitoring, year, month, view, W, M} = ctx;
  const {layout: L, sizes: S, colors: C, labels} = rs;
  const cells = monitoring.layout;
  const CW = W - 2 * M, right = W - M;
  header(P, ctx, `${labels.gridTitle} - ${monitoring.monthNames[month - 1]} ${year}`, labels.gridSubtitle);

  const dayW = (CW - L.labelWidth) / cells.dayCount;
  const dayX = d => M + L.labelWidth + (d - 1) * dayW;
  const blastTop = L.gridTop, dayTop = blastTop + L.blastRowHeight, pointsTop = dayTop + L.dayRowHeight;
  const gridBottom = pointsTop + monitoring.points.length * L.pointRowHeight;
  const markX = d => dayX(d) + (dayW - L.markSize) / 2;

  // Linha D: dias com desmonte.
  P.text(labels.blastRowLabel, M, P.vcenter(blastTop, L.blastRowHeight, S.gridLabel), {size: S.gridLabel, bold: true, color: C.secondary});
  for (let d = 1; d <= cells.dayCount; d++) {
    if (view.desmontes.has(d)) marker(P, ctx, markX(d), blastTop, L.blastRowHeight, C.blast, cells.dayMarker, C.blastText);
  }
  // Linha dos dias.
  P.text(monitoring.labels.pointHeader, M, P.vcenter(dayTop, L.dayRowHeight, S.gridDay), {size: S.gridDay, bold: true, color: C.muted});
  for (let d = 1; d <= cells.dayCount; d++) {
    P.boxText([String(d)], dayX(d), dayTop, dayW, L.dayRowHeight, {size: S.gridDay, bold: true, color: C.muted, align: 'center'});
  }
  P.hline(M, right, dayTop + L.dayRowHeight, C.rule, 0.71);
  // Uma linha por ponto: M monitorado, N fora do calendário do mês, vazio quando não monitorado.
  monitoring.points.forEach((name, k) => {
    const y = pointsTop + k * L.pointRowHeight, h = L.pointRowHeight;
    P.text(name, M, P.vcenter(y, h, S.gridLabel), {size: S.gridLabel, color: C.ink});
    for (let d = 1; d <= cells.dayCount; d++) {
      const state = cellState(view, name, d);
      if (state === 'M') marker(P, ctx, markX(d), y, h, C.monitored, cells.monitoredMarker, C.monitoredText);
      else if (state === 'N') marker(P, ctx, markX(d), y, h, C.notInMonth, cells.notInMonthMarker, C.notInMonthText);
    }
    P.hline(M, right, y + h, k === monitoring.points.length - 1 ? C.ink : C.rule, k === monitoring.points.length - 1 ? 0.99 : 0.5);
  });
  for (let d = 0; d <= cells.dayCount; d++) P.vline(M + L.labelWidth + d * dayW, dayTop, gridBottom, C.grid, 0.35);

  // Legenda em uma linha abaixo da grade.
  const legendY = gridBottom + L.legendOffset;
  P.text(monitoring.labels.legendTitle, M, P.vcenter(legendY, L.markSize, S.legendTitle), {size: S.legendTitle, bold: true, color: C.ink});
  let lx = M + P.textWidth(monitoring.labels.legendTitle, S.legendTitle, true) + 18;
  const legend = [
    [null, labels.legendBlank],
    [{fill: C.monitored, mark: cells.monitoredMarker, color: C.monitoredText}, labels.legendMonitored],
    [{fill: C.notInMonth, mark: cells.notInMonthMarker, color: C.notInMonthText}, labels.legendNotInMonth],
    [{fill: C.blast, mark: cells.dayMarker, color: C.blastText}, labels.legendBlast],
  ];
  for (const [mark, text] of legend) {
    // O item "em branco" não tem marca: o texto começa na própria posição, sem recuo.
    if (mark) marker(P, ctx, lx, legendY, L.markSize, mark.fill, mark.mark, mark.color);
    const textX = mark ? lx + L.markSize + 6 : lx;
    P.text(text, textX, P.vcenter(legendY, L.markSize, S.legend), {size: S.legend, color: C.secondary});
    lx = textX + P.textWidth(text, S.legend) + 22;
  }
  if (!view.hasRecord) {
    P.text(labels.noRecordWarning, M, gridBottom + L.warningOffset, {size: S.warning, color: C.alert});
  }
  footer(P, ctx);
}

/** Página 3: um mês por linha (desmontes, monitoramentos e cada ponto), total e meses sem registro. */
function annualPage(ctx, P) {
  const {rs, monitoring, year, month, annual, W, M} = ctx;
  const {layout: L, sizes: S, colors: C, labels} = rs;
  const CW = W - 2 * M;
  header(P, ctx, `${labels.annualTitle} - ${year}`, labels.annualSubtitle);

  const fixed = [
    {w: L.summaryMonthWidth, label: labels.monthHeader, align: 'left'},
    {w: L.summaryBlastWidth, label: labels.blastsHeader, align: 'center'},
    {w: L.summaryMonitoringWidth, label: labels.monitoringsHeader, align: 'center'},
  ];
  const pointW = (CW - fixed.reduce((sum, c) => sum + c.w, 0)) / monitoring.points.length;
  const cols = [...fixed, ...monitoring.points.map(name => ({w: pointW, label: name.replace(/^Comunidade /, ''), align: 'center'}))];
  const top = L.summaryTop, headH = L.summaryHeaderHeight, rowH = L.summaryRowHeight;
  let x = M;
  for (const col of cols) {
    const lines = P.wrap(col.label, col.w - 6, S.tableHeader, true);
    P.boxText(lines, x, top, col.w, headH, {size: S.tableHeader, bold: true, color: C.muted, align: col.align});
    x += col.w;
  }
  P.hline(M, W - M, top + headH, C.rule, 0.71);

  const rows = annual.months.map(r => ({
    label: monthTitle(monitoring, r.month),
    values: [r.desmontes, r.monitoramentos, ...monitoring.points.map(name => r.perPoint[name])],
    selected: r.month === month,
    total: false,
  }));
  rows.push({
    label: labels.totalRow,
    values: [annual.totals.desmontes, annual.totals.monitoramentos, ...monitoring.points.map(name => annual.totals.perPoint[name])],
    selected: false,
    total: true,
  });
  rows.forEach((row, i) => {
    const y = top + headH + i * rowH;
    const bold = row.total || row.selected;
    const color = row.selected ? C.title : C.ink;
    let cx = M;
    cols.forEach((col, j) => {
      if (j === 0) P.text(row.label, cx + L.tableInset, P.vcenter(y, rowH, S.tableBody), {size: S.tableBody, bold, color});
      else P.boxText([String(row.values[j - 1])], cx, y, col.w, rowH, {size: S.tableBody, bold, color, align: 'center'});
      cx += col.w;
    });
    if (row.total) P.hline(M, W - M, y, C.ink, 0.99);
  });

  const missing = annual.months.filter(r => !ctx.recordedMonths[r.month - 1]).map(r => monitoring.monthNames[r.month - 1]);
  if (missing.length) {
    const noteY = top + headH + rows.length * rowH + L.summaryNoteOffset;
    P.text(fill(labels.noRecordFootnote, {months: missing.join(', ')}), M, noteY, {size: S.footnote, color: C.secondary});
  }
  footer(P, ctx);
}

/**
 * Operações de desenho das três páginas (lista de {t, ...} por página). Não cria o PDF; `measure` vem de measureWith().
 * `source` é 'api' (Google Drive) ou 'snapshot' (última cópia publicada). Sem dados, lança erro.
 */
export function layoutReport({data, monitoring, year, month, source, issued, assets, measure}) {
  const rs = reportSettings(monitoring);
  if (source !== 'api' && source !== 'snapshot') throw new Error('Sem dados de monitoramento para gerar o relatório.');
  if (!assets?.client || !assets?.enaex) throw new Error('Logotipos do relatório não carregados.');
  if (!(issued instanceof Date) || Number.isNaN(issued.getTime())) throw new Error('Data de emissão do relatório inválida.');
  const view = monthView(data, year, month, monitoring);
  const recordedMonths = Array.from({length: 12}, (_, i) => monthView(data, year, i + 1, monitoring).hasRecord);
  const ctx = {
    rs, monitoring, data, year, month, source, issued, assets, view, recordedMonths,
    summary: monthSummary(view, monitoring),
    annual: yearSummary(data, year, monitoring),
    W: measure.pageW, M: rs.margin,
  };
  return [coverPage, gridPage, annualPage].map(draw => {
    const P = painter(measure, {sizes: rs.sizes, layout: rs.layout, colors: rs.colors});
    draw(ctx, P);
    return P.ops;
  });
}

/**
 * Monta o PDF de apresentação. `JsPDF` é o construtor do jsPDF; `assets` = {client, enaex}, com {src, format, width, height}.
 * `source` é 'api' (Google Drive) ou 'snapshot' (última cópia publicada). Sem dados, lança erro e não gera o arquivo.
 */
export function buildMonitoringReport(JsPDF, {data, monitoring, year, month, source, issued, assets}) {
  const rs = reportSettings(monitoring);
  const doc = new JsPDF({orientation: 'landscape', unit: 'pt', format: [rs.page.width, rs.page.height], compress: true});
  const pages = layoutReport({data, monitoring, year, month, source, issued, assets, measure: measureWith(doc, rs.font)});
  pages.forEach((ops, i) => {
    if (i > 0) doc.addPage([rs.page.width, rs.page.height], 'landscape');
    drawOpsPdf(doc, ops, {font: rs.font, assets});
  });
  doc.setProperties({
    title: `${rs.labels.title} - ${monitoring.monthNames[month - 1]} ${year}`,
    author: 'Enaex Brasil',
    subject: monitoring.subtitle,
  });
  return doc;
}
