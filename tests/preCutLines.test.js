import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import proj4 from 'proj4';
import {validateLines} from '../src/validation.js';
import {distanceToPolyline} from '../src/geometry.js';
import {buildPlan,checkGeometry} from '../src/planner.js';
import {validateProject} from '../src/project.js';

// Linhas de pré-corte: polilinhas abertas. Entram na origem e na distância à borda, sem área.
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url),'utf8'));
const utm=config.crs.find(c=>c.id==='EPSG:31984').definition;
const project=(lon,lat)=>{const [x,y]=proj4('EPSG:4326',utm,[lon,lat]);return {x,y};};
const unproject=(x,y)=>{const [lon,lat]=proj4(utm,'EPSG:4326',[x,y]);return {lon,lat};};
const cx=748900,cy=8930400;
const area={id:'a1',name:'Área 1',vertices:[{x:cx-50,y:cy-50},{x:cx+50,y:cy-50},{x:cx+50,y:cy+50},{x:cx-50,y:cy+50}],direction:null};
const community=(id,x,y)=>{const ll=unproject(x,y);return {id,name:id,lat:ll.lat,lon:ll.lon,enabled:true,fixed:false};};
const communities=[community('c1',cx+200,cy),community('c2',cx-200,cy),community('c3',cx,cy+200)];
const planConfig={validation:{...config.validation},planner:config.planner};
const plan=(lines,options={})=>buildPlan({polygons:[area],lines,communities,instrumentCount:2,project,unproject,config:options.config||planConfig});
const preCut={id:'l1',name:'Linha de pré-corte 1',layer:'PC',vertices:[{x:cx+120,y:cy-100},{x:cx+120,y:cy+100}]};
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-3,`${msg}: ${a} ≠ ${b}`);

test('distância à poligonal aberta: perpendicular e além do extremo', ()=>{
  const pl=[{x:-10,y:0},{x:10,y:0}];
  near(distanceToPolyline({x:0,y:5},pl),5,'perpendicular');
  near(distanceToPolyline({x:20,y:0},pl),10,'além do extremo');
});

test('linha de pré-corte: exige dois vértices, coordenadas válidas e comprimento mínimo da configuração', ()=>{
  assert.throws(()=>validateLines([{id:'x',name:'x',vertices:[{x:0,y:0}]}],{minLineLengthMeters:1}),/mínimo de dois vértices/);
  assert.throws(()=>validateLines([{id:'x',name:'x',vertices:[{x:0,y:0},{x:NaN,y:1}]}],{minLineLengthMeters:1}),/coordenadas inválidas/);
  assert.throws(()=>validateLines([{id:'x',name:'x',vertices:[{x:0,y:0},{x:0.5,y:0}]}],{minLineLengthMeters:1}),/abaixo do mínimo de 1 m/);
  assert.throws(()=>validateLines([{id:'x',name:'x',vertices:[{x:0,y:0},{x:5,y:0}]}],{}),/Comprimento mínimo de linha ausente/);
  assert.deepEqual(validateLines([],{}),[]);
});

test('linha de pré-corte entra na origem e na distância à borda', ()=>{
  const without=plan([]);
  const withLine=plan([preCut]);
  const c1=p=>p.communities.find(c=>c.id==='c1');
  // c1 fica a 200 m do centro; a borda da área está a 150 m e a linha a 80 m.
  near(c1(withLine).edgeDistance,80,'distância à linha');
  assert.ok(c1(withLine).edgeDistance<c1(without).edgeDistance,'a linha aproxima a borda');
  assert.ok(withLine.origin.radius>without.origin.radius,'a origem abrange a linha');
  assert.equal(withLine.lines.length,1);
  assert.match(withLine.warnings.join(' '),/1 linha\(s\) de pré-corte incluída\(s\)/);
});

test('linha fora da região configurada recusa o plano', ()=>{
  const outside=project(-36.5,-9.67);
  const far={id:'l9',name:'Linha longe',layer:'PC',vertices:[{x:outside.x,y:outside.y},{x:outside.x+10,y:outside.y}]};
  const narrow={validation:{...planConfig.validation,regionBounds:[-36.8,-9.8,-36.6,-9.5]},planner:config.planner};
  assert.throws(()=>plan([far],{config:narrow}),/fora da região configurada/);
});

test('linha sozinha (sem áreas) é conferida contra a região e o limite total de vértices', ()=>{
  const outside=project(-36.5,-9.67);
  const far={id:'l9',name:'Linha longe',layer:'PC',vertices:[{x:outside.x,y:outside.y},{x:outside.x+10,y:outside.y}]};
  const narrow={...planConfig,validation:{...planConfig.validation,regionBounds:[-36.8,-9.8,-36.6,-9.5]}};
  assert.throws(()=>checkGeometry({polygons:[],lines:[far],unproject,config:narrow}),/Linhas de pré-corte fora da região configurada/);
  assert.ok(checkGeometry({polygons:[],lines:[preCut],unproject,config:planConfig}).lon!==undefined);
  assert.throws(()=>checkGeometry({polygons:[area],lines:[preCut],unproject,config:{...planConfig,validation:{...planConfig.validation,maxVertices:5}}}),/Limite de 5 vértices/);
  assert.equal(checkGeometry({polygons:[],lines:[],unproject,config:planConfig}),null);
});

test('o aviso de região diz "Linhas" quando a causa é a linha, e não acusa a área', ()=>{
  const outside=project(-36.5,-9.67);
  const far={id:'l9',name:'Linha longe',layer:'PC',vertices:[{x:outside.x,y:outside.y},{x:outside.x+10,y:outside.y}]};
  const narrow={...planConfig,validation:{...planConfig.validation,regionBounds:[-36.8,-9.8,-36.6,-9.5]}};
  assert.throws(()=>plan([far],{config:narrow}),/Linhas de pré-corte fora da região/);
  assert.doesNotThrow(()=>plan([],{config:narrow}));
});

test('cor da linha de pré-corte vem de config.json', ()=>{
  assert.equal(typeof config.visual.mapColors.line,'string');
});

test('projeto: linhas são validadas e projetos antigos sem o campo carregam sem linhas', ()=>{
  const base={schemaVersion:1,crs:config.defaults.crs,communities:structuredClone(config.communities),instrumentCount:config.defaults.instrumentCount,selectedScenario:1,messageTemplate:'x',meta:{date:'2026-10-30',blastName:'REG',time:'12:00',operation:'op',responsible:'r',notes:''},polygons:[]};
  assert.deepEqual(validateProject(base,config).lines,[]);
  assert.equal(validateProject({...base,lines:[preCut]},config).lines.length,1);
  assert.throws(()=>validateProject({...base,lines:[{id:'x',name:'x',vertices:[{x:0,y:0}]}]},config),/mínimo de dois vértices/);
});
