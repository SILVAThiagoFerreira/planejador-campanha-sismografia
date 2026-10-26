/** Formatação e validação compartilhadas pelo relatório (tela, PDF, PNG, DOCX e mensagem). */
/** Quantidades que não são coordenadas (distâncias, azimutes, raio) usam separador de milhar. */
export const number = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Coordenadas UTM (Norte/Leste) sem separador de milhar: 8930441,2703 */
export const coordinateNumber = (value, digits = 4) => Number(value).toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits });
export function coordinateDMM(value, axis) {
  if (!Number.isFinite(Number(value))) throw new Error('Coordenada inválida no relatório.');
  const absolute = Math.abs(Number(value));
  let degrees = Math.floor(absolute), minutes = Math.round((absolute - degrees) * 60000) / 1000;
  if (minutes >= 60) { degrees++; minutes = 0; }
  const hemisphere = axis === 'lat' ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  return `${String(degrees).padStart(3, '0')} ${minutes.toFixed(3).padStart(6, '0')} ${hemisphere}`;
}
export function reportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Informe a data da campanha.');
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
export function reportNotes(value, fallback = '') {
  const notes = String(value ?? '').trim();
  const demonstrationNotice = 'DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha.';
  if (notes === demonstrationNotice) return fallback;
  return notes || fallback;
}
export function validateReportData(data) {
  if (!data?.config?.report) throw new Error('Configuração visual do relatório indisponível.');
  if (!data.plan?.origin || !data.scenario?.points?.length) throw new Error('Calcule e selecione um cenário antes de exportar.');
  if (data.scenario.points.length > data.config.communities.length) throw new Error('O relatório suporta os sete pontos do catálogo.');
  reportDate(data.meta.date);
  if (!Number.isFinite(data.plan.origin.radius) || data.scenario.points.some(p => !Number.isFinite(p.distance))) throw new Error('Distâncias não calculadas no cenário.');
  for (const p of [data.plan.origin, ...data.scenario.points]) {
    if (![p.lat, p.lon, p.x, p.y].every(Number.isFinite)) throw new Error('Coordenadas incompletas no cenário.');
  }
}
