import { polygonCentroid,isSimplePolygon } from './geometry.js';
export function validatePolygons(polygons,limits={}){
  if(!Array.isArray(polygons)||!polygons.length)throw new Error('Importe ao menos uma poligonal fechada de desmonte.');
  if(limits.maxPolygons&&polygons.length>limits.maxPolygons)throw new Error(`Limite de ${limits.maxPolygons} poligonais excedido.`);
  let total=0;const ids=new Set();
  for(const p of polygons){
    if(!p.id||ids.has(p.id))throw new Error('Identificador de poligonal ausente ou duplicado.');ids.add(p.id);
    if(!Array.isArray(p.vertices)||p.vertices.length<3)throw new Error(`${p.name||p.id}: mínimo de três vértices.`);
    total+=p.vertices.length;
    if(limits.maxVertices&&total>limits.maxVertices)throw new Error(`Limite de ${limits.maxVertices} vértices excedido.`);
    if(p.vertices.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))throw new Error(`${p.name||p.id}: coordenadas inválidas.`);
    if(new Set(p.vertices.map(v=>`${v.x},${v.y}`)).size!==p.vertices.length)throw new Error(`${p.name||p.id}: vértices repetidos.`);
    polygonCentroid(p.vertices);
    if(!isSimplePolygon(p.vertices))throw new Error(`${p.name||p.id}: poligonal com auto-interseção.`);
    if(p.direction!==null&&p.direction!==undefined&&(!Number.isFinite(p.direction)||p.direction<0||p.direction>=360))throw new Error(`${p.name||p.id}: direção deve estar entre 0° e menos de 360°.`);
  }
  return polygons;
}
export function validateCommunities(communities,instrumentCount){
  if(!Array.isArray(communities)||!communities.length)throw new Error('Nenhum ponto de monitoramento configurado.');
  if(!Number.isInteger(instrumentCount)||instrumentCount<1||instrumentCount>communities.length)throw new Error(`Informe de 1 a ${communities.length} sismógrafos.`);
  const ids=new Set();
  for(const p of communities){if(!p.id||ids.has(p.id))throw new Error('Identificadores de comunidades ausentes ou duplicados.');ids.add(p.id);if(!p.name||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180)throw new Error('Coordenadas geográficas ou nome da comunidade inválidos.');if(p.fixed!==undefined&&typeof p.fixed!=='boolean')throw new Error('Configuração de ponto fixo inválida.');}
  const fixedCount=communities.filter(p=>p.fixed===true).length;
  if(fixedCount>instrumentCount)throw new Error(`Existem ${fixedCount} pontos fixos para apenas ${instrumentCount} sismógrafo(s).`);
}
