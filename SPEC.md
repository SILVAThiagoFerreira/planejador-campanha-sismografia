# Especificação

Entrada DXF ASCII: polilinhas fechadas LWPOLYLINE e POLYLINE com segmentos retos, coordenadas UTM em metros. Entidades não suportadas, áreas degeneradas, geometrias abertas, autointerseções e coordenadas inválidas devem ser informadas, nunca substituídas silenciosamente. Importações múltiplas acumulam áreas validadas. Dados inválidos não alteram o último projeto válido.

Origem: centro do menor círculo envolvente de todos os vértices das poligonais. Distâncias são planimétricas em metros, tanto da origem quanto da borda mais próxima. Cenários usam quantidade inteira exata de instrumentos dentro do conjunto de pontos habilitados. Estratégias: proximidade, direção informada por área e cobertura espacial. Cenários podem coincidir quando o conjunto ou os critérios não permitem alternativas; isto deve ser indicado.

Direção de saída é informação do usuário, não modelo de propagação, velocidade, PPV ou conformidade normativa. Ausência de direção gera aviso. Cadastro original tem sete comunidades; usuário pode ajustar coordenadas e disponibilidade. Coordenadas geográficas devem ser válidas e as áreas devem estar na região configurada.

PDF e PNG reproduzem o relatório de referência: cabeçalho/faixa Enaex grafite, títulos vermelhos, tabelas de origem e pontos, mapa e esquema de distâncias. Incluem cenário, SRC, metodologia e observações. TXT permite personalização e não envia mensagens. Projeto JSON preserva parâmetros e geometrias; importação valida antes de aplicar. Logs auditam processamento e exportações sem transmissão externa.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.
