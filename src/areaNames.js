// Nome de área ou linha de pré-corte editado pelo usuário na lista de importação.
// Mesma regra para a tela e para a validação do projeto: sem vazio, sem espaços nas pontas e
// no máximo `maxLength` caracteres (config.validation.maxLabelLength). Nome inválido é recusado
// com a causa; nunca é cortado nem trocado em silêncio.
export function validateAreaName(value,maxLength){
  if(!Number.isInteger(maxLength)||maxLength<1)throw Error('Limite de nome ausente ou inválido na configuração.');
  const name=typeof value==='string'?value.trim():'';
  if(!name)return {ok:false,name:'',error:'O nome não pode ficar vazio.'};
  if(name.length>maxLength)return {ok:false,name,error:`O nome deve ter no máximo ${maxLength} caracteres.`};
  return {ok:true,name,error:''};
}
