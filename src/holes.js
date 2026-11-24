import {delaunayTriangles} from './delaunay.js?v=1.0.0';
import {isSimplePolygon} from './geometry.js?v=1.3.6';
// Contorno de furos: arquivos DXF de plano de furos trazem um centro (POINT) por furo, e não polilinhas.
// O método é o de REPORTS\Delimitação - LIB (gerar_contorno_furos.py), aplicado aos centros:
// - Registros repetidos: dois centros a menos de minSpacingMeters, ou com o mesmo número a até
//   duplicateToleranceMeters, são o mesmo furo; fica o primeiro registro e a contagem vai para o aviso.
// - Alpha shape: triângulos de Delaunay cujo raio circunscrito é menor que alphaMeters formam a malha do padrão.
//   Lacunas maiores que isso ficam fora, e a borda passa por fora dos furos.
// - Região: triângulos que compartilham aresta. Em cada região, o anel externo é o maior anel de borda;
//   vazios dentro dele são ignorados e os furos em volta deles são internos.
// - Curva suave: Catmull-Rom centrípeta fechada passando exatamente por cada furo de borda, com
//   samplesPerSegment pontos por trecho. Cada furo de borda é um vértice da curva.
// - Recusas com a causa, sem preenchimento silencioso: furo de encontro (dois anéis tocam no mesmo furo),
//   anel externo que não é simples, curvas que se cruzam, e furo interno que não está dentro de nenhuma curva.
// - Aviso: furo interno a menos de interiorWarnMeters da curva (possível furo na divisa; não é corrigido).
const REQUIRED_STRINGS=['collarLayer','labelLayer','contourName'];
const REQUIRED_NUMBERS=['labelMaxOffsetMeters','labelAlignToleranceMeters','duplicateToleranceMeters','minSpacingMeters','interiorWarnMeters'];
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
  if(!Number.isFinite(settings.alphaMeters))throw new Error('holes.alphaMeters ausente ou inválido em config.json.');
  if(!(settings.alphaMeters>0))throw new Error('holes.alphaMeters deve ser maior que zero em config.json.');
  if(!Number.isInteger(settings.samplesPerSegment)||settings.samplesPerSegment<2)throw new Error('holes.samplesPerSegment deve ser inteiro de 2 ou mais em config.json.');
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
// Une registros repetidos do mesmo furo. Mantém a ordem do arquivo.
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
// Ponto dentro de polígono por raios (ray casting).
function insidePolygon(point,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
const orientation=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
// Raio do círculo que passa pelos três vértices; triângulo degenerado (colinear) tem raio infinito.
function circumradius(a,b,c){
  const area=Math.abs(orientation(a,b,c))/2;
  if(area<=1e-9)return Infinity;
  return pointsDistance(a,b)*pointsDistance(b,c)*pointsDistance(a,c)/(4*area);
}
const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
// Distância de um ponto a um segmento.
function distanceToSegment(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy;
  const t=len2?Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/len2)):0;
  return Math.hypot(a.x+t*vx-p.x,a.y+t*vy-p.y);
}
// Dois segmentos se cruzam em um ponto interior a ambos.
function segmentsCross(a,b,c,d){
  const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
  return ((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0));
}
// Anéis de borda de uma região. Arestas dirigidas com a região à esquerda. Em um vértice de encontro
// (dois vazios ou dois lóbulos tocando o mesmo furo), a passagem segue a aresta mais próxima no sentido
// horário a partir da chegada. O caso de encontro é recusado depois, por vértice repetido entre anéis.
function boundaryRings(directed,points,label){
  const out=new Map(),inCount=new Map();
  for(const [a,b] of directed){
    if(!out.has(a))out.set(a,[]);
    out.get(a).push(b);
    inCount.set(b,(inCount.get(b)||0)+1);
  }
  for(const [v,ws] of out){
    if(ws.length!==(inCount.get(v)||0))throw new Error(`${label}: borda aberta no furo ${points[v].label??v+1}; revise os furos desse trecho.`);
  }
  const used=new Set(),rings=[];
  for(const [a,b] of directed){
    if(used.has(`${a}>${b}`))continue;
    const ring=[a];let u=a,v=b;used.add(`${a}>${b}`);
    while(v!==a){
      ring.push(v);
      const cands=out.get(v).filter(w=>!used.has(`${v}>${w}`));
      if(!cands.length)throw new Error(`${label}: borda aberta no furo ${points[v].label??v+1}; revise os furos desse trecho.`);
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
// Catmull-Rom centrípeta fechada (mesma fórmula de catmull_rom_closed em gerar_contorno_furos.py).
// Retorna samplesPerSegment pontos por trecho; o primeiro de cada trecho é exatamente o furo de borda.
function smoothClosedCurve(points,samples){
  const N=points.length;
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)**0.5;
  const lerp=(a,b,wa,wb)=>({x:wa*a.x+wb*b.x,y:wa*a.y+wb*b.y});
  const out=[];
  for(let i=0;i<N;i++){
    const p0=points[(i-1+N)%N],p1=points[i],p2=points[(i+1)%N],p3=points[(i+2)%N];
    const t0=0,t1=t0+d(p0,p1),t2=t1+d(p1,p2),t3=t2+d(p2,p3);
    out.push({x:p1.x,y:p1.y});
    for(let k=1;k<samples;k++){
      const t=t1+(t2-t1)*k/samples;
      const A1=lerp(p0,p1,(t1-t)/(t1-t0),(t-t0)/(t1-t0));
      const A2=lerp(p1,p2,(t2-t)/(t2-t1),(t-t1)/(t2-t1));
      const A3=lerp(p2,p3,(t3-t)/(t3-t2),(t-t2)/(t3-t2));
      const B1=lerp(A1,A2,(t2-t)/(t2-t0),(t-t0)/(t2-t0));
      const B2=lerp(A2,A3,(t3-t)/(t3-t1),(t-t1)/(t3-t1));
      out.push(lerp(B1,B2,(t2-t)/(t2-t1),(t-t1)/(t2-t1)));
    }
  }
  return out;
}
// Contornos externos a partir dos centros de furos ({x,y,label}). Retorna contours (do maior para o menor,
// cada um com vertices da curva, area, holes = furos de borda e curve), excluded (furos internos) e warnings.
// Lança erro com a causa quando um furo fica fora de qualquer contorno ou a geometria não fecha.
export function contoursFromHoles(holes,settings,label='Furos'){
  const alpha=settings.alphaMeters;
  const alphaText=String(alpha).replace('.',',');
  for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)if(pointsDistance(holes[i],holes[j])<1e-6)throw new Error(`${label}: furos sobrepostos (${holes[i].label??`registro ${i+1}`} e ${holes[j].label??`registro ${j+1}`}).`);
  // Triângulos de Delaunay com raio circunscrito menor que alpha, em sentido anti-horário.
  const triangles=delaunayTriangles(holes)
    .filter(([a,b,c])=>circumradius(holes[a],holes[b],holes[c])<alpha)
    .map(([a,b,c])=>orientation(holes[a],holes[b],holes[c])>0?[a,b,c]:[a,c,b]);
  if(!triangles.length)throw new Error(`${label}: nenhum trio de furos com raio de círculo menor que ${alphaText} m; os furos não formam contorno fechado.`);
  const edgeCount=new Map();
  for(const t of triangles)for(let k=0;k<3;k++){const key=edgeKey(t[k],t[(k+1)%3]);edgeCount.set(key,(edgeCount.get(key)||0)+1);}
  // Regiões: triângulos que compartilham aresta.
  const parent=triangles.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const edgeTriangles=new Map();
  triangles.forEach((t,ti)=>{for(let k=0;k<3;k++){const key=edgeKey(t[k],t[(k+1)%3]);if(!edgeTriangles.has(key))edgeTriangles.set(key,[]);edgeTriangles.get(key).push(ti);}});
  for(const list of edgeTriangles.values())if(list.length===2)parent[find(list[0])]=find(list[1]);
  // Arestas de borda dirigidas (região à esquerda), agrupadas por região.
  const regions=new Map();
  triangles.forEach((t,ti)=>{
    for(let k=0;k<3;k++){
      const a=t[k],b=t[(k+1)%3];
      if(edgeCount.get(edgeKey(a,b))!==1)continue;
      const root=find(ti);
      if(!regions.has(root))regions.set(root,[]);
      regions.get(root).push([a,b]);
    }
  });
  const contours=[];const onRing=new Map();
  let index=0;
  for(const directed of regions.values()){
    index++;
    const rings=boundaryRings(directed,holes,`${label}, região ${index}`);
    for(const ring of rings)for(const v of ring)onRing.set(v,(onRing.get(v)||0)+1);
    const sized=rings.map(ring=>({ring,area:Math.abs(signedArea(ring.map(i=>holes[i])))})).sort((x,y)=>y.area-x.area);
    const outer=sized[0].ring.map(i=>holes[i]);
    for(const other of sized.slice(1)){
      const centre={x:other.ring.reduce((s,i)=>s+holes[i].x,0)/other.ring.length,y:other.ring.reduce((s,i)=>s+holes[i].y,0)/other.ring.length};
      if(!insidePolygon(centre,outer))throw new Error(`${label}, região ${index}: vazio fora do contorno externo; revise os furos desse trecho.`);
    }
    if(!isSimplePolygon(outer))throw new Error(`${label}, região ${index}: contorno com auto-interseção; revise os furos desse trecho.`);
    contours.push({holes:sized[0].ring.map(i=>holes[i]),outer});
  }
  // Furo de encontro: aparece em mais de um anel (ou duas vezes no mesmo). A regra não fecha contorno nele.
  const pinch=[...onRing].filter(([,n])=>n>1).map(([v])=>holes[v].label??`registro ${v+1}`);
  if(pinch.length)throw new Error(`${label}: furo(s) ${pinch.slice(0,10).join(', ')} são o único contato entre dois anéis de furos; o método não fecha contorno em vértice de encontro. Revise os furos desse trecho.`);
  // Curva suave de cada contorno externo.
  const samples=settings.samplesPerSegment;
  const built=contours.map(c=>{
    const curve=smoothClosedCurve(c.outer,samples);
    return {vertices:curve,area:Math.abs(signedArea(curve)),holes:c.holes,curve};
  });
  if(!built.every(c=>isSimplePolygon(c.curve)))throw new Error(`${label}: curva suave com auto-interseção; revise os furos desse trecho.`);
  for(let i=0;i<built.length;i++)for(let j=i+1;j<built.length;j++){
    const A=built[i].curve,B=built[j].curve;
    for(let a=0;a<A.length;a++)for(let b=0;b<B.length;b++){
      if(segmentsCross(A[a],A[(a+1)%A.length],B[b],B[(b+1)%B.length]))throw new Error(`${label}: dois contornos se cruzam; revise os furos desse trecho.`);
    }
  }
  // Furos internos: dentro de alguma curva. Os que ficam fora de todas são recusados com o número.
  const outerIndices=new Set(contours.flatMap(c=>c.holes.map(h=>holes.indexOf(h))));
  const interior=holes.map((h,i)=>i).filter(i=>!outerIndices.has(i));
  const missing=[];const near=[];
  for(const i of interior){
    const owner=built.find(c=>insidePolygon(holes[i],c.curve));
    if(!owner){missing.push(i);continue;}
    let dmin=Infinity;
    for(let k=0;k<owner.curve.length;k++)dmin=Math.min(dmin,distanceToSegment(holes[i],owner.curve[k],owner.curve[(k+1)%owner.curve.length]));
    if(dmin<settings.interiorWarnMeters)near.push(holes[i].label??`registro ${i+1}`);
  }
  if(missing.length){
    const names=missing.slice(0,10).map(i=>holes[i].label??`registro ${i+1}`).join(', ');
    throw new Error(`${label}: ${missing.length} furo(s) fora de contorno fechado (${names}${missing.length>10?' …':''}). Nenhum anel de borda os envolve; trechos de furos em linha aberta não formam contorno.`);
  }
  const warnings=[];
  if(near.length)warnings.push(`${label}: ${near.length} furo(s) interno(s) a menos de ${String(settings.interiorWarnMeters).replace('.',',')} m da curva (${near.slice(0,10).join(', ')}${near.length>10?' …':''}); pode haver furo na divisa. Não foi corrigido.`);
  built.sort((a,b)=>b.vertices.length-a.vertices.length);
  return {contours:built.map(({vertices,area,holes:ring})=>({vertices,area,holes:ring})),excluded:interior.length,warnings};
}
// Converte os registros lidos do DXF em contornos. collars: POINT da camada de furos {x,y};
// texts: TEXT da camada de rótulos {x,y,text}.
export function holesFromRecords(collars,texts,settings,label='Furos'){
  const centres=collars.map(c=>({x:c.x,y:c.y,label:holeLabel(c,texts,settings)}));
  const {holes,merged}=mergeRepeatedHoles(centres,settings);
  const {contours,excluded,warnings}=contoursFromHoles(holes,settings,label);
  return {contours,centres:centres.length,holes:holes.length,merged,excluded,warnings};
}
