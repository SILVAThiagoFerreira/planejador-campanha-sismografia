# Especificação

Entrada DXF ASCII: polilinhas fechadas LWPOLYLINE e POLYLINE com segmentos retos, coordenadas UTM em metros. Entidades não suportadas, áreas degeneradas, geometrias abertas, autointerseções e coordenadas inválidas devem ser informadas, nunca substituídas silenciosamente. Importações múltiplas acumulam áreas validadas. Dados inválidos não alteram o último projeto válido.

Origem: centro do menor círculo envolvente de todos os vértices das poligonais. Distâncias são planimétricas em metros, tanto da origem quanto da borda mais próxima. Cenários usam quantidade inteira exata de instrumentos dentro do conjunto de pontos habilitados. Estratégias: proximidade, direção informada por área e cobertura espacial. Cenários podem coincidir quando o conjunto ou os critérios não permitem alternativas; isto deve ser indicado.

Cada ponto habilitado pode ser marcado como ponto fixo. Um ponto fixo deve integrar os três cenários e consumir uma posição da quantidade total de sismógrafos; cada estratégia seleciona apenas as posições restantes. A quantidade de pontos fixos não pode ultrapassar a quantidade de instrumentos. Desabilitar um ponto também remove sua condição fixa.

Direção de saída é informação do usuário, não modelo de propagação, velocidade, PPV ou conformidade normativa. Ausência de direção gera aviso. Cadastro original tem sete comunidades; usuário pode ajustar coordenadas e disponibilidade. Coordenadas geográficas devem ser válidas e as áreas devem estar na região configurada.

PDF e PNG reproduzem o relatório de referência: cabeçalho/faixa Enaex grafite, títulos vermelhos, tabelas de origem e pontos, mapa e esquema de distâncias. Incluem cenário, SRC, metodologia e observações. TXT permite personalização e não envia mensagens. Projeto JSON preserva parâmetros e geometrias; importação valida antes de aplicar. Logs auditam processamento e exportações sem transmissão externa.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.

## PDF com texto vetorial — 2026-10-26

O PDF é montado com jsPDF a partir do mesmo layout usado na prévia (src/reportLayout.js). Títulos, parágrafos, tabelas, fios e o esquema de distâncias são texto e desenho vetoriais, portanto selecionáveis e pesquisáveis. Apenas a faixa de identidade, o logotipo do rodapé e o mapa de satélite são imagens. Coordenadas UTM (Norte/Leste) são exibidas sem separador de milhar (ex.: 8930441,2703 m); distâncias e demais quantidades mantêm o separador de milhar. Caracteres fora de WinAnsi são substituídos por "?" somente no PDF. A fonte padrão do PDF é definida em config.json (report.pdfFontFamily).


## Importação DXF por arquivo — 2026-10-30

Área fechada é a polilinha marcada como fechada no DXF ou cujo último vértice coincide com o primeiro, dentro de `validation.closureToleranceMeters` (config.json, 0,001 m). Neste segundo caso o sistema registra aviso com a camada e usa a área sem o vértice repetido. Polilinha aberta (extremos afastados) é recusada com a camada e a distância entre os extremos. Linhas abertas, como pré-corte, não são áreas e não entram no cálculo.

Lote: cada arquivo é validado separadamente. Os arquivos válidos são importados; os recusados aparecem no aviso com nome e causa e não alteram o projeto. Se nenhum arquivo for aceito, a importação é recusada. Avisos e recusas ficam no log (evento "import").

## Monitoramento sismográfico — 2026-10-27

Nova seção abaixo do relatório: avanço do monitoramento (grade de dias por ponto), legenda, contagens do mês, tabela por comunidade e visão anual em diálogo. O mês atual e o ano atual são exibidos por padrão, com seletores de ano e mês e botões anterior/próximo.

Regras: célula "M" = ponto monitorado no dia; "D" sobre a coluna = dia com desmonte; "N" = dia fora do calendário do mês (não editável, cinza). Células em branco = não monitorado. Fins de semana não recebem destaque.

Fonte dos dados: Google Drive (apps-script/) quando `monitoring.apiUrl` está preenchida. Sem conexão ou sem `apiUrl`, a grade mostra a última cópia publicada (`data/monitoramento.json`) com o aviso neutro "Sem conexão com o Google Drive no momento — exibindo a última cópia publicada." Com dados ao vivo, nenhum aviso de fonte é exibido. A fonte é mostrada como "planilha de acompanhamento no Google Drive". A cópia publicada é um fallback explícito e sinalizado, não silencioso; o motivo técnico vai para o log.

Edição (2026-10-27): "Editar dados" abre um diálogo pequeno (até 360 px) com o fundo desfocado, com campos Usuário e Senha, botões Entrar e Cancelar, foco em Usuário, Enter para enviar e Esc para fechar. Entrar envia `{action:"auth"}` ao servidor e só então entra em modo de edição; a mensagem "Verificando…" aparece durante a checagem. Credenciais recusadas mostram "Usuário ou senha incorretos."; após 5 falhas em 10 minutos, o servidor responde "Muitas tentativas. Aguarde alguns minutos.". Sem `apiUrl`, o diálogo mostra "Edição indisponível no momento.". No modo de edição há um único botão primário "Salvar" (e "Cancelar"): Salvar grava com as credenciais da sessão, sem novo pedido de senha, mostra "Salvando…" e, ao concluir, um toast verde "Salvo no Google Drive." e relê os dados. Se o servidor recusar as credenciais (ex.: senha trocada), o diálogo de login volta a abrir mantendo o rascunho. Credenciais ficam só em uma variável em memória; nunca em localStorage. Cada abertura do diálogo começa com Usuário e Senha vazios e foco em Usuário (sem preencher o último usuário). Avisos e mensagens (inclusive "Edição ativa…") ficam em uma área de status abaixo da barra de controles, com altura reservada: a barra, o mês e os botões Editar/Salvar/Cancelar não mudam de posição em nenhum estado (view, edição, salvando, salvo, erro); Salvar e Cancelar apenas ficam ocultos fora da edição. Pontos sem nenhum monitoramento no mês aparecem com rótulo cinza (monitoring.colors.mutedPoint). Exportação: PDF do mês e PDF anual (uma página por mês e resumo), vetorial, A4 paisagem.

Importação: `npm run import:gantt -- "planilha.xlsx"` converte as abas de ano (AAAA) da planilha. Divergências de layout (março e agosto de 2025, rótulos deslocados e a linha sem rótulo; célula N ausente em fevereiro de 2025) são lidas pela posição e listadas em `anomalies` por mês; nada é corrigido em silêncio.
