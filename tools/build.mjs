import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateMonitoringData} from '../src/monitoringData.js';
// Hash the canonical LF representation so Windows checkouts and the Pages Linux
// runner produce the same stable manifest.
const raw=(await readFile('config.json','utf8')).replace(/\r\n/g,'\n');
const config=JSON.parse(raw);
if(config.schemaVersion!==1||config.communities.length!==7||!config.crs.length) throw Error('Configuração inválida.');
for(const c of config.communities) if(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)) throw Error('Comunidade inválida.');
const monitoring=config.monitoring;
if(!monitoring||monitoring.points.length!==7||new Set(monitoring.points).size!==7||monitoring.monthNames.length!==12||!monitoring.api?.saveAction||!monitoring.api?.authAction) throw Error('Configuração de monitoramento inválida.');
// Textos exibidos ao usuário ficam em monitoring.ui; nenhum pode faltar ou estar vazio.
for(const key of ['sourceText','offlineNotice','loadFailedNotice','editHint','loginTitle','loginHint','loginButton','editUnavailable','verifying','saveButton','saving','savedToast','saveFailed','cancelled']) {
  if(typeof monitoring.ui?.[key]!=='string'||!monitoring.ui[key].trim()) throw Error(`Texto monitoring.ui.${key} ausente em config.json.`);
}
// O snapshot do monitoramento, quando existir, precisa atender ao contrato da aplicação.
if(existsSync(monitoring.snapshotPath)){validateMonitoringData(JSON.parse(await readFile(monitoring.snapshotPath,'utf8')),monitoring);}
await mkdir('vendor',{recursive:true}); await mkdir('data',{recursive:true});
for(const [from,to] of [['leaflet/dist/leaflet.js','leaflet.js'],['leaflet/dist/leaflet.css','leaflet.css'],['leaflet/dist/images','images'],['proj4/dist/proj4.js','proj4.js'],['jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js'],['leaflet/LICENSE','leaflet-LICENSE'],['proj4/LICENSE.md','proj4-LICENSE.md'],['jspdf/LICENSE','jspdf-LICENSE']]) await cp(`node_modules/${from}`,`vendor/${to}`,{recursive:true});
await cp('node_modules/jszip/dist/jszip.min.js','vendor/jszip.min.js');
await cp('node_modules/jszip/LICENSE.markdown','vendor/jszip-LICENSE.markdown');
await writeFile('data/manifest.json',JSON.stringify({schemaVersion:1,version:config.version,configPath:'config.json',configSha256:createHash('sha256').update(raw).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({event:'build_completed',time:new Date().toISOString(),version:config.version}));
