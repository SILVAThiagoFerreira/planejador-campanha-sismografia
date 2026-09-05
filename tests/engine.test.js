import test from 'node:test';
import assert from 'node:assert/strict';
import {smallestEnclosingCircle,distanceToPolygon,polygonCentroid,bearing,distance} from '../src/geometry.js';
import {parseDXF} from '../src/dxf.js';
import {buildPlan} from '../src/planner.js';
import {validatePolygons} from '../src/validation.js';
import proj4 from 'proj4';
import {readFileSync} from 'node:fs';
const square=[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
test('minimum circle considers extremes, unaffected by vertex density',()=>{
 const circle=smallestEnclosingCircle([...square,...Array.from({length:100},(_,i)=>({x:0.9,y:i/100}))]);near(circle.x,0);near(circle.y,0);near(circle.radius,Math.SQRT2);
 const c=smallestEnclosingCircle([{x:0,y:0},{x:4,y:0},{x:1,y:1}]);near(c.x,2);near(c.radius,2);
});
test('minimum circle encloses random projected UTM points',()=>{let seed=77;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);for(let trial=0;trial<40;trial++){const points=Array.from({length:80},()=>({x:749000+random()*1000,y:8939000+random()*1000}));const c=smallestEnclosingCircle(points);assert.ok(points.every(p=>distance(c,p)<=c.radius+1e-6));}});
test('polygon distance is zero inside; centroid and north clockwise bearing',()=>{near(distanceToPolygon({x:0,y:0},square),0);near(distanceToPolygon({x:4,y:0},square),3);near(polygonCentroid(square).x,0);near(bearing({x:0,y:0},{x:1,y:0}),90);});
const wrap=body=>`0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const lw=(flag=1,extra='')=>`0\nLWPOLYLINE\n8\nREG\n90\n4\n70\n${flag}\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n100\n10\n0\n20\n100\n${extra}`;
test('ASCII DXF closed LWPOLYLINE and classic POLYLINE',()=>{assert.equal(parseDXF(wrap(lw())).polygons[0].vertices.length,4);const body='0\nPOLYLINE\n70\n1\n'+[[0,0],[10,0],[0,10]].map(([x,y])=>`0\nVERTEX\n10\n${x}\n20\n${y}\n`).join('')+'0\nSEQEND\n';assert.equal(parseDXF(wrap(body)).polygons[0].vertices.length,3);});
test('DXF rejects open areas, bulges, blocks, truncation, OCS, invalid counts and limits',()=>{for(const input of [wrap(lw(0)),wrap(lw(1,'42\n0.2\n')),wrap('0\nINSERT\n8\n0\n'),wrap(lw()).replace('0\nEOF\n',''),wrap(lw(1,'210\n1\n')),wrap(lw().replace('90\n4','90\n7'))])assert.throws(()=>parseDXF(input));assert.throws(()=>parseDXF(wrap(lw()),{maxVertices:3}));});
test('reject crossing and zero-area polygons',()=>{assert.throws(()=>validatePolygons([{id:'x',vertices:[square[0],square[2],square[1],square[3]]}]));assert.throws(()=>validatePolygons([{id:'x',vertices:[{x:0,y:0},{x:1,y:1},{x:2,y:2}]}]));});
const communities=[{id:'n',name:'Norte',lon:0,lat:10},{id:'e',name:'Leste',lon:10,lat:0},{id:'s',name:'Sul',lon:0,lat:-10},{id:'w',name:'Oeste',lon:-10,lat:0},{id:'ne',name:'NE',lon:10,lat:10},{id:'sw',name:'SO',lon:-10,lat:-10},{id:'se',name:'SE',lon:10,lat:-10}];
const options={polygons:[{id:'p',name:'Área',vertices:square,direction:90}],communities,project:(lon,lat)=>({x:lon,y:lat}),unproject:(x,y)=>({lon:x,lat:y}),config:{}};
test('three complete scenarios for every instrument count 1 through 7',()=>{for(let n=1;n<=7;n++){const plan=buildPlan({...options,instrumentCount:n});assert.equal(plan.scenarios.length,3);for(const s of plan.scenarios){assert.equal(s.points.length,n);assert.equal(new Set(s.points.map(p=>p.id)).size,n);}if(n===7)assert.deepEqual(plan.scenarios[0].coincidentWith,[2,3]);}});
test('direction uses North clockwise azimuth; changing 90 to 270 changes ranking',()=>{let p=buildPlan({...options,instrumentCount:1});assert.equal(p.scenarios[1].points[0].id,'e');p=buildPlan({...options,polygons:[{...options.polygons[0],direction:270}],instrumentCount:1});assert.equal(p.scenarios[1].points[0].id,'w');});
test('missing direction is explicit, invalid count and direction stop processing',()=>{const plan=buildPlan({...options,polygons:[{...options.polygons[0],direction:null}],instrumentCount:3});assert.ok(plan.warnings.some(w=>w.includes('nenhuma direção')));for(const n of [0,8,1.5,NaN])assert.throws(()=>buildPlan({...options,instrumentCount:n}));assert.throws(()=>buildPlan({...options,polygons:[{...options.polygons[0],direction:360}],instrumentCount:1}));});
test('coverage rewards distinct bearings; coincident bearings do not create a full circle',()=>{
 const p=buildPlan({...options,communities:[{id:'a',name:'N1',lon:0,lat:10},{id:'b',name:'N2',lon:0,lat:11},{id:'c',name:'Sul',lon:0,lat:-10}],instrumentCount:2,config:{planner:{coverageWeight:1}}});
 assert.ok(p.scenarios[2].points.some(p=>p.id==='c'));near(p.scenarios[2].score,.5);
 const same=buildPlan({...options,communities:[{id:'a',name:'N1',lon:0,lat:10},{id:'b',name:'N2',lon:0,lat:11}],instrumentCount:2,config:{planner:{coverageWeight:1}}});near(same.scenarios[2].score,0);
});
test('empty, repeated and nonfinite vertices stop processing',()=>{
 assert.throws(()=>validatePolygons([]));
 assert.throws(()=>validatePolygons([{id:'x',vertices:[...square,square[0]]}]));
 assert.throws(()=>validatePolygons([{id:'x',vertices:[...square,{x:NaN,y:1}]}]));
 assert.throws(()=>parseDXF(wrap(lw().replace('10\n100','10\n'))));
 assert.throws(()=>validatePolygons([{id:'spike',vertices:[{x:0,y:0},{x:3,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]}]),/auto-interseção/);
});
test('invalid projection and configured region are rejected explicitly',()=>{
 assert.throws(()=>buildPlan({...options,instrumentCount:1,unproject:()=>({lon:NaN,lat:NaN})}));
 assert.throws(()=>buildPlan({...options,instrumentCount:1,config:{validation:{regionBounds:[-37.2,-10.2,-36.2,-9.1]}}}),/região/);
 assert.throws(()=>buildPlan({...options,instrumentCount:1,config:{validation:{maxRadiusMeters:1}}}),/Extensão/);
});
const utm='+proj=utm +zone=24 +south +ellps=GRS80 +units=m +no_defs';
test('SIRGAS 2000 UTM24S agrees with report rounded GPS and inverse coordinates',()=>{
 const lon=-(36+43.812/60),lat=-(9+40.216/60),[x,y]=proj4('EPSG:4326',utm,[lon,lat]);
 // The report prints geographic minutes to .001 (roughly 1.8 m precision).
 assert.ok(Math.hypot(x-749069.1080,y-8930215.4153)<1.5);
 const [outLon,outLat]=proj4(utm,'EPSG:4326',[x,y]);near(outLon,lon);near(outLat,lat);
});
test('demonstration fixture supports real-region planning and invalid fixture fails',()=>{
 const parsed=parseDXF(readFileSync(new URL('./fixtures/campanha.dxf',import.meta.url),'utf8'));
 const p=buildPlan({polygons:parsed.polygons,communities:[{id:'torroes',name:'Comunidade de Torrões',lat:-(9+39.898/60),lon:-(36+43.091/60)}],instrumentCount:1,project:(lon,lat)=>{const [x,y]=proj4('EPSG:4326',utm,[lon,lat]);return{x,y};},unproject:(x,y)=>{const [lon,lat]=proj4(utm,'EPSG:4326',[x,y]);return{lon,lat};},config:{validation:{regionBounds:[-37.2,-10.2,-36.2,-9.1]}}});
 assert.equal(p.polygons.length,2);assert.ok(p.communities[0].distance>1000);
 assert.throws(()=>parseDXF(readFileSync(new URL('./fixtures/invalido.dxf',import.meta.url),'utf8')),/aberta/);
});
