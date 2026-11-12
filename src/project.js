import {validatePolygons,validateLines,validateCommunities} from './validation.js?v=1.3.6';
import {validateAreaName} from './areaNames.js?v=1.3.8';
export function validateProject(value,config){
  if(!value||value.schemaVersion!==1) throw Error('Versão do arquivo de projeto não suportada.');
  if(!config.crs.some(c=>c.id===value.crs)) throw Error('Sistema de coordenadas desconhecido.');
  if(!Array.isArray(value.communities)||value.communities.length!==config.communities.length) throw Error('O projeto deve conter as sete comunidades cadastradas.');
  const ids=new Set(config.communities.map(c=>c.id));
  for(const c of value.communities){if(!ids.has(c.id)||typeof c.enabled!=='boolean'||(c.fixed!==undefined&&typeof c.fixed!=='boolean'))throw Error('Cadastro de comunidade inválido.');if(c.fixed===true&&c.enabled===false)throw Error('Um ponto fixo também deve estar habilitado.');if(c.name.length>config.validation.maxLabelLength)throw Error('Nome de comunidade muito longo.');}
  validateCommunities(value.communities,value.communities.length);
  const enabled=value.communities.filter(c=>c.enabled);
  validateCommunities(enabled,value.instrumentCount);
  if(!Array.isArray(value.polygons))throw Error('Geometrias do projeto inválidas.');
  if(value.polygons.length)validatePolygons(value.polygons,config.validation);
  // Projetos salvos antes das linhas de pré-corte não têm o campo "lines": nesse caso não há linhas.
  const lines=value.lines===undefined?[]:value.lines;
  validateLines(lines,config.validation);
  const checkNames=(items,kind)=>items.forEach((p,i)=>{if(typeof p.name!=='string')throw Error(`Nome de ${kind} ${i+1} inválido.`);const named=validateAreaName(p.name,config.validation.maxLabelLength);if(!named.ok)throw Error(`Nome de ${kind} ${i+1} inválido. ${named.error}`);});
  checkNames(value.polygons,'área');checkNames(lines,'linha');
  if(!value.meta||!/^\d{4}-\d{2}-\d{2}$/.test(value.meta.date))throw Error('Data do projeto inválida.');
  const date=new Date(`${value.meta.date}T12:00:00Z`);if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value.meta.date)throw Error('Data do projeto inválida.');
  for(const key of ['blastName','operation','responsible','time','notes'])if(typeof value.meta[key]!=='string')throw Error(`Campo ${key} inválido.`);
  if(value.meta.notes.length>config.validation.maxNotesLength)throw Error('Observação excede o limite de caracteres.');
  if(typeof value.messageTemplate!=='string'||value.messageTemplate.length>10000)throw Error('Modelo de mensagem inválido.');
  if(![1,2,3].includes(value.selectedScenario))throw Error('Cenário do projeto inválido.');
  const validated=structuredClone(value);
  validated.lines=structuredClone(lines);
  for(const p of [...validated.polygons,...validated.lines])p.name=validateAreaName(p.name,config.validation.maxLabelLength).name;
  for(const community of validated.communities)community.fixed=community.fixed===true;
  return validated;
}
