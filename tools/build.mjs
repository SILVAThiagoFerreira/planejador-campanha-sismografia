import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Hash the canonical LF representation so Windows checkouts and the Pages Linux
// runner produce the same stable manifest.
const raw=(await readFile('config.json','utf8')).replace(/\r\n/g,'\n');
const config=JSON.parse(raw);
if(config.schemaVersion!==1||config.communities.length!==7||!config.crs.length) throw Error('Configuração inválida.');
for(const c of config.communities) if(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)) throw Error('Comunidade inválida.');
await mkdir('vendor',{recursive:true}); await mkdir('data',{recursive:true});
for(const [from,to] of [['leaflet/dist/leaflet.js','leaflet.js'],['leaflet/dist/leaflet.css','leaflet.css'],['leaflet/dist/images','images'],['proj4/dist/proj4.js','proj4.js'],['jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js'],['leaflet/LICENSE','leaflet-LICENSE'],['proj4/LICENSE.md','proj4-LICENSE.md'],['jspdf/LICENSE','jspdf-LICENSE']]) await cp(`node_modules/${from}`,`vendor/${to}`,{recursive:true});
await writeFile('data/manifest.json',JSON.stringify({schemaVersion:1,version:config.version,configPath:'config.json',configSha256:createHash('sha256').update(raw).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({event:'build_completed',time:new Date().toISOString(),version:config.version}));
