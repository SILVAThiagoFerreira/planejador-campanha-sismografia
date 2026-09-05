import {validatePolygons,validateCommunities} from './validation.js';
export function validateProject(value,config){
  if(!value||value.schemaVersion!==1) throw Error('Versão do arquivo de projeto não suportada.');
  if(!config.crs.some(c=>c.id===value.crs)) throw Error('Sistema de coordenadas desconhecido.');
  if(!Array.isArray(value.communities)||value.communities.length!==config.communities.length) throw Error('O projeto deve conter as sete comunidades cadastradas.');
  const ids=new Set(config.communities.map(c=>c.id));
  for(const c of value.communities){if(!ids.has(c.id)||typeof c.enabled!=='boolean')throw Error('Cadastro de comunidade inválido.');if(c.name.length>config.validation.maxLabelLength)throw Error('Nome de comunidade muito longo.');}
  validateCommunities(value.communities,1);
  const enabled=value.communities.filter(c=>c.enabled);
  validateCommunities(enabled,value.instrumentCount);
  if(!Array.isArray(value.polygons))throw Error('Geometrias do projeto inválidas.');
  if(value.polygons.length)validatePolygons(value.polygons,config.validation);
  for(const p of value.polygons)if(typeof p.name!=='string'||p.name.length>config.validation.maxLabelLength)throw Error('Nome da área inválido.');
  if(!value.meta||!/^\d{4}-\d{2}-\d{2}$/.test(value.meta.date))throw Error('Data do projeto inválida.');
  const date=new Date(`${value.meta.date}T12:00:00Z`);if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value.meta.date)throw Error('Data do projeto inválida.');
  for(const key of ['blastName','operation','responsible','time','notes'])if(typeof value.meta[key]!=='string')throw Error(`Campo ${key} inválido.`);
  if(value.meta.notes.length>config.validation.maxNotesLength)throw Error('Observação excede o limite de caracteres.');
  if(typeof value.messageTemplate!=='string'||value.messageTemplate.length>10000)throw Error('Modelo de mensagem inválido.');
  if(![1,2,3].includes(value.selectedScenario))throw Error('Cenário do projeto inválido.');
  return structuredClone(value);
}
