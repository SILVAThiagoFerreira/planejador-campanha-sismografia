import {delaunayTriangles} from './delaunay.js?v=1.0.0';
import {isSimplePolygon} from './geometry.js?v=1.3.6';
// Contorno de furos: arquivos DXF de plano de furos trazem um centro (POINT) por furo, e não polilinhas.
// O contorno passa pelo centro de todos os furos das extremidades, isto é, os furos da borda de cada padrão.
// Regras (todas em config.json, bloco "holes"):
// - Registros repetidos: dois centros com o mesmo número (texto acima do furo) a até duplicateToleranceMeters
//   são o mesmo furo; fica o primeiro registro e a contagem vai para o aviso.
// - Vizinhança: dois furos são vizinhos quando a distância é de até maxEdgeMeters. Triângulos de Delaunay só
//   com arestas até esse limite formam as regiões do padrão; a borda externa de cada região é um contorno.
//   Vazios fechados dentro de uma região não entram no contorno.
// - Furo sem triângulo (sem dois vizinhos próximos que o envolvam) e contorno que não fecha são recusados
//   com a causa. Nada é preenchido nem estimado em silêncio.
const REQUIRED_STRINGS=['collarLayer','labelLayer','contourName'];
const REQUIRED_NUMBERS=['labelMaxOffsetMeters','labelAlignToleranceMeters','duplicateToleranceMeters','minSpacingMeters','maxEdgeMeters'];
export function validateHoleSettings(settings){
  if(!settings||typeof settings!=='object')throw new Error('Bloco "holes" ausente em config.json.');
  for(const key of REQUIRED_STRINGS){
    if(typeof settings[key]!=='string')throw new Error(`holes.${key} ausente ou inválido em config.json.`);
  }
  if(!settings.collarLayer.trim())throw new Error('holes.collarLayer ausente ou inválido em config.json.');
  if(!settings.contourName.trim())throw new Error('holes.contourName ausente ou inválido em config.json.');
  for(const key of REQUIRED_NUMBERS){
    if(!Number.isFinite(settings[key])||settings[key]<0)throw new Error(`holes.${key} ausente ou inválido em config.json.`);
  }
  if(!(settings.maxEdgeMeters>0))throw new Error('holes.maxEdgeMeters deve ser maior que zero em config.json.');
  return settings;
}
const pointsDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Número do furo: texto da camada de rótulos alinhado ao centro e acima dele, dentro do alcance configurado.
// Sem texto único, o furo fica sem número e não é unido a outro registro.
export function holeLabel(collar,texts,settings){
  const values=new Set();
  for(const t of texts){
    const dx=Math.abs(t.x-collar.x),dy=t.y-collar.y;
    if(dx<=settings.labelAlignToleranceMeters&&dy>0&&dy<=settings.labelMaxOffsetMeters){const value=t.text.trim();if(value)values.add(value);}
  }
  return values.size===1?[...values][0]:null;
}
// Une registros repetidos do mesmo furo. Mantém a ordem do arquivo. Repetido é: mesmo número a até
// duplicateToleranceMeters, ou centros mais próximos que minSpacingMeters (nenhum furo fica tão perto de outro).
export function mergeRepeatedHoles(holes,settings){
  const kept=[];let merged=0;
  for(const h of holes){
    const twin=kept.find(k=>pointsDistance(k,h)<settings.minSpacingMeters||(h.label!==null&&k.label===h.label&&pointsDistance(k,h)<=settings.duplicateToleranceMeters));
    if(twin){merged++;continue;}
    kept.push(h);
  }
  return {holes:kept,merged};
}
// Área com sinal de um anel (fórmula de Gauss): positiva quando anti-horário.
const signedArea=ring=>{let s=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];s+=a.x*b.y-b.x*a.y;}return s/2;};
// Ponto dentro de anel por raios (ray casting).
function insideRing(point,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
// Aresta pq é "de Gabriel" quando nenhum outro furo está dentro ou sobre o círculo de diâmetro pq.
// Uma aresta de borda que não é de Gabriel corta uma reentrância (um furo de canto fica do lado de dentro
// da reta), então o triângulo que a contém sai da região e o furo de canto passa a integrar o contorno.
function isGabrielEdge(a,b,holes){
  const pa=holes[a],pb=holes[b];
  const cx=(pa.x+pb.x)/2,cy=(pa.y+pb.y)/2,r2=((pa.x-pb.x)**2+(pa.y-pb.y)**2)/4;
  for(let k=0;k<holes.length;k++){
    if(k===a||k===b)continue;
    const dx=holes[k].x-cx,dy=holes[k].y-cy;
    if(dx*dx+dy*dy<=r2+1e-9)return false;
  }
  return true;
}
// Remove, repetidamente, triângulos cuja aresta de borda não é de Gabriel. Triângulos com arestas internas
// (quadrado de grade com a diagonal) não são afetados. Um triângulo não sai se deixaria algum furo sem
// triângulo: esse furo continua no contorno e a região não é cortada por ele.
function peelNonGabrielBorders(triangles,holes){
  const alive=triangles.map(()=>true);
  const degree=new Array(holes.length).fill(0);
  for(const t of triangles)for(const v of t)degree[v]++;
  const gabriel=new Map();
  for(;;){
    const owners=new Map();
    triangles.forEach((t,ti)=>{if(!alive[ti])return;for(let k=0;k<3;k++){const key=edgeKey(t[k],t[(k+1)%3]);if(!owners.has(key))owners.set(key,[]);owners.get(key).push(ti);}});
    let removed=false;
    for(const [key,list] of owners){
      if(list.length!==1)continue;
      if(!gabriel.has(key)){const [a,b]=key.split(',').map(Number);gabriel.set(key,isGabrielEdge(a,b,holes));}
      if(gabriel.get(key))continue;
      const ti=list[0],t=triangles[ti];
      if(!alive[ti]||t.some(v=>degree[v]<=1))continue;
      alive[ti]=false;removed=true;
      for(const v of t)degree[v]--;
    }
    if(!removed)break;
  }
  return triangles.filter((_,ti)=>alive[ti]);
}
// Anéis de borda de uma região. Arestas dirigidas com a região à esquerda. Em um vértice de encontro
// (dois vazios ou dois lóbulos tocando o mesmo furo), a passagem segue a aresta mais próxima no sentido
// horário a partir da chegada, então cada anel fica simples e o vértice aparece em anéis distintos.
function boundaryRings(directed,points,label){
  const out=new Map(),inCount=new Map();
  for(const [a,b] of directed){
    if(!out.has(a))out.set(a,[]);
    out.get(a).push(b);
    inCount.set(b,(inCount.get(b)||0)+1);
  }
  for(const [v,ws] of out){
    if(ws.length!==(inCount.get(v)||0))throw new Error(`${label}: borda aberta no furo ${v+1}; revise os furos desse trecho.`);
  }
  const used=new Set(),rings=[];
  for(const [a,b] of directed){
    if(used.has(`${a}>${b}`))continue;
    const ring=[a];let u=a,v=b;used.add(`${a}>${b}`);
    while(v!==a){
      ring.push(v);
      const cands=out.get(v).filter(w=>!used.has(`${v}>${w}`));
      if(!cands.length)throw new Error(`${label}: borda aberta no furo ${v+1}; revise os furos desse trecho.`);
      let w=cands[0];
      if(cands.length>1){
        const back=Math.atan2(points[u].y-points[v].y,points[u].x-points[v].x);
        const turn=c=>{let d=Math.atan2(points[c].y-points[v].y,points[c].x-points[v].x)-back;while(d<=0)d+=2*Math.PI;return d;};
        w=cands.reduce((best,c)=>turn(c)<turn(best)?c:best);
      }
      used.add(`${v}>${w}`);u=v;v=w;
    }
    rings.push(ring);
  }
  return rings;
}
// Contornos externos a partir dos centros de furos (objetos {x,y,label}). Retorna os contornos (do maior para o
// menor) e quantos furos ficam fora deles (vazios e interiores). Lança erro com a causa quando não há contorno.
export function contoursFromHoles(holes,settings,label='Furos'){
  const maxEdge=settings.maxEdgeMeters;
  for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)if(pointsDistance(holes[i],holes[j])<1e-6)throw new Error(`${label}: furos sobrepostos (${holes[i].label??`registro ${i+1}`} e ${holes[j].label??`registro ${j+1}`}).`);
  const short=delaunayTriangles(holes).filter(([a,b,c])=>Math.max(pointsDistance(holes[a],holes[b]),pointsDistance(holes[b],holes[c]),pointsDistance(holes[c],holes[a]))<=maxEdge);
  const triangles=peelNonGabrielBorders(short,holes);
  const limit=String(maxEdge).replace('.',',');
  if(!triangles.length)throw new Error(`${label}: nenhum trio de furos vizinhos a até ${limit} m; os furos não formam contorno fechado.`);
  const used=new Set(triangles.flat());
  const without=holes.map((h,i)=>i).filter(i=>!used.has(i));
  if(without.length){
    const names=without.slice(0,10).map(i=>holes[i].label??`registro ${i+1}`).join(', ');
    throw new Error(`${label}: ${without.length} furo(s) fora de contorno fechado (${names}${without.length>10?' …':''}). Não há trio de furos vizinhos a até ${limit} m que os envolva; trechos de furos em linha aberta não formam contorno.`);
  }
  // Regiões: triângulos que compartilham aresta. Cada aresta de borda guarda o vértice oposto do seu triângulo.
  const parent=triangles.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const edgeTriangles=new Map();
  triangles.forEach((t,ti)=>{for(let k=0;k<3;k++){const key=edgeKey(t[k],t[(k+1)%3]);if(!edgeTriangles.has(key))edgeTriangles.set(key,[]);edgeTriangles.get(key).push(ti);}});
  for(const list of edgeTriangles.values())if(list.length===2)parent[find(list[0])]=find(list[1]);
  const regions=new Map();
  for(const [key,list] of edgeTriangles){
    if(list.length!==1)continue;
    const [a,b]=key.split(',').map(Number);
    const t=triangles[list[0]];
    const c=t.find(v=>v!==a&&v!==b);
    // Região à esquerda da aresta dirigida: o vértice oposto precisa ficar à esquerda de a→b.
    const cross=(holes[b].x-holes[a].x)*(holes[c].y-holes[a].y)-(holes[b].y-holes[a].y)*(holes[c].x-holes[a].x);
    const root=find(list[0]);
    if(!regions.has(root))regions.set(root,[]);
    regions.get(root).push(cross>0?[a,b]:[b,a]);
  }
  const contours=[];const onContour=new Set();
  let index=0;
  for(const directed of regions.values()){
    index++;
    const rings=boundaryRings(directed,holes,`${label}, região ${index}`);
    const sized=rings.map(ring=>({ring,area:Math.abs(signedArea(ring.map(i=>holes[i])))})).sort((x,y)=>y.area-x.area);
    const outer=sized[0].ring.map(i=>holes[i]);
    for(const other of sized.slice(1)){
      const centre={x:other.ring.reduce((s,i)=>s+holes[i].x,0)/other.ring.length,y:other.ring.reduce((s,i)=>s+holes[i].y,0)/other.ring.length};
      if(!insideRing(centre,outer))throw new Error(`${label}, região ${index}: vazio fora do contorno externo; revise os furos desse trecho.`);
    }
    if(!isSimplePolygon(outer))throw new Error(`${label}, região ${index}: contorno com auto-interseção; revise os furos desse trecho.`);
    for(const i of sized[0].ring)onContour.add(i);
    contours.push({vertices:outer.map(h=>({x:h.x,y:h.y})),area:sized[0].area});
  }
  contours.sort((a,b)=>b.vertices.length-a.vertices.length);
  return {contours,excluded:holes.length-onContour.size};
}
// Converte os registros lidos do DXF em contornos. collars: POINT da camada de furos {x,y};
// texts: TEXT da camada de rótulos {x,y,text}.
export function holesFromRecords(collars,texts,settings,label='Furos'){
  const centres=collars.map(c=>({x:c.x,y:c.y,label:holeLabel(c,texts,settings)}));
  const {holes,merged}=mergeRepeatedHoles(centres,settings);
  const {contours,excluded}=contoursFromHoles(holes,settings,label);
  return {contours,centres:centres.length,holes:holes.length,merged,excluded};
}
