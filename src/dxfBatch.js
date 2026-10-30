import { parseDXF } from './dxf.js?v=1.3.4';
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
