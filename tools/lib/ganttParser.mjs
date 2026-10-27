// Interpreta uma aba do Gantt de monitoramento (uma aba por ano) e devolve,
// para cada mês, os dias com desmonte e os dias monitorados por ponto.
//
// Layout de cada bloco mensal (ver DATA_SCHEMA.md):
//   linha r0      : "MM. NOME" na coluna B  + título da tabela
//   linha r0+1    : "Ponto de Monitoramento" + "D" sobre os dias com desmonte
//   linha r0+2    : números 1..31 nas colunas C..AG (linha dos dias)
//   linhas r0+3.. : uma linha por ponto (ordem de config.monitoring.points), "M" monitorado, "N" fora do calendário
//
// Divergências conhecidas da planilha (março e agosto de 2025) são lidas pela posição
// da linha, que é a ordem fixa do layout, e cada uma vira um item em `anomalies`.
// Nada é corrigido em silêncio: o importador exibe e grava todas as anomalias.
import {columnNumber} from './xlsxReader.mjs';
import {daysInMonth, normalizeText} from '../../src/monitoringData.js';

/**
 * @param {Array<Array<string|number>>} rows matriz da aba (rows[linha-1][coluna-1])
 * @param {object} monitoring bloco `monitoring` de config.json
 * @param {number} year ano da aba
 * @returns {{months: Object<string, {desmontes:number[], points:Object<string,number[]>, anomalies:string[]}>, anomalies: string[]}}
 */
export function parseGanttSheet(rows, monitoring, year) {
  const layout = monitoring.layout;
  const labels = monitoring.labels;
  const points = monitoring.points;
  const labelCol = columnNumber(layout.labelColumn);
  const firstDayCol = columnNumber(layout.firstDayColumn);
  const dayCount = layout.dayCount;
  const lastDayCol = firstDayCol + dayCount - 1;
  const rowCount = rows.length;
  const cell = (r, c) => {
    const v = rows[r - 1]?.[c - 1];
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const headerRe = new RegExp(layout.monthHeaderPattern);
  const headers = [];
  for (let r = 1; r <= rowCount; r++) {
    const m = cell(r, labelCol).match(headerRe);
    if (m) headers.push({row: r, month: Number(m[1]), name: m[2].trim()});
  }
  const sheetAnomalies = [];
  if (!headers.length) throw new Error(`Ano ${year}: nenhum bloco de mês encontrado (coluna ${layout.labelColumn}).`);
  const seen = new Set();
  for (const h of headers) {
    if (!Number.isInteger(h.month) || h.month < 1 || h.month > 12) throw new Error(`Ano ${year}: número de mês inválido na linha ${h.row}.`);
    if (seen.has(h.month)) throw new Error(`Ano ${year}: mês ${h.month} aparece em mais de um bloco.`);
    seen.add(h.month);
  }

  const months = {};
  headers.forEach((header, index) => {
    const anomalies = [];
    const start = header.row;
    const end = index + 1 < headers.length ? headers[index + 1].row - 1 : rowCount;
    const monthNumber = header.month;
    const expectedName = monitoring.monthNames[monthNumber - 1];
    if (normalizeText(header.name) !== normalizeText(expectedName)) {
      anomalies.push(`Cabeçalho "${header.name}" difere do nome esperado "${expectedName}".`);
    }
    const dim = daysInMonth(year, monthNumber);
    let dayRow = 0;
    for (let r = start + 1; r <= Math.min(start + 3, end); r++) {
      if (cell(r, firstDayCol) === '1' && cell(r, firstDayCol + 1) === '2') { dayRow = r; break; }
    }
    if (!dayRow) throw new Error(`Ano ${year}, ${expectedName}: linha de dias (1 a ${dayCount}) não encontrada a partir da linha ${start}.`);
    if (dayRow !== start + 2) anomalies.push(`Linha dos dias na linha ${dayRow}; o layout esperado é a linha ${start + 2}.`);
    for (let d = 1; d <= dayCount; d++) {
      if (cell(dayRow, firstDayCol + d - 1) !== String(d)) {
        anomalies.push(`Número do dia ${d} ausente ou incorreto na linha ${dayRow}.`);
      }
    }
    const dayRowLabel = cell(dayRow, labelCol);
    if (dayRowLabel) {
      anomalies.push(`A linha dos dias (${dayRow}) traz o rótulo "${dayRowLabel}" na coluna ${layout.labelColumn}; as linhas de pontos foram lidas pela posição.`);
    }

    // Linha de desmontes (acima dos números dos dias).
    const markRow = dayRow - 1;
    if (normalizeText(cell(markRow, labelCol)) !== normalizeText(labels.pointHeader)) {
      anomalies.push(`Cabeçalho "${cell(markRow, labelCol)}" na linha ${markRow} difere de "${labels.pointHeader}".`);
    }
    const desmontes = [];
    for (let d = 1; d <= dayCount; d++) {
      const v = cell(markRow, firstDayCol + d - 1);
      if (v === layout.dayMarker) {
        if (d > dim) anomalies.push(`Desmonte marcado no dia ${d}, que não existe no mês.`);
        else desmontes.push(d);
      } else if (v !== '') {
        anomalies.push(`Marcação "${v}" inesperada no dia ${d} da linha ${markRow}.`);
      }
    }

    // Linhas dos pontos: posição fixa logo abaixo da linha dos dias.
    const monthPoints = {};
    points.forEach((name, k) => {
      const r = dayRow + 1 + k;
      const label = cell(r, labelCol);
      if (!label) anomalies.push(`Linha ${r} sem rótulo; dados lidos pela posição (${name}).`);
      else if (normalizeText(label) !== normalizeText(name)) anomalies.push(`Linha ${r}: rótulo "${label}" difere de "${name}"; dados lidos pela posição (${name}).`);
      const days = [];
      for (let d = 1; d <= dayCount; d++) {
        const v = cell(r, firstDayCol + d - 1);
        const inMonth = d <= dim;
        if (v === layout.monitoredMarker) {
          if (inMonth) days.push(d);
          else anomalies.push(`Monitoramento "M" no dia ${d} de ${name}, que não existe no mês.`);
        } else if (v === layout.notInMonthMarker) {
          if (inMonth) anomalies.push(`Marcação "N" no dia ${d} de ${name}, que pertence ao mês.`);
        } else if (v === '') {
          if (!inMonth) anomalies.push(`Dia ${d} de ${name} fora do calendário sem marcação "${layout.notInMonthMarker}".`);
        } else {
          anomalies.push(`Marcação "${v}" inesperada no dia ${d} de ${name} (linha ${r}).`);
        }
      }
      monthPoints[name] = days;
    });
    // Linhas após os pontos não devem conter marcações nos dias.
    for (let r = dayRow + 1 + points.length; r <= end; r++) {
      for (let d = 1; d <= dayCount; d++) {
        const v = cell(r, firstDayCol + d - 1);
        if (v !== '') { anomalies.push(`Marcação "${v}" na linha ${r}, fora das linhas de pontos.`); break; }
      }
    }

    // Contagens calculadas pela planilha (valores em cache das fórmulas) devem bater com o parse.
    const totalMonitored = Object.values(monthPoints).reduce((sum, days) => sum + days.length, 0);
    const cachedValue = (r, c) => {
      for (let k = c + 1; k <= c + 3; k++) if (cell(r, k) !== '') return cell(r, k);
      return '';
    };
    for (let r = start; r <= end; r++) {
      for (let c = lastDayCol + 1; c <= lastDayCol + 40; c++) {
        const text = normalizeText(cell(r, c));
        if (!text) continue;
        let expected = null, name = '';
        if (text === normalizeText(labels.desmontesCount)) { expected = desmontes.length; name = labels.desmontesCount; }
        else if (text === normalizeText(labels.monitoringCount)) { expected = totalMonitored; name = labels.monitoringCount; }
        else {
          const point = points.find(p => normalizeText(p) === text);
          if (point) { expected = monthPoints[point].length; name = point; }
        }
        if (expected === null) continue;
        const value = cachedValue(r, c);
        if (value === '') continue;
        if (Number(value) !== expected) anomalies.push(`Contagem informada (${value}) difere da calculada (${expected}) para "${name}".`);
      }
    }

    months[String(monthNumber)] = {desmontes, points: monthPoints, anomalies};
  });

  return {months, anomalies: sheetAnomalies};
}
