import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDXF} from '../src/dxf.js';
import {parseDXFBatch} from '../src/dxfBatch.js';

// Dados sintéticos: nenhum DXF real de campanha entra no repositório público.
const limits={closureToleranceMeters:0.001,maxVertices:20000,maxPolygons:100,maxFileBytes:20000000};
const wrap=body=>`0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
// LWPOLYLINE como no CAD: código 90 = número de vértices gravados; código 70 = flags.
const lwpolyline=(points,{layer='0',flag=0}={})=>`0\nLWPOLYLINE\n8\n${layer}\n90\n${points.length}\n70\n${flag}\n${points.map(([x,y])=>`10\n${x}\n20\n${y}\n`).join('')}`;
const square=[[0,0],[100,0],[100,100],[0,100]];
const squareClosedByRepeat=[...square,[0,0]];
// Linha aberta: mesmos vértices do quadrado, sem repetir o primeiro (extremos a 100 m).
const openLine=square;
const file=(name,text,size=text.length)=>({name,size,text:async()=>text});

test('área fechada só pelo último vértice igual ao primeiro é aceita, com aviso e sem o vértice repetido', ()=>{
  // Caso real: CAD grava flag 128 (sem bit de fechamento) e repete o primeiro vértice no fim.
  const result=parseDXF(wrap(lwpolyline(squareClosedByRepeat,{flag:128,layer:'PP'})),limits);
  assert.equal(result.polygons.length,1);
  assert.equal(result.polygons[0].vertices.length,4);
  assert.match(result.warnings.join(' '),/Camada PP: .*tratada como fechada/);
});

test('polilinha marcada como fechada continua aceita sem aviso de fechamento', ()=>{
  const result=parseDXF(wrap(lwpolyline(square,{flag:1})),limits);
  assert.equal(result.polygons[0].vertices.length,4);
  assert.deepEqual(result.warnings,[]);
});

test('polilinha realmente aberta é recusada com camada e distância entre os extremos', ()=>{
  assert.throws(
    ()=>parseDXF(wrap(lwpolyline(openLine,{flag:128,layer:'PC'})),limits),
    /Polilinha aberta na camada PC \(inicial e final distam 100,00 m\)/
  );
});

test('tolerância de fechamento vem da configuração: dentro é aceita, fora é recusada', ()=>{
  const nearby=[...square,[0.0005,0]];
  const far=[...square,[0.01,0]];
  assert.equal(parseDXF(wrap(lwpolyline(nearby,{flag:128})),limits).polygons[0].vertices.length,4);
  assert.throws(()=>parseDXF(wrap(lwpolyline(far,{flag:128})),limits),/aberta/);
});

test('tolerância inválida na configuração é recusada explicitamente', ()=>{
  assert.throws(()=>parseDXF(wrap(lwpolyline(squareClosedByRepeat,{flag:128})),{closureToleranceMeters:-1}),/Tolerância de fechamento DXF inválida/);
});

test('sem tolerância configurada, só coincidência exata fecha a área', ()=>{
  const nearby=[...square,[0.0005,0]];
  assert.throws(()=>parseDXF(wrap(lwpolyline(nearby,{flag:128})),{}),/aberta/);
});

test('lote: aceita os arquivos válidos e recusa, com causa, os demais', async()=>{
  const batch=await parseDXFBatch([
    file('PP561026.dxf',wrap(lwpolyline(squareClosedByRepeat,{flag:128,layer:'PP'}))),
    file('PC561026.dxf',wrap(lwpolyline(openLine,{flag:128,layer:'PC'}))),
    file('notas.txt','qualquer coisa'),
  ],limits);
  assert.deepEqual(batch.accepted.map(a=>a.name),['PP561026.dxf']);
  assert.equal(batch.accepted[0].polygons[0].vertices.length,4);
  assert.deepEqual(batch.refused.map(r=>r.name),['PC561026.dxf','notas.txt']);
  assert.match(batch.refused[0].reason,/Polilinha aberta na camada PC/);
  assert.equal(batch.refused[1].reason,'não é um arquivo DXF.');
});

test('lote sem nenhum arquivo válido não aceita nada', async()=>{
  const batch=await parseDXFBatch([file('PC561026.dxf',wrap(lwpolyline(openLine,{flag:128})))],limits);
  assert.deepEqual(batch.accepted,[]);
  assert.equal(batch.refused.length,1);
});

test('lote recusa arquivo acima do limite de tamanho sem ler o conteúdo', async()=>{
  let read=false;
  const big={name:'grande.dxf',size:limits.maxFileBytes+1,text:async()=>{read=true;return '';}};
  const batch=await parseDXFBatch([big],limits);
  assert.equal(read,false);
  assert.match(batch.refused[0].reason,/acima do limite/);
});
