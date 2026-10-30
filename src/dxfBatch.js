import { parseDXF } from './dxf.js?v=1.3.5';
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
      accepted.push({name:file.name,polygons:result.polygons,warnings:result.warnings});
    }catch(error){
      refused.push({name:file.name,reason:error.message});
    }
  }
  return {accepted,refused};
}
// Confere cada arquivo aceito contra o projeto já acumulado. "check" lança erro quando o plano não fecha
// (ex.: área fora da região). O arquivo que quebra o plano é recusado pelo nome; os demais seguem.
export function acceptIntoProject(accepted,currentPolygons,toPolygons,check){
  let polygons=currentPolygons;
  const imported=[],refused=[];
  for(const file of accepted){
    const candidate=[...polygons,...toPolygons(file)];
    try{
      check(candidate);
      polygons=candidate;
      imported.push(file);
    }catch(error){
      refused.push({name:file.name,reason:error.message});
    }
  }
  return {polygons,imported,refused};
}
