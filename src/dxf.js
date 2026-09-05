import { validatePolygons } from './validation.js';
export function parseDXF(text,limits={}){
  if(typeof text!=='string'||text.includes('AutoCAD Binary DXF'))throw new Error('Utilize DXF ASCII. DXF binário não é suportado.');
  if(limits.maxFileBytes&&new TextEncoder().encode(text).byteLength>limits.maxFileBytes)throw new Error(`Arquivo DXF excede ${limits.maxFileBytes} bytes.`);
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');while(lines.length&&lines.at(-1).trim()==='')lines.pop();
  if(lines.length%2)throw new Error('DXF truncado: pares de códigos incompletos.');
  const pairs=[];for(let i=0;i<lines.length;i+=2){if(!/^\s*\d+\s*$/.test(lines[i]))throw new Error(`Código DXF inválido na linha ${i+1}.`);pairs.push([Number(lines[i]),lines[i+1].trim()]);}
  const entities=[];let section='',record=null;
  for(let i=0;i<pairs.length;i++){const [code,value]=pairs[i];if(code===0&&value==='SECTION'){section=pairs[i+1]?.[1];record=null;continue;}if(code===0&&value==='ENDSEC'){section='';record=null;continue;}if(section!=='ENTITIES')continue;if(code===0){record={type:value,pairs:[]};entities.push(record);}else if(record)record.pairs.push([code,value]);}
  if(!pairs.some(([c,v])=>c===0&&v==='EOF'))throw new Error('DXF sem marcador EOF; arquivo incompleto.');
  const polygons=[],ignored=new Set();
  const get=(e,c,fallback)=>e.pairs.find(p=>p[0]===c)?.[1]??fallback;
  const number=(e,c,fallback)=>{const raw=get(e,c,fallback);const n=Number(raw);if(raw===undefined||raw===''||!Number.isFinite(n))throw new Error(`Coordenada/código ${c} inválido em ${e.type}.`);return n;};
  for(let i=0;i<entities.length;i++){
    const e=entities[i];if(!['LWPOLYLINE','POLYLINE'].includes(e.type)){if(['ARC','CIRCLE','ELLIPSE','SPLINE','INSERT'].includes(e.type))throw new Error(`Entidade ${e.type} não suportada. Converta as áreas em polilinhas fechadas sem arcos e exploda blocos.`);if(!['SEQEND','VERTEX'].includes(e.type))ignored.add(e.type);continue;}
    const flags=number(e,70,0);if(!Number.isInteger(flags)||flags<0)throw new Error('Flags de polilinha DXF inválidas.');if(!(flags&1))throw new Error(`Polilinha aberta na camada ${get(e,8,'0')}. Feche a área no CAD.`);
    if(flags&(2|4|16|64))throw new Error('Polilinha ajustada, malha ou polyface não suportada.');
    if(number(e,210,0)!==0||number(e,220,0)!==0||number(e,230,1)!==1)throw new Error('Sistema OCS inclinado não suportado. Exporte as polilinhas no plano XY.');
    let vertices=[];
    if(e.type==='LWPOLYLINE'){
      let current=null;for(const [code,value]of e.pairs){if((code===10||code===20)&&value==='')throw new Error('DXF contém coordenada vazia.');if(code===10){current={x:Number(value),y:NaN};vertices.push(current);}if(code===20){if(!current)throw new Error('DXF inválido: Y sem X.');current.y=Number(value);}if(code===42&&Number(value)!==0)throw new Error('Polilinha com arco (bulge) não suportada. Converta o arco em segmentos.');}
      if(number(e,90)!==vertices.length)throw new Error('Contagem de vértices DXF inconsistente.');
    }else{
      while(entities[i+1]?.type==='VERTEX'){const v=entities[++i];if(number(v,42,0)!==0)throw new Error('Polilinha com arco não suportada.');vertices.push({x:number(v,10),y:number(v,20)});}
      if(entities[i+1]?.type!=='SEQEND')throw new Error('POLYLINE sem SEQEND.');i++;
    }
    if(vertices.length>1&&vertices[0].x===vertices.at(-1).x&&vertices[0].y===vertices.at(-1).y)vertices.pop();
    const layer=get(e,8,'0');polygons.push({id:`area-${polygons.length+1}`,name:`${layer==='0'?'Área':layer} ${polygons.length+1}`,layer,vertices,direction:null});
  }
  validatePolygons(polygons,limits);
  return {polygons,warnings:ignored.size?[`Entidades auxiliares ignoradas: ${[...ignored].join(', ')}. Somente polilinhas fechadas compõem as áreas.`]:[]};
}
