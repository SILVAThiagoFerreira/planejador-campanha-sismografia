import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWhatsAppMessage, coordinateDMM, coordinateNumber, reportNotes, situationBlock} from '../src/reports.js';
import {number} from '../src/reportFormat.js';
import {layoutReport} from '../src/reportLayout.js';
import {pdfSafeText} from '../src/reportPdf.js';
import {buildDocxParts} from '../src/docx.js';
import {validateProject} from '../src/project.js';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync(new URL('../config.json',import.meta.url),'utf8'));
const origin={x:749069.108,y:8930215.4153,lat:-9.6702667,lon:-36.7302,radius:100};
const point={id:'P01',name:'Barragem de Rejeitos',lat:-9.6672333,lon:-36.7714,x:744500,y:8930550,distance:1200};
const data={config,meta:{date:'2026-09-04',blastName:'REG',time:'08:30',operation:'MINA SERROTE',responsible:'Equipe técnica',notes:'Acesso confirmado'},plan:{origin,polygons:[{name:'Área norte',azimuth:90}],communities:[point]},scenario:{id:2,title:'Direcionamento',points:[point]}};

test('report omits the demonstration notice but keeps campaign notes',()=>{
  assert.equal(reportNotes('DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha.'), '');
  assert.equal(reportNotes('DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha.', 'fallback'), 'fallback');
  assert.equal(reportNotes('Acesso confirmado', 'fallback'), 'Acesso confirmado');
  assert.equal(reportNotes('DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha. Observação adicional.', 'fallback'), 'DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha. Observação adicional.');
  assert.equal(reportNotes('', 'fallback'), 'fallback');
});

test('WhatsApp omits the demonstration notice from observations',()=>{
  const demoData={...data,meta:{...data.meta,notes:'DEMONSTRAÇÃO: áreas fictícias para conhecer a ferramenta. Importe as poligonais reais antes de planejar uma campanha.'}};
  const message=buildWhatsAppMessage(demoData,'*OBSERVAÇÕES*\n{observacoes}');
  assert.match(message,/\*OBSERVAÇÕES\*\nConfirmar acesso, autorização de instalação e acoplamento dos instrumentos antes da campanha\./);
  assert.doesNotMatch(message,/DEMONSTRAÇÃO|fictícias/i);
});

test('WhatsApp padrão: título de campanha com a data e sem bloco de observações',()=>{
  const message=buildWhatsAppMessage(data);
  assert.match(message,/^\*Campanha de Sismografia Planejada \| Desmonte [^*]+\*/);
  assert.doesNotMatch(message,/OBSERVAÇÕES|Acesso confirmado|Confirmar acesso/);
  assert.match(message,/Responsável: Equipe técnica/);
});

test('WhatsApp template renders date, DMM, UTM and selected point',()=>{
  const message=buildWhatsAppMessage(data,'{data}|{latitude}|{longitude}|{norte}|{leste}|{quantidade}|{pontos}|{areas}');
  assert.match(message,/04\/09\/2026\|009 40\.216 S\|036 43\.812 W/);
  assert.match(message,/Distância à origem: 1\.200 m/);
  assert.match(message,/Área norte: 90°/);
});

test('WhatsApp message identifies a fixed point',()=>{
  const fixedData={...data,scenario:{...data.scenario,points:[{...point,fixed:true}]}};
  assert.match(buildWhatsAppMessage(fixedData,'{pontos}'),/Barragem de Rejeitos \(FIXO\)/);
});

test('situation diagram and map share one block rectangle from config',()=>{
  const block=situationBlock(config.report,537);
  assert.equal(block.width,537);
  assert.equal(block.height,537*config.report.situationBlock.heightRatio);
  assert.equal(block.diagramWidth,config.report.situationBlock.diagramWidth);
  assert.ok(Math.abs(block.diagramWidth/block.diagramHeight-block.width/block.height)<0.01);
  assert.throws(()=>situationBlock({...config.report,situationBlock:{heightRatio:0,diagramWidth:1100}},537),/report\.situationBlock/);
  assert.throws(()=>situationBlock({...config.report,situationBlock:undefined},537),/report\.situationBlock/);
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
  assert.ok(validateProject(project,config).communities.every(c=>c.fixed===false));
  const withFixed={...project,communities:project.communities.map((c,i)=>({...c,fixed:i<2}))};
  assert.equal(validateProject(withFixed,config).communities.filter(c=>c.fixed).length,2);
  assert.throws(()=>validateProject({...withFixed,instrumentCount:1},config),/2 pontos fixos/);
  assert.throws(()=>validateProject({...project,communities:project.communities.map((c,i)=>({...c,fixed:i===0,enabled:i!==0}))},config),/também deve estar habilitado/);
  assert.throws(()=>validateProject({...project,instrumentCount:8},config),/Informe de 1 a 7/);
  assert.throws(()=>validateProject({...project,communities:project.communities.map(c=>({...c,enabled:false}))},config),/Nenhum ponto/);
});

const coordinateOrigin={...origin,x:748777.2549,y:8930441.2703};
const coordinateData={...data,plan:{...data.plan,origin:coordinateOrigin},mapCanvas:{},mapCaption:'Mapa de teste.'};
const fakeMeasure=(str,size,bold)=>String(str).length*size*(bold?0.56:0.5);
const pngSize=buffer=>({width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)});
const footerBytes=fs.readFileSync(new URL('../assets/enaex-white.png',import.meta.url));
const brandBytes=fs.readFileSync(new URL('../assets/report-brand.jpg',import.meta.url));
const testImages={
  brand:{src:`data:image/jpeg;base64,${brandBytes.toString('base64')}`,width:1277,height:208,format:'JPEG'},
  footerLogo:{src:`data:image/png;base64,${footerBytes.toString('base64')}`,...pngSize(footerBytes),format:'PNG'},
  map:{src:`data:image/png;base64,${footerBytes.toString('base64')}`,...pngSize(footerBytes),format:'PNG'},
};

test('coordinates in the report are shown without thousands separator, quantities keep it',()=>{
  assert.equal(coordinateNumber(8930441.2703,4),'8930441,2703');
  assert.equal(coordinateNumber(748777.2549,4),'748777,2549');
  assert.equal(number(1200,0),'1.200');
  assert.equal(number(8930441.2703,4),'8.930.441,2703');
});

test('nome longo de área aparece inteiro no bloco de direções, sem reticências',()=>{
  const longName='Desmonte 12-11 setor norte leste ZETA-UNICO-FIM';
  const withLongName={...coordinateData,plan:{...coordinateData.plan,polygons:[{name:longName,azimuth:45}]}};
  const layout=layoutReport(withLongName,{measure:fakeMeasure,imageSize:key=>({width:testImages[key].width,height:testImages[key].height})});
  const texts=layout.ops.filter(op=>op.t==='text').map(op=>op.str);
  assert.ok(texts.some(s=>s.includes('ZETA-UNICO-FIM')),'fim do nome aparece no relatório');
  assert.ok(!texts.some(s=>s.includes('…')),'nenhum nome é cortado com reticências');
});

test('mais áreas que maxDirectionRows: o resumo aponta para o projeto JSON, sem citar o TXT',()=>{
  const polygons=Array.from({length:5},(_,i)=>({name:`Área ${i+1}`,azimuth:i*10}));
  const many={...coordinateData,plan:{...coordinateData.plan,polygons}};
  const layout=layoutReport(many,{measure:fakeMeasure,imageSize:key=>({width:testImages[key].width,height:testImages[key].height})});
  const all=layout.ops.filter(op=>op.t==='text').map(op=>op.str).join('\n');
  assert.ok(all.includes('+ 1 áreas. Relação completa de direções no projeto JSON.'),'resumo aponta para o projeto JSON');
  assert.ok(!all.includes('mensagem TXT'),'o TXT padrão não lista áreas');
});

test('maxDirectionRows ausente em config.json recusa o relatório, sem valor padrão silencioso',()=>{
  const noLimit={...coordinateData,config:{...config,report:{...config.report,maxDirectionRows:undefined}}};
  assert.throws(()=>layoutReport(noLimit,{measure:fakeMeasure,imageSize:()=>({width:1,height:1})}),/maxDirectionRows/);
});

test('responsável do rodapé alinhado à direita, na margem do relatório',()=>{
  const layout=layoutReport(coordinateData,{measure:fakeMeasure,imageSize:key=>({width:testImages[key].width,height:testImages[key].height})});
  const op=layout.ops.find(o=>o.t==='text'&&o.str==='Equipe técnica');
  assert.ok(op,'responsável aparece no rodapé');
  const right=op.x+fakeMeasure(op.str,op.size,op.bold);
  assert.ok(Math.abs(right-(layout.width-coordinateData.config.report.margin))<0.01,'termina na margem direita');
});

test('report layout writes coordinates as text and only brand, logo and map are images',()=>{
  const layout=layoutReport(coordinateData,{measure:fakeMeasure,imageSize:key=>({width:testImages[key].width,height:testImages[key].height})});
  const texts=layout.ops.filter(op=>op.t==='text').map(op=>op.str);
  assert.ok(texts.includes('8930441,2703 m'));
  assert.ok(texts.includes('748777,2549 m'));
  assert.ok(texts.includes('Norte (Y)'));
  assert.ok(texts.includes('SISMOGRAFIA - 04/09/2026'));
  const images=layout.ops.filter(op=>op.t==='image').map(op=>op.key);
  assert.deepEqual([...new Set(images)].sort(),['brand','footerLogo','map']);
  assert.ok(!layout.ops.some(op=>op.t==='image'&&op.w>=layout.width&&op.h>=layout.height&&op.key!=='brand'));
});

test('PDF is built with real vector text, tables and images only for the identity and map',async()=>{
  const {jsPDF}=await import('jspdf');
  const {buildReportPdf}=await import('../src/reportPdf.js');
  const doc=buildReportPdf(coordinateData,jsPDF,testImages,{compress:false});
  const raw=Buffer.from(doc.output('arraybuffer')).toString('latin1');
  assert.match(raw,/\(8930441,2703 m\)/);
  assert.match(raw,/\(748777,2549 m\)/);
  assert.match(raw,/\(Norte \\\(Y\\\)\)/);
  assert.match(raw,/\(MONITORAMENTO PROPOSTO\)/);
  assert.ok((raw.match(/ Tj/g)||[]).length>40,'texto deve ser escrito com operadores Tj');
  assert.ok((raw.match(/\/Subtype\s*\/Image/g)||[]).length>=3);
});

test('PDF text is limited to WinAnsi characters and keeps Portuguese accents',()=>{
  assert.equal(pdfSafeText('Relação ↑ · 10–20 m…'),'Relação ? · 10–20 m…');
  assert.equal(pdfSafeText('AVANÇO PLANEJADO ã é'),'AVANÇO PLANEJADO ã é');
});

test('PDF requires the configured font and layout rejects a missing scenario',async()=>{
  const {jsPDF}=await import('jspdf');
  const {buildReportPdf}=await import('../src/reportPdf.js');
  const noFont={...coordinateData,config:{...config,report:{...config.report,pdfFontFamily:undefined}}};
  assert.throws(()=>buildReportPdf(noFont,jsPDF,testImages),/report\.pdfFontFamily/);
  assert.throws(()=>layoutReport({...coordinateData,scenario:{...coordinateData.scenario,points:[]}},{measure:fakeMeasure,imageSize:()=>({width:1,height:1})}),/cenário/);
});

test('mine surface sits above the schematic background, clipped to the diagram, and invalid bounds are refused',()=>{
  const col=(config.report.width-config.report.margin*2-config.report.width*.028)/2;
  const bounds={minX:748135.47,minY:8928879.89,maxX:749434.48,maxY:8930785.9};
  const images=key=>({width:testImages[key]?.width??1,height:testImages[key]?.height??1});
  const plain=layoutReport(data,{measure:fakeMeasure,imageSize:images});
  assert.equal(plain.ops.some(op=>op.t==='image'&&op.key==='surface'),false,'sem superfície não há imagem do esquema');
  const layout=layoutReport({...data,surface:{bounds}},{measure:fakeMeasure,imageSize:images});
  const surfaceIndex=layout.ops.findIndex(op=>op.t==='image'&&op.key==='surface');
  assert.ok(surfaceIndex>0,'a superfície existe no layout');
  const firstLine=layout.ops.findIndex(op=>op.t==='line');
  const op=layout.ops[surfaceIndex];
  const block=situationBlock(config.report,col);
  const background=layout.ops[surfaceIndex-1];
  assert.ok(background.t==='rect'&&background.fill===config.report.ink&&Math.abs(background.w-block.width)<1e-6,'o fundo escuro do esquema vem imediatamente antes da superfície');
  assert.ok(surfaceIndex<firstLine,'a superfície fica sob as linhas e os rótulos do esquema');
  assert.ok(Math.abs(op.clip.w-block.width)<1e-6&&Math.abs(op.clip.h-block.height)<1e-6,'o recorte é o retângulo do esquema, já escalado');
  assert.ok(op.w>0&&op.h>0,'a superfície tem área positiva no esquema');
  assert.throws(()=>layoutReport({...data,surface:{bounds:{minX:2,minY:0,maxX:1,maxY:1}}},{measure:fakeMeasure,imageSize:images}),/superfície da mina inválidos/);
});

test('schematic title comes from config and the grid is a faint white mesh at a fixed metre spacing',()=>{
  const images=key=>({width:testImages[key]?.width??1,height:testImages[key]?.height??1});
  const layout=layoutReport(data,{measure:fakeMeasure,imageSize:images});
  const texts=layout.ops.filter(op=>op.t==='text').map(op=>op.str);
  assert.ok(texts.includes(config.report.schematicTitle),'o título do esquema vem de report.schematicTitle');
  assert.ok(!texts.some(str=>str.includes('DISTÂNCIAS À ORIGEM')),'o título antigo saiu do esquema');
  const grid=config.report.schematicGrid;
  const mesh=layout.ops.filter(op=>op.t==='line'&&op.alpha===grid.opacity);
  // A espessura é escalada junto com o esquema; por isso só se confere que é positiva.
  assert.ok(mesh.length>0&&mesh.every(op=>op.color===grid.color&&op.lw>0),'a malha usa a cor e a opacidade da configuração, com espessura positiva');
  const verticals=mesh.filter(op=>op.x1===op.x2).map(op=>op.x1).sort((a,b)=>a-b);
  const horizontals=mesh.filter(op=>op.y1===op.y2).map(op=>op.y1).sort((a,b)=>a-b);
  assert.ok(verticals.length>=2&&horizontals.length>=2,'a malha tem linhas nos dois sentidos');
  const gaps=[...verticals.slice(1).map((x,i)=>x-verticals[i]),...horizontals.slice(1).map((y,i)=>y-horizontals[i])];
  assert.ok(gaps.every(g=>Math.abs(g-gaps[0])<1e-6),'espaçamento uniforme da malha');
  // A malha fica acima do fundo e abaixo dos pontos e rótulos.
  const background=layout.ops.findIndex(op=>op.t==='rect'&&op.fill===config.report.ink);
  const firstMesh=layout.ops.indexOf(mesh[0]);
  const firstPoint=layout.ops.findIndex(op=>op.t==='circle');
  assert.ok(background<firstMesh&&firstMesh<firstPoint,'a malha fica entre o fundo e os pontos');
});

test('schematic title and grid are required in config.json; invalid values are refused with the cause',()=>{
  const images=key=>({width:1,height:1});
  const run=report=>layoutReport({...data,config:{...config,report:{...config.report,...report}}},{measure:fakeMeasure,imageSize:images});
  assert.throws(()=>run({schematicTitle:''}),/schematicTitle/);
  assert.throws(()=>run({schematicGrid:undefined}),/schematicGrid/);
  assert.throws(()=>run({schematicGrid:{...config.report.schematicGrid,spacingMeters:0}}),/schematicGrid/);
  assert.throws(()=>run({schematicGrid:{...config.report.schematicGrid,opacity:1.5}}),/schematicGrid/);
});
