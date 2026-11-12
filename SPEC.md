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

Área fechada é a polilinha marcada como fechada no DXF ou cujo último vértice coincide com o primeiro, dentro de `validation.closureToleranceMeters` (config.json, 0,001 m). Neste segundo caso o sistema registra aviso com a camada e usa a área sem o vértice repetido. Polilinha aberta (extremos afastados) vira linha de pré-corte, descrita na seção seguinte.

Lote: cada arquivo é validado separadamente. Os arquivos válidos são importados; os recusados aparecem no aviso com nome e causa e não alteram o projeto. Cada arquivo aceito é conferido contra o projeto já acumulado (região, raio e regras do cálculo): um arquivo que quebra o cálculo é recusado pelo nome e os demais seguem. Se nenhum arquivo for aceito, a importação é recusada. Avisos e recusas ficam no log (evento "import").

## Linhas de pré-corte — 2026-10-30

Polilinha aberta importada vira linha de pré-corte: vértices e comprimento, sem área, direção ou centróide. A linha entra no cálculo: os vértices das linhas compõem o menor círculo da origem, e a distância à borda de cada comunidade é a menor entre as áreas e as linhas. O comprimento mínimo vem de `validation.minLineLengthMeters` (config.json, 1 m). Linha abaixo do mínimo, com coordenadas inválidas ou com menos de dois vértices é recusada com a causa. Os vértices das linhas são conferidos contra a região configurada, como os das áreas. Um lote só com linhas é aceito sem cálculo, e o aviso pede ao menos uma área fechada. Lote ou projeto só com linhas é conferido do mesmo jeito contra a região, o comprimento mínimo e o limite total de vértices; a mensagem diz se a causa é uma área ou uma linha. O projeto JSON tem o campo `lines`; projetos anteriores sem o campo carregam com lista vazia. No mapa e no PNG, as linhas são tracejadas na cor `visual.mapColors.line`, com item na legenda. Quando a linha fica dentro da área ou sobre a borda, o efeito no cálculo é nulo, porque a menor distância já é a da borda da área.

## Monitoramento sismográfico — 2026-10-27

Nova seção abaixo do relatório: avanço do monitoramento (grade de dias por ponto), legenda, contagens do mês, tabela por comunidade e visão anual em diálogo. O mês atual e o ano atual são exibidos por padrão, com seletores de ano e mês e botões anterior/próximo.

Regras: célula "M" = ponto monitorado no dia; "D" sobre a coluna = dia com desmonte; "N" = dia fora do calendário do mês (não editável, cinza). Células em branco = não monitorado. Fins de semana não recebem destaque.

Fonte dos dados: Google Drive (apps-script/) quando `monitoring.apiUrl` está preenchida. Sem conexão ou sem `apiUrl`, a grade mostra a última cópia publicada (`data/monitoramento.json`) com o aviso neutro "Sem conexão com o Google Drive no momento — exibindo a última cópia publicada." Com dados ao vivo, nenhum aviso de fonte é exibido. A fonte é mostrada como "planilha de acompanhamento no Google Drive". A cópia publicada é um fallback explícito e sinalizado, não silencioso; o motivo técnico vai para o log.

Edição (2026-10-27): "Editar dados" abre um diálogo pequeno (até 360 px) com o fundo desfocado, com campos Usuário e Senha, botões Entrar e Cancelar, foco em Usuário, Enter para enviar e Esc para fechar. Entrar envia `{action:"auth"}` ao servidor e só então entra em modo de edição; a mensagem "Verificando…" aparece durante a checagem. Credenciais recusadas mostram "Usuário ou senha incorretos."; após 5 falhas em 10 minutos, o servidor responde "Muitas tentativas. Aguarde alguns minutos.". Sem `apiUrl`, o diálogo mostra "Edição indisponível no momento.". No modo de edição há um único botão primário "Salvar" (e "Cancelar"): Salvar grava com as credenciais da sessão, sem novo pedido de senha, mostra "Salvando…" e, ao concluir, um toast verde "Salvo no Google Drive." e relê os dados. Se o servidor recusar as credenciais (ex.: senha trocada), o diálogo de login volta a abrir mantendo o rascunho. Credenciais ficam só em uma variável em memória; nunca em localStorage. Cada abertura do diálogo começa com Usuário e Senha vazios e foco em Usuário (sem preencher o último usuário). Avisos e mensagens (inclusive "Edição ativa…") ficam em uma área de status abaixo da barra de controles, com altura reservada: a barra, o mês e os botões Editar/Salvar/Cancelar não mudam de posição em nenhum estado (view, edição, salvando, salvo, erro); Salvar e Cancelar apenas ficam ocultos fora da edição. Pontos sem nenhum monitoramento no mês aparecem com rótulo cinza (monitoring.colors.mutedPoint). Exportação: PDF do mês e PDF anual (uma página por mês e resumo), vetorial, A4 paisagem.

Importação: `npm run import:gantt -- "planilha.xlsx"` converte as abas de ano (AAAA) da planilha. Divergências de layout (março e agosto de 2025, rótulos deslocados e a linha sem rótulo; célula N ausente em fevereiro de 2025) são lidas pela posição e listadas em `anomalies` por mês; nada é corrigido em silêncio.

## Página e Gantt em PDF — 2026-11-06

Página: saíram os parágrafos de instrução e as legendas redundantes (painel de configuração, áreas, direção, monitoramento, mensagem, projeto, mapa, cenários, relatório, rodapé e carregamento). Ficam rótulos, títulos, estados vazios curtos, avisos de fonte e de conexão e todas as mensagens de validação. Saíram também a nota de direção de saída (azimute, sem modelo de propagação) e a nota de método dos cenários; o critério de cada cenário continua no cartão. O relatório exportado não muda.

PDF do Gantt (mês): uma página A4 paisagem sobre fundo branco. Faixa vermelha fina no topo; logotipo Enaex pequeno à esquerda (`monitoring.pdf.logoAsset`); título do mês em vermelho `#B5121B`, com subtítulo cinza. A grade usa só filetes finos e marcas em pílulas: D vermelho na linha de desmontes; M em cinza-grafite e N em cinza claro nas células. A legenda fica numa única linha abaixo da grade. Abaixo, à esquerda, os dois números do mês com traço vermelho de acento; à direita, a tabela por comunidade com filetes e total. Ano: uma página por mês e uma de resumo, com filetes horizontais e nomes de pontos quebrados em linhas no cabeçalho. Dados, textos e regras de célula (M, N, D) não mudam. Paleta da identidade Enaex, conforme VISUAL_STANDARD do hub: vermelho `#E20613` como acento e cinzas `#38424B`, `#4A4F55`, `#8A8F96`, `#E3E3E3`. Medidas, tamanhos, cores e caminho do logo vêm de `monitoring.pdf`; chave ausente, cor inválida ou logo inexistente interrompe a exportação ou o build com o caminho da chave.

## Exportação PNG 4K do Gantt — 2026-11-06

Escopo: além do PDF, o Gantt sai como imagem em alta resolução. Botões "Exportar mês (PNG 4K)" e "Exportar ano (PNG 4K)" na seção de monitoramento.

Formato: PNG RGB com fundo branco. Largura `monitoring.png.widthPx` (3840 px), que não pode ser menor que `monitoring.png.minWidthPx` (3840 px, mínimo da exigência 4K). Altura = largura × proporção da página A4 paisagem do layout (2715 px para 3840 px de largura). Proporção, layout, cores, textos e dados são os mesmos do PDF.

Renderização: vetorial em canvas. A mesma lista de operações do PDF (src/monitoringGantt.js) é desenhada direto na resolução final; nenhuma imagem pequena é ampliada. O logotipo é a cópia já existente em `assets/enaex-brasil.png` (400 px), reduzida para o tamanho do layout. Métricas de texto vêm do jsPDF (Arial e Helvetica têm as mesmas medidas), então o PNG e o PDF quebram linhas e posicionam textos igual.

Arquivos: mês gera um PNG `monitoramento-AAAA-MM-4k.png`. Ano gera um ZIP `monitoramento-AAAA-anual-4k.zip` com os 12 PNG mensais (`monitoramento-AAAA-MM-4k.png`) e o resumo (`monitoramento-AAAA-resumo-4k.png`). O ZIP usa JSZip já vendorizado (vendor/jszip.min.js, também usado pelo DOCX): nenhuma dependência nova.

Validação: o build recusa `monitoring.png` com `widthPx` menor que `minWidthPx`, e a exportação recusa o mesmo caso antes de renderizar. Logo ou fonte ausentes interrompem a exportação com o caminho da chave.

## Relatório de apresentação do monitoramento — 2026-11-06

Escopo: botão "Gerar relatório (PDF)" na seção de monitoramento. Gera um PDF de apresentação no modelo da referência `RT - DESVIOS DE PERFURAÇÃO - PC56B (2).pdf` (14 páginas, jsPDF 2.5.1), com as informações que o dashboard exibe para o período dos filtros ativos. O arquivo não é versionado com a referência; as medidas abaixo foram lidas do PDF vetorial e as cores amostradas do desenho.

### Sistema visual da referência

Medidas em pontos (pt), página paisagem.

| Elemento | Especificação extraída |
|---|---|
| Página | 960,094 × 613,984 pt, paisagem. Não há capa separada: a página 1 traz título, identificação e indicadores. |
| Margens | 32,6 pt à esquerda e à direita; conteúdo de 32,6 a 927,5 pt. |
| Cabeçalho | título em caixa alta, Helvetica regular 20 pt, `#B5121B`, linha de base 56,7 pt. Subtítulo Helvetica 10 pt, `#4A4A4A`, linha de base 76,5 pt. Sem filete sob o cabeçalho. |
| Logotipos | dois no canto superior direito, altura 34 pt, topo 25,5 pt, alinhados à margem direita e separados por 22,7 pt: cliente (Mineração Vale Verde) à esquerda e Enaex Brasil à direita. Aparecem em todas as páginas. |
| Rodapé | filete `#3D4045` de 1 pt em y = 580 pt. Texto Helvetica 6,5 pt, `#4A4A4A`, alinhado à direita, linha de base 594,1 pt. Não há numeração de página. |
| Grade | blocos alinhados à margem. Indicadores em 5 colunas de 181,25 pt com recuo de 11,3 pt. |
| Título de seção | Helvetica regular 11 pt, `#3C3F44` (ex.: "Conformidade por parâmetro"). |
| Indicador (KPI) | sem caixa e sem sombra. Rótulo Helvetica 9 pt `#4A4A4A`; valor Helvetica-Bold 22 pt, grafite, ou vermelho quando fora da meta; observação Helvetica 8 pt `#4A4A4A` abaixo do valor. |
| Tabela | sem bordas verticais e sem zebra. Cabeçalho Helvetica-Bold 7,5 a 8 pt `#8A8F96` com filete `#E5E6E5` de 0,71 pt. Corpo 8 a 9,5 pt `#3C3F44`; números centralizados; valor fora da meta em Helvetica-Bold `#B5121B`. |
| Gráficos | imagens em fundo branco, grade muito clara, rótulos de eixo cinza 8 a 9 pt, valores dentro das barras em branco negrito, linha de meta tracejada vermelha de 1,7 pt. |
| Cores | `#B5121B` (título e alerta), `#E30512` (dados em vermelho), `#3C3F44` (texto e barras), `#4A4A4A` (texto secundário), `#8A8F96` (rótulos), `#E5E6E5` (filetes), `#3D4045` (filete do rodapé). |
| Geometria | cantos retos, sem sombra, sem gradiente. |

Adaptações documentadas:
- Rodapé traduzido para o português: "ESTRITAMENTE PRIVADO E CONFIDENCIAL" (`monitoring.report.labels.footer`).
- Dois logotipos, como na referência. Isso excede a regra do VISUAL_STANDARD ("logo uma vez por página") porque o pedido é reproduzir o modelo; a exceção fica registrada aqui.
- O dashboard não tem gráficos além da grade do Gantt, então o relatório não cria gráficos novos. A grade segue a geometria e as cores acima.

### Filtros e conteúdo

Filtros: ano e mês da seção de monitoramento. O dashboard não tem filtro de pontos; o relatório usa os 7 pontos cadastrados e a capa informa "Todos os 7 pontos cadastrados". Se o filtro de pontos for criado, a capa e as tabelas devem ser alterados junto.

Recusas: sem leitura de dados (fonte `error`) o relatório não é gerado; edição com alterações pendentes bloqueia a exportação, como nos PDFs existentes.

Páginas (3):
1. **Capa e resumo.** Título "MONITORAMENTO SISMOGRÁFICO - OUTUBRO 2026"; subtítulo `monitoring.subtitle`. Faixa de filtros com rótulo e valor: Período (mês e ano), Pontos, Fonte (planilha no Google Drive ou última cópia publicada) e Emitido em (data e hora da geração). Seis indicadores em duas linhas de três: no mês, desmontes, monitoramentos e pontos sem monitoramento (vermelho quando maior que zero); no ano, desmontes, monitoramentos e meses com registro (de 12). Tabela "Monitoramentos por comunidade": ponto, coluna do mês, coluna do ano e linha Total.
2. **Grade de monitoramento.** Título "GRADE DE MONITORAMENTO - OUTUBRO 2026". Linha D (dias com desmonte) e uma linha por ponto com os dias 1 a 31: M (monitorado) e N (fora do calendário do mês); células em branco não monitoradas. Legenda em uma linha. Aviso quando o mês não tem registro na planilha.
3. **Resumo anual.** Título "RESUMO ANUAL - 2026". Tabela com um mês por linha (desmontes, monitoramentos e cada ponto) e linha Total. O mês do relatório aparece em negrito e vermelho. Nota com os meses sem registro na planilha.

Nome do arquivo: `relatorio-monitoramento-{ano}-{mês}.pdf` (`monitoring.report.fileName`).

Formato: PDF vetorial. Títulos, textos, filetes e a grade são vetores e pesquisáveis; apenas os logotipos são imagens. Fonte Helvetica (`monitoring.report.fontFamily`). Caracteres fora de WinAnsi viram "?" somente no PDF.

Configuração e validação: bloco `monitoring.report` em config.json (página, margens, logotipos, cores, tamanhos, medidas em pt, rótulos e nome do arquivo). A validação fica em `src/monitoringReportConfig.js` e é usada pelo build (`tools/build.mjs`) e pela exportação. Chave ausente, cor inválida ou logotipo inexistente interrompe com o caminho da chave; não há valor padrão silencioso.

Módulos: `src/monitoringReportPdf.js` monta as páginas como lista de operações de desenho (mesma base do Gantt) e gera o jsPDF. Reutiliza `painter` e `measureWith` de `src/monitoringGantt.js`, `drawOpsPdf` de `src/monitoringPdf.js` e `monthView`, `monthSummary` e `cellState` de `src/monitoringData.js`. Os dados são os mesmos do dashboard; o relatório não grava nada.

Testes: `tests/monitoringReport.test.js` (configuração, páginas, contagens, filtros, limites da página e nome do arquivo).

## Renomear áreas importadas e limpeza da página — 2026-11-12

Renomear: cada área e cada linha de pré-corte importada tem um campo com o nome na lista de "Áreas de desmonte". O usuário digita o nome que quiser; o nome é aparado nas pontas e confirmado ao sair do campo ou com Enter. Nome vazio ou com mais de `validation.maxLabelLength` caracteres (100, config.json) é recusado com a causa e o campo volta ao nome anterior; nada é gravado. O nome novo vai para a lista de direções do relatório (prévia, PDF, DOCX e PNG), para o tooltip do mapa e para o projeto salvo. O TXT do WhatsApp não lista áreas. Renomear não altera geometria nem cálculo. Projeto importado com nome vazio ou acima do limite é recusado, com a posição da área ou linha (ex.: "Nome de área 2 inválido"); nomes válidos são carregados aparados. A regra fica em src/areaNames.js (`validateAreaName`), usada pela tela e pela validação do projeto.

Página: saíram o rodapé "Enaex Brasil · Planejador de Campanha de Sismografia", os rótulos de seção "Situação espacial do desmonte", "Comparação de alternativas", "Documento da campanha" e "Monitoramento sismográfico", o título "Três cenários. Uma campanha." (agora "Cenários"), a frase de data da imagem de satélite e a frase do modo vetorial (o status do mapa fica oculto quando vazio; falhas de satélite continuam visíveis), a frase "Combinação definida pelo critério." dos cartões (a linha "Mesmos pontos do cenário ..." só aparece quando há coincidência) e a explicação "Incluir em todos os cenários" repetida em cada comunidade (fica no título do rótulo e para o leitor de tela). Mantidos: rótulo "Configuração da campanha", avisos de fonte e de conexão, mensagens de validação, legenda do mapa e atribuição do Esri no controle do Leaflet.

Relatórios não mudaram: PDF, DOCX, PNG e TXT do planejador, prévia do relatório, PDF/PNG do Gantt e relatório de apresentação continuam com o mesmo layout. Os rótulos do monitoramento que também saem nas exportações (`monitoring.labels` em config.json) não foram alterados.

Versões de cache: app.js 1.6.0 e styles.css 1.3.5; project.js, map.js e areaNames.js 1.3.7.

## Direções no relatório sem corte — 2026-11-12

Nome de área no bloco "Direcionamento informado" aparece inteiro. Antes era cortado em 39 caracteres com reticências (valor fixo no código, fora de config.json). Agora o nome quebra em linhas dentro da coluna do relatório, como os demais textos. Limitação: uma palavra sem espaços mais larga que a coluna não quebra e pode passar da margem.

O bloco mostra até `report.maxDirectionRows` áreas (config.json, 4). A ausência desse valor, ou um valor que não seja inteiro maior que zero, recusa o relatório com a causa; não há mais valor padrão no código. Quando há mais áreas, a última linha diz "+ N áreas. Relação completa de direções no projeto JSON." (o texto antigo citava a mensagem TXT, que no modelo padrão não lista áreas). O modelo do WhatsApp lista áreas apenas se o usuário incluir o campo `{areas}`.

Valem para prévia, PDF, DOCX e PNG. Testes: tests/reports.test.js (nome longo inteiro, resumo com o projeto JSON, limite ausente recusado).

Versões de cache: reportLayout.js, reportPdf.js e reports.js em 1.3.7 (reports.js 1.2.1 e docx.js 1.2.1 nas importações); app.js 1.6.2.

## Responsável no rodapé à direita — 2026-11-12

O nome do responsável pelo monitoramento no rodapé escuro do relatório fica alinhado à direita, na margem direita do relatório (`report.margin`). Antes ficava à esquerda, ao lado do logotipo. O layout usa `textRight` (src/reportLayout.js), que quebra linhas do mesmo jeito que `text()`. Vale para prévia, PNG, DOCX e PDF. Teste em tests/reports.test.js (termina na margem direita).

Versões de cache: reportLayout.js, reportPdf.js e reports.js em 1.3.8 (reports.js e docx.js em 1.2.2 nas importações); app.js 1.6.3.
