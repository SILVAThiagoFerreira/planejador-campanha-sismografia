import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {delaunayTriangles} from '../src/delaunay.js';
import {validateHoleSettings,holeLabel,mergeRepeatedHoles,contoursFromHoles,holesFromRecords} from '../src/holes.js';
import {parseDXF} from '../src/dxf.js';
import {parseDXFBatch} from '../src/dxfBatch.js';
import {validatePolygons} from '../src/validation.js';

// Dados sintéticos: nenhum plano de furos real de campanha entra no repositório público.
const settings={collarLayer:'Hole',labelLayer:'Number',labelMaxOffsetMeters:1,labelAlignToleranceMeters:0.05,duplicateToleranceMeters:1,minSpacingMeters:0.5,alphaMeters:4.5,samplesPerSegment:8,interiorWarnMeters:0.5,contourName:'Contorno de furos'};
const SAMPLES=settings.samplesPerSegment;
const limits={closureToleranceMeters:0.001,minLineLengthMeters:1,maxVertices:20000,maxPolygons:100,maxFileBytes:20000000};
const wrap=body=>`0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const pointEntity=(x,y,layer='Hole')=>`0\nPOINT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n0\n`;
const textEntity=(x,y,text,layer='Number')=>`0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n0\n40\n0.3\n1\n${text}\n`;
const polyline=(points,{layer='Real Hole',flag=8}={})=>`0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${flag}\n${points.map(([x,y])=>`0\nVERTEX\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n0\n`).join('')}0\nSEQEND\n8\n${layer}\n`;
// Grade de furos espaçada; skip(i,j) remove furos. Retorna centros {x,y}.
function grid(nx,ny,{spacing=3,skip=()=>false}={}){
  const holes=[];
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){if(!skip(i,j))holes.push({x:i*spacing,y:j*spacing});}
  return holes;
}
// Registros de DXF para uma lista de centros, numerados em ordem.
function holeRecords(centres,start=1){
  return centres.map((c,i)=>({x:c.x,y:c.y,label:String(start+i)}));
}
// Converte centros com número em registros de DXF (POINT + TEXT acima do centro).
function dxfHoles(centres,start=1){
  return centres.map((c,i)=>pointEntity(c.x,c.y)+textEntity(c.x,c.y+0.38,String(start+i))).join('');
}
const perimeterOfGrid=(nx,ny)=>2*(nx+ny)-4;
const hullArea=points=>{
  const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
  for(const q of p.reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
  const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
  let s=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];s+=a.x*b.y-b.x*a.y;}
  return Math.abs(s)/2;
};
let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};

test('Delaunay: triângulos cobrem o fecho convexo (grade e pontos aleatórios)', ()=>{
  const grid5=grid(5,4);
  const random40=Array.from({length:40},()=>({x:random()*50,y:random()*30}));
  for(const pts of [grid5,random40]){
    const tris=delaunayTriangles(pts);
    const area=tris.reduce((s,[a,b,c])=>s+Math.abs((pts[b].x-pts[a].x)*(pts[c].y-pts[a].y)-(pts[b].y-pts[a].y)*(pts[c].x-pts[a].x))/2,0);
    assert.ok(Math.abs(area-hullArea(pts))<1e-6,`área ${area} != fecho ${hullArea(pts)}`);
  }
});

test('Delaunay: menos de três pontos não formam triângulos', ()=>{
  assert.deepEqual(delaunayTriangles([{x:0,y:0},{x:1,y:0}]),[]);
});

test('contorno da grade passa por todos os furos da borda e deixa os internos de fora', ()=>{
  const holes=holeRecords(grid(5,5));
  const {contours,excluded}=contoursFromHoles(holes,settings);
  assert.equal(contours.length,1);
  assert.equal(contours[0].holes.length,perimeterOfGrid(5,5));
  assert.equal(contours[0].vertices.length,perimeterOfGrid(5,5)*SAMPLES);
  assert.equal(excluded,9);
  // Cada furo de borda é um vértice exato da curva.
  for(const h of contours[0].holes)assert.ok(contours[0].vertices.some(v=>Math.abs(v.x-h.x)<1e-9&&Math.abs(v.y-h.y)<1e-9),`furo ${h.label} fora da curva`);
  // Valor conferido com gerar_contorno_furos.py (mesma curva Catmull-Rom): a curva passa um pouco além dos cantos.
  assert.ok(Math.abs(contours[0].area-146.9531)<1e-3,`área ${contours[0].area}`);
});

test('contorno de padrão em L segue o alpha shape: corta a diagonal do canto côncavo e deixa (6,6) de fora', ()=>{
  const centres=grid(6,6,{skip:(i,j)=>i>=3&&j>=3});
  const holes=holeRecords(centres);
  const {contours,excluded}=contoursFromHoles(holes,settings);
  assert.equal(contours.length,1);
  const key=p=>`${p.x},${p.y}`;
  // Anel conferido com gerar_contorno_furos.py (mesmos centros): 19 furos de borda.
  const expected=[[0,0],[0,3],[0,6],[0,9],[0,12],[0,15],[3,0],[3,15],[6,0],[6,9],[6,12],[6,15],[9,0],[9,6],[12,0],[12,6],[15,0],[15,3],[15,6]].map(([x,y])=>`${x},${y}`).sort();
  assert.deepEqual(contours[0].holes.map(key).sort(),expected);
  assert.equal(contours[0].vertices.length,expected.length*SAMPLES);
  assert.equal(excluded,centres.length-expected.length);
});

test('vazio interno (furo ausente cercado por furos) não entra no contorno externo', ()=>{
  const holes=holeRecords(grid(5,5,{skip:(i,j)=>i===2&&j===2}));
  const {contours,excluded}=contoursFromHoles(holes,settings);
  assert.equal(contours.length,1);
  assert.equal(contours[0].holes.length,perimeterOfGrid(5,5));
  assert.equal(excluded,8);
});

test('regiões separadas viram contornos separados', ()=>{
  const left=grid(4,4);
  const right=grid(4,4).map(c=>({x:c.x+30,y:c.y}));
  const holes=holeRecords([...left,...right]);
  const {contours}=contoursFromHoles(holes,settings);
  assert.equal(contours.length,2);
  assert.deepEqual(contours.map(c=>c.holes.length),[12,12]);
});

test('curva de furos é suave e fica dentro da região: nenhum furo interno fica fora da curva', ()=>{
  const holes=holeRecords(grid(5,5,{skip:(i,j)=>i===2&&j===2}));
  const {contours,excluded,warnings}=contoursFromHoles(holes,settings);
  assert.equal(excluded,8);
  assert.deepEqual(warnings,[]);
  // Todo furo interno está dentro da curva externa.
  const curve=contours[0].vertices;
  const inside=p=>{let c=false;for(let i=0,j=curve.length-1;i<curve.length;j=i++){const a=curve[i],b=curve[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c;}return c;};
  for(const h of holes)if(!contours[0].holes.includes(h))assert.ok(inside(h),`furo ${h.label} fora da curva`);
});

test('raio do círculo (alphaMeters) separa malha de lacuna: lacuna maior que o raio fica de fora', ()=>{
  // Dois blocos 4 × 4 (espaçamento 3 m) separados por uma lacuna de 9 m: os triângulos da ponte têm raio de
  // cerca de 5 m, maior que 4,5 m. (Com lacuna de 6 m, o raio da ponte seria 3,35 m e os blocos se uniriam.)
  const left=grid(4,4);
  const right=grid(4,4).map(c=>({x:c.x+18,y:c.y}));
  const {contours}=contoursFromHoles(holeRecords([...left,...right]),settings);
  assert.equal(contours.length,2);
  // Com alpha de 10 m a ponte entra e os dois blocos viram um só contorno.
  const {contours:joined}=contoursFromHoles(holeRecords([...left,...right]),{...settings,alphaMeters:10});
  assert.equal(joined.length,1);
});

test('furo isolado é recusado com a causa e o número do furo', ()=>{
  const holes=[...holeRecords(grid(4,4)),{x:100,y:100,label:'77'}];
  assert.throws(()=>contoursFromHoles(holes,settings),/furo\(s\) fora de contorno fechado \(77\)/);
});

test('trecho em linha aberta não forma contorno e é recusado', ()=>{
  const line=Array.from({length:6},(_,i)=>({x:i*2.5,y:0,label:String(i+1)}));
  assert.throws(()=>contoursFromHoles(line,settings),/nenhum trio de furos com raio de círculo menor que 4,5 m|não formam contorno fechado/);
});

test('furos sobrepostos são recusados, sem contorno inventado', ()=>{
  const holes=[{x:0,y:0,label:'1'},{x:0,y:0,label:'2'},{x:3,y:0,label:'3'},{x:0,y:3,label:'4'}];
  assert.throws(()=>contoursFromHoles(holes,settings),/furos sobrepostos \(1 e 2\)/);
});

test('número do furo vem do texto alinhado e acima do centro; texto ambíguo deixa o furo sem número', ()=>{
  const collar={x:10,y:20};
  assert.equal(holeLabel(collar,[{x:10,y:20.38,text:'12'}],settings),'12');
  assert.equal(holeLabel(collar,[{x:10,y:20.38,text:'12'},{x:10,y:20.5,text:'13'}],settings),null);
  assert.equal(holeLabel(collar,[{x:12,y:20.38,text:'12'}],settings),null);
  assert.equal(holeLabel(collar,[{x:10,y:19.5,text:'12'}],settings),null);
});

test('registros repetidos do mesmo número a até 1 m são um só furo; outro número ou distância maior não une', ()=>{
  const rules={duplicateToleranceMeters:1,minSpacingMeters:0.5};
  const holes=[{x:0,y:0,label:'5'},{x:0.6,y:0.2,label:'5'},{x:3,y:0,label:'6'},{x:6,y:0,label:null},{x:9,y:0,label:'5'}];
  const {holes:kept,merged}=mergeRepeatedHoles(holes,rules);
  assert.equal(merged,1);
  assert.deepEqual(kept.map(h=>h.label),['5','6',null,'5']);
});

test('centros mais próximos que minSpacingMeters são o mesmo furo, com ou sem número igual', ()=>{
  const rules={duplicateToleranceMeters:1,minSpacingMeters:0.5};
  const holes=[{x:0,y:0,label:'7'},{x:0.3,y:0,label:'8'},{x:0.2,y:0.2,label:null},{x:3,y:0,label:'9'}];
  const {holes:kept,merged}=mergeRepeatedHoles(holes,rules);
  assert.equal(merged,2);
  assert.deepEqual(kept.map(h=>h.label),['7','9']);
});

test('contorno com registros repetidos não repete vértices', ()=>{
  const centres=grid(5,5);
  const records=holeRecords(centres).flatMap((h,i)=>i===0?[h,{...h,x:h.x+0.5}]:[h]);
  const collars=records.map(h=>({x:h.x,y:h.y}));
  const texts=records.map(h=>({x:h.x,y:h.y+0.38,text:h.label}));
  const result=holesFromRecords(collars,texts,settings,'Furos');
  assert.equal(result.merged,1);
  assert.equal(result.contours[0].holes.length,perimeterOfGrid(5,5));
  assert.equal(result.contours[0].vertices.length,perimeterOfGrid(5,5)*SAMPLES);
  assert.equal(new Set(result.contours[0].vertices.map(v=>`${v.x},${v.y}`)).size,result.contours[0].vertices.length);
});

test('bloco holes precisa estar completo e válido; config.json do projeto passa na validação', ()=>{
  const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url),'utf8'));
  assert.doesNotThrow(()=>validateHoleSettings(config.holes));
  assert.throws(()=>validateHoleSettings(undefined),/Bloco "holes" ausente/);
  assert.throws(()=>validateHoleSettings({...settings,collarLayer:''}),/holes\.collarLayer/);
  assert.throws(()=>validateHoleSettings({...settings,alphaMeters:0}),/holes\.alphaMeters deve ser maior que zero/);
  const {alphaMeters,...withoutAlpha}=settings;
  assert.throws(()=>validateHoleSettings(withoutAlpha),/holes\.alphaMeters ausente/);
  assert.throws(()=>validateHoleSettings({...settings,samplesPerSegment:1}),/holes\.samplesPerSegment deve ser inteiro de 2 ou mais/);
  assert.throws(()=>validateHoleSettings({...settings,interiorWarnMeters:-1}),/holes\.interiorWarnMeters/);
  assert.throws(()=>validateHoleSettings({...settings,duplicateToleranceMeters:-1}),/holes\.duplicateToleranceMeters/);
});

test('DXF de furos: centros viram um contorno; polilinhas abertas de furos reais são ignoradas com aviso', ()=>{
  const centres=grid(5,5);
  const text=wrap(dxfHoles(centres)+polyline([[0,0],[1,1],[2,2]]));
  const result=parseDXF(text,limits,settings);
  assert.equal(result.polygons.length,1);
  assert.equal(result.polygons[0].name,'Contorno de furos 1');
  assert.equal(result.polygons[0].vertices.length,perimeterOfGrid(5,5)*SAMPLES);
  assert.equal(result.lines.length,0);
  assert.match(result.warnings.join(' '),/1 polilinha\(s\) aberta\(s\) ignorada\(s\) \(camada Real Hole\)/);
  assert.match(result.warnings.join(' '),/25 centro\(s\)/);
});

test('DXF de furos com polilinha fechada: a área fechada continua sendo importada', ()=>{
  const square=[[100,0],[110,0],[110,10],[100,10]];
  const closed=`0\nLWPOLYLINE\n8\nPP\n90\n4\n70\n1\n${square.map(([x,y])=>`10\n${x}\n20\n${y}\n`).join('')}`;
  const result=parseDXF(wrap(dxfHoles(grid(4,4))+closed),limits,settings);
  assert.deepEqual(result.polygons.map(p=>p.name),['PP 1','Contorno de furos 1']);
  validatePolygons(result.polygons,limits);
});

test('sem bloco holes, centros de furos não viram contorno: a chamada não tem configuração para lê-los', ()=>{
  assert.throws(()=>parseDXF(wrap(dxfHoles(grid(4,4))),limits),/Importe ao menos uma poligonal fechada/);
});

test('DXF de furos sem contorno fechado é recusado com a causa, no lote', async()=>{
  const line=Array.from({length:6},(_,i)=>({x:i*2.5,y:0}));
  const file={name:'REG.dxf',size:1000,text:async()=>wrap(dxfHoles(line))};
  const batch=await parseDXFBatch([file],limits,settings);
  assert.equal(batch.accepted.length,0);
  assert.equal(batch.refused[0].name,'REG.dxf');
  assert.match(batch.refused[0].reason,/Furos/);
});

test('texto de rótulo em outra camada não altera os números dos furos', ()=>{
  const centres=grid(4,4);
  const text=wrap(dxfHoles(centres).replace(/\n8\nNumber\n/g,'\n8\nOutra\n'));
  const result=parseDXF(text,limits,settings);
  assert.equal(result.polygons.length,1);
  assert.equal(result.polygons[0].vertices.length,perimeterOfGrid(4,4)*SAMPLES);
});
