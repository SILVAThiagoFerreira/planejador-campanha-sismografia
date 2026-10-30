import { parseDXF } from './dxf.js?v=1.3.6';
// Importa um lote de arquivos DXF arquivo a arquivo. Cada arquivo válido vai para "accepted";
// cada arquivo recusado vai para "refused" com a causa. Quem chama aplica apenas os aceitos,
// assim um arquivo recusado nunca altera o projeto nem some sem explicação.
export async function parseDXFBatch(files,limits){
  const accepted=[],refused=[];
  for(const file of files){
    try{
      if(!/\.dxf$/i.test(file.name))throw new Error('não é um arquivo DXF.');
      if(limits.maxFileBytes&&file.size>limits.maxFileBytes)throw new Error(`acima do limite de ${limits.maxFileBytes/1e6} MB.`);
      const result=parseDXF(await file.text(),limits);
      accepted.push({name:file.name,polygons:result.polygons,lines:result.lines,warnings:result.warnings});
    }catch(error){
      refused.push({name:file.name,reason:error.message});
    }
  }
  return {accepted,refused};
}
// Confere cada arquivo aceito contra o projeto já acumulado. "check" lança erro quando o plano não fecha
// (ex.: área fora da região). O arquivo que quebra o plano é recusado pelo nome; os demais seguem.
// "current" e o resultado têm a forma {polygons, lines}.
export function acceptIntoProject(accepted,current,toAdditions,check){
  let project={polygons:current.polygons,lines:current.lines};
  const imported=[],refused=[];
  for(const file of accepted){
    const additions=toAdditions(file);
    const candidate={polygons:[...project.polygons,...additions.polygons],lines:[...project.lines,...additions.lines]};
    try{
      check(candidate);
      project=candidate;
      imported.push(file);
    }catch(error){
      refused.push({name:file.name,reason:error.message});
    }
  }
  return {project,imported,refused};
}
