import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWhatsAppMessage, coordinateDMM} from '../src/reports.js';
import {buildDocxParts} from '../src/docx.js';
import {validateProject} from '../src/project.js';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync(new URL('../config.json',import.meta.url),'utf8'));
const origin={x:749069.108,y:8930215.4153,lat:-9.6702667,lon:-36.7302,radius:100};
const point={id:'P01',name:'Barragem de Rejeitos',lat:-9.6672333,lon:-36.7714,x:744500,y:8930550,distance:1200};
const data={config,meta:{date:'2026-09-04',blastName:'REG',time:'08:30',operation:'MINA SERROTE',responsible:'Equipe técnica',notes:'Acesso confirmado'},plan:{origin,polygons:[{name:'Área norte',azimuth:90}],communities:[point]},scenario:{id:2,title:'Direcionamento',points:[point]}};

test('WhatsApp template renders date, DMM, UTM and selected point',()=>{
  const message=buildWhatsAppMessage(data,'{data}|{latitude}|{longitude}|{norte}|{leste}|{quantidade}|{pontos}|{areas}');
  assert.match(message,/04\/09\/2026\|009 40\.216 S\|036 43\.812 W/);
  assert.match(message,/Distância à origem: 1\.200 m/);
  assert.match(message,/Área norte: 90°/);
});

test('coordinate DMM carries rounded minutes into the next degree',()=>{
  assert.equal(coordinateDMM(-9.9999999,'lat'),'010 00.000 S');
  assert.equal(coordinateDMM(36.5,'lon'),'036 30.000 E');
});

test('unknown WhatsApp token is rejected instead of silently disappearing',()=>{
  assert.throws(()=>buildWhatsAppMessage(data,'{data} {token_inventado}'),/Campo desconhecido/);
});

test('DOCX package parts contain a valid image relationship and escaped title',()=>{
  const parts=buildDocxParts('iVBORw0KGgo=','Sismografia <REG>');
  assert.ok(parts['word/media/report.png']);
  assert.match(parts['word/document.xml'],/Sismografia &lt;REG&gt;/);
  assert.match(parts['word/document.xml'],/r:embed="rIdImage"/);
  assert.match(parts['word/_rels/document.xml.rels'],/media\/report\.png/);
});

test('project validation keeps schema, all communities and exact instrument count',()=>{
  const project={schemaVersion:1,savedAt:new Date().toISOString(),crs:'EPSG:31984',meta:{date:'2026-09-04',blastName:'REG',operation:'MINA',responsible:'Equipe',time:'',notes:''},polygons:[],communities:config.communities.map(c=>({...c})),instrumentCount:3,selectedScenario:1,messageTemplate:config.report.whatsappTemplate};
  assert.equal(validateProject(project,config).communities.length,7);
  assert.throws(()=>validateProject({...project,instrumentCount:8},config),/Informe de 1 a 7/);
  assert.throws(()=>validateProject({...project,communities:project.communities.map(c=>({...c,enabled:false}))},config),/Nenhum ponto/);
});
