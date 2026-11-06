// Configuração do relatório de apresentação do monitoramento (monitoring.report em config.json).
// Valida o bloco inteiro e devolve medidas e cores prontas para o desenho. Módulo puro (sem DOM):
// usado pela exportação, pelos testes e pelo build. Chave ausente, cor inválida ou número inválido
// interrompem com o caminho da chave; não há valor padrão silencioso.

const COLOR_KEYS = ['paper', 'title', 'ink', 'secondary', 'muted', 'rule', 'footerRule', 'grid', 'alert', 'blast', 'blastText',
  'monitored', 'monitoredText', 'notInMonth', 'notInMonthText'];
const SIZE_KEYS = ['title', 'subtitle', 'filterLabel', 'filterValue', 'sectionTitle', 'kpiLabel', 'kpiValue', 'kpiNote',
  'tableHeader', 'tableBody', 'gridLabel', 'gridDay', 'mark', 'legend', 'legendTitle', 'footer', 'warning', 'footnote'];
const LAYOUT_KEYS = ['titleY', 'subtitleY', 'filterLabelY', 'filterValueY', 'filterGap', 'kpiInset', 'kpiRow1LabelY', 'kpiRow1ValueY',
  'kpiRow2LabelY', 'kpiRow2ValueY', 'kpiNoteOffset', 'tableTitleY', 'tableRuleY', 'tableHeaderY', 'tableTop', 'tableRowHeight',
  'tableInset', 'monthColumnRatio', 'yearColumnRatio', 'gridTop', 'blastRowHeight', 'dayRowHeight', 'pointRowHeight', 'labelWidth', 'markSize',
  'legendOffset', 'warningOffset', 'summaryTop', 'summaryHeaderHeight', 'summaryRowHeight', 'summaryMonthWidth', 'summaryBlastWidth',
  'summaryMonitoringWidth', 'summaryNoteOffset', 'footerRuleY', 'footerY'];
const LABEL_KEYS = ['title', 'gridTitle', 'annualTitle', 'gridSubtitle', 'annualSubtitle', 'periodLabel', 'pointsLabel', 'sourceLabel',
  'issuedLabel', 'pointsAll', 'sourceLive', 'sourceSnapshot', 'blastsMonth', 'monitoringsMonth', 'pointsWithoutMonth', 'pointsNote',
  'blastsYear', 'monitoringsYear', 'monthsWithMonitoring', 'monthsNote', 'communityTitle', 'communityColumn', 'yearHeader', 'blastRowLabel',
  'legendBlank', 'legendMonitored', 'legendNotInMonth', 'legendBlast', 'monthHeader', 'blastsHeader', 'monitoringsHeader', 'totalRow',
  'noRecordWarning', 'noRecordFootnote', 'footer'];

/** Cor #RGB ou #RRGGBB para [r, g, b]; cor inválida lança erro com o caminho. */
export function hexRgb(hex, path = 'monitoring.report.colors') {
  if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) throw new Error(`Cor inválida em config.json (${path}): ${hex}.`);
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
}

/** Valor obrigatório; ausência ou vazio lança erro com o caminho completo da chave. */
function need(source, key, path) {
  const value = source?.[key];
  if (value === undefined || value === null || value === '') throw new Error(`Configuração ausente em config.json: ${path}.${key}.`);
  return value;
}

/** Número finito obrigatório (medidas em pontos, tamanhos e proporções). */
function number(source, key, path) {
  const value = need(source, key, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Valor inválido em config.json: ${path}.${key} deve ser número (recebido ${value}).`);
  return value;
}

/** Texto obrigatório e não vazio. */
function text(source, key, path) {
  const value = need(source, key, path);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Texto inválido em config.json: ${path}.${key}.`);
  return value;
}

/**
 * Lê e valida monitoring.report. `fileExists(path)` (opcional) confere os logotipos no disco ou no site.
 * Retorna: {font, fileName, page:{width,height}, margin, logos:{client,enaex,height,top,gap}, colors (RGB), sizes, layout, labels}.
 */
export function reportSettings(monitoring, {fileExists} = {}) {
  const base = 'monitoring.report';
  const report = need(monitoring, 'report', 'monitoring');
  const page = need(report, 'page', base);
  const logos = need(report, 'logos', base);
  for (const key of ['client', 'enaex']) {
    const path = text(logos, key, `${base}.logos`);
    if (fileExists && !fileExists(path)) throw new Error(`Logotipo ausente: ${base}.logos.${key} (${path}).`);
  }
  const colorsSource = need(report, 'colors', base);
  const colors = Object.fromEntries(COLOR_KEYS.map(key => [key, hexRgb(need(colorsSource, key, `${base}.colors`), `${base}.colors.${key}`)]));
  const sizesSource = need(report, 'sizes', base);
  const layoutSource = need(report, 'layout', base);
  const labelsSource = need(report, 'labels', base);
  const ratios = ['monthColumnRatio', 'yearColumnRatio'];
  for (const key of ratios) {
    const value = number(layoutSource, key, `${base}.layout`);
    if (value <= 0 || value >= 1) throw new Error(`Valor inválido em config.json: ${base}.layout.${key} deve estar entre 0 e 1.`);
  }
  return {
    font: text(report, 'fontFamily', base),
    fileName: text(report, 'fileName', base),
    page: {width: number(page, 'width', `${base}.page`), height: number(page, 'height', `${base}.page`)},
    margin: number(report, 'margin', base),
    logos: {
      client: text(logos, 'client', `${base}.logos`),
      enaex: text(logos, 'enaex', `${base}.logos`),
      height: number(logos, 'height', `${base}.logos`),
      top: number(logos, 'top', `${base}.logos`),
      gap: number(logos, 'gap', `${base}.logos`),
    },
    colors,
    sizes: Object.fromEntries(SIZE_KEYS.map(key => [key, number(sizesSource, key, `${base}.sizes`)])),
    layout: Object.fromEntries(LAYOUT_KEYS.map(key => [key, number(layoutSource, key, `${base}.layout`)])),
    labels: Object.fromEntries(LABEL_KEYS.map(key => [key, text(labelsSource, key, `${base}.labels`)])),
  };
}
