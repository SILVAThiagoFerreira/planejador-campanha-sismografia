import { smallestEnclosingCircle,polygonCentroid,distance,distanceToPolygon,bearing,angularDifference } from './geometry.js';
import { validatePolygons,validateCommunities } from './validation.js';
function combinations(items,n){const out=[];function walk(start,chosen){if(chosen.length===n){out.push(chosen);return;}for(let i=start;i<=items.length-(n-chosen.length);i++)walk(i+1,[...chosen,items[i]]);}walk(0,[]);return out;}
export function buildPlan({polygons,communities,instrumentCount,project,unproject,config={}}){
  validatePolygons(polygons,config.validation);validateCommunities(communities,instrumentCount);
  if(typeof project!=='function'||typeof unproject!=='function')throw new Error('Conversor de coordenadas não disponível.');
  const origin=smallestEnclosingCircle(polygons.flatMap(p=>p.vertices));Object.assign(origin,unproject(origin.x,origin.y));
  if(!Number.isFinite(origin.lon)||!Number.isFinite(origin.lat)||Math.abs(origin.lon)>180||Math.abs(origin.lat)>90)throw new Error('Origem não corresponde ao sistema de coordenadas selecionado.');
  const bounds=config.validation?.regionBounds;
  if(bounds){
    if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(n=>!Number.isFinite(n))||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw new Error('Limites geográficos da configuração inválidos.');
    const within=p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&p.lon>=bounds[0]&&p.lon<=bounds[2]&&p.lat>=bounds[1]&&p.lat<=bounds[3];
    if(!within(origin)||polygons.some(p=>p.vertices.some(v=>!within(unproject(v.x,v.y)))))throw new Error('Áreas fora da região configurada. Confira o SRC, X=Este, Y=Norte e unidades em metros.');
    if(communities.some(p=>!within(p)))throw new Error('Comunidade fora da região configurada; confira as coordenadas.');
  }
  if(config.validation?.maxRadiusMeters&&origin.radius>config.validation.maxRadiusMeters)throw new Error('Extensão das poligonais excede o limite configurado; confira as unidades e o CRS.');
  const areas=polygons.map(p=>({...p,centroid:polygonCentroid(p.vertices)}));
  const directed=areas.filter(p=>p.direction!==null&&p.direction!==undefined);
  const points=communities.map(p=>{const xy=project(p.lon,p.lat);if(!Number.isFinite(xy.x)||!Number.isFinite(xy.y))throw new Error('Projeção da comunidade inválida.');const perPolygon=areas.map(a=>({polygonId:a.id,distance:distance(a.centroid,xy),edgeDistance:distanceToPolygon(xy,a.vertices),bearing:bearing(a.centroid,xy),alignment:a.direction===null||a.direction===undefined?null:(1+Math.cos(angularDifference(a.direction,bearing(a.centroid,xy))*Math.PI/180))/2}));return {...p,...xy,distance:distance(origin,xy),edgeDistance:Math.min(...perPolygon.map(m=>m.edgeDistance)),bearing:bearing(origin,xy),alignment:directed.length?Math.max(...perPolygon.filter(m=>m.alignment!==null).map(m=>m.alignment)):null,perPolygon};});
  const maxDistance=Math.max(...points.map(p=>p.edgeDistance),1);
  for(const p of points)p.proximity=1-p.edgeDistance/maxDistance;
  const weights={distanceWeight:config.planner?.distanceWeight??0.35,directionWeight:config.planner?.directionWeight??0.65,coverageWeight:config.planner?.coverageWeight??0.65};
  if(Object.values(weights).some(w=>!Number.isFinite(w)||w<0||w>1))throw new Error('Pesos de cenário devem estar entre 0 e 1.');
  const options=combinations(points,instrumentCount);
  function coverage(set){if(set.length===1)return set[0].proximity;const angles=set.map(p=>p.bearing).sort((a,b)=>a-b),gaps=angles.map((a,i)=>i===angles.length-1?angles[0]+360-a:angles[i+1]-a);return (360-Math.max(...gaps))/360;}
  const definitions=[{id:1,title:'Proximidade',description:'Menor soma das distâncias até a borda das áreas.',evaluate:s=>s.reduce((v,p)=>v-p.edgeDistance,0)},{id:2,title:'Direcionamento',description:'Prioriza alinhamento com a saída informada e proximidade; critério geométrico, sem previsão física.',evaluate:s=>s.reduce((v,p)=>v+(directed.length?weights.directionWeight*p.alignment+weights.distanceWeight*p.proximity:p.proximity),0)/s.length},{id:3,title:'Cobertura espacial',description:'Combina distribuição angular em torno da origem com proximidade.',evaluate:s=>weights.coverageWeight*coverage(s)+(1-weights.coverageWeight)*s.reduce((v,p)=>v+p.proximity,0)/s.length}];
  const scenarios=definitions.map(d=>{const ranked=options.map(set=>({set,score:d.evaluate(set)})).sort((a,b)=>b.score-a.score||a.set.map(p=>p.id).join(',').localeCompare(b.set.map(p=>p.id).join(',')));return {id:d.id,title:d.title,description:d.description,points:ranked[0].set,score:ranked[0].score,coincidentWith:[]};});
  for(const s of scenarios)s.coincidentWith=scenarios.filter(o=>o.id!==s.id&&o.points.map(p=>p.id).sort().join('|')===s.points.map(p=>p.id).sort().join('|')).map(o=>o.id);
  return {origin,polygons:areas,communities:points,scenarios,instrumentCount,warnings:[...(directed.length<areas.length?[`${areas.length-directed.length} área(s) sem direção informada; o direcionamento não é avaliado nessas áreas.`]:[]),...(!directed.length?['Cenário 2 usa proximidade porque nenhuma direção foi informada.']:[]),...(scenarios.some(s=>s.coincidentWith.length)?['Os critérios podem selecionar os mesmos pontos. Cenários coincidentes são identificados.']:[])]};
}
