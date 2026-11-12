# Entrega

Construir aplicação independente no navegador com visual do Aviso de Desmonte, sete comunidades fornecidas, importação de múltiplas áreas DXF, direção por área, quantidade de sismógrafos, três cenários explicados, mapa e relatórios DOCX/PDF/PNG/TXT. Publicar no GitHub Pages após testes de geometria, validação de exportação e inspeção visual desktop/mobile.

Permitir marcar pontos habilitados como fixos, garantindo sua inclusão nos três cenários e sua persistência no projeto sem alterar a quantidade total de instrumentos.

Configuração centralizada em config.json. Arquitetura modular: leitura DXF, validação, geometria, planejamento, mapa, relatórios, logs e controlador. Bibliotecas locais versionadas justificadas no README. Não modificar ferramentas vizinhas nem arquivos originais de referência.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.

Logo da aplicação atualizado com VISUAL/logo.png fornecido pelo usuário, copiado sem alteração para assets/planejador-logo.png. Aplicado ao cabeçalho, carregamento, favicon e ícone Apple; caminho visual.logo no config.json.

## Ajuste do bloco de situação — relatório PDF

Esquema de distâncias e mapa de satélite da seção "SITUAÇÃO ESPACIAL DO DESMONTE" ocupam o mesmo retângulo: largura da coluna e altura `report.situationBlock.heightRatio` vezes a largura. O esquema é gerado com `report.situationBlock.diagramWidth` e a proporção do bloco; o mapa é recortado para preencher o bloco, sem moldura cinza. Ambos os valores ficam em config.json.

## PDF com texto vetorial — 2026-10-26

Refatoração do relatório: layout único em src/reportLayout.js, prévia/PNG/DOCX em canvas (src/reports.js) e PDF vetorial em src/reportPdf.js. Adicionada a chave report.pdfFontFamily em config.json ("helvetica"). Coordenadas UTM sem agrupamento de milhar na prévia, mensagem, relatório e PDF. Testes em tests/reports.test.js cobrem formatação, layout e geração do PDF com jsPDF. Versão de cache dos módulos atualizada para 1.2.0.


## Importação DXF por arquivo — 2026-10-30

- [x] Polilinha com último vértice coincidente com o primeiro aceita como área fechada, com aviso (CAD que não grava a flag de fechamento). Tolerância em config.json (`validation.closureToleranceMeters`).
- [x] Lote importado por arquivo (src/dxfBatch.js): válidos entram, recusados listados com nome e causa.
- [x] Testes em tests/dxfImport.test.js com dados sintéticos; DXF reais de campanha não entram no repositório público.
- [x] Decisão do usuário (2026-10-30): linhas abertas de pré-corte entram no cálculo (origem e distância à borda), sem área. `PC561026.dxf` está sobre a borda da área `PP561026.dxf`, então os resultados desta campanha não mudam.
- [x] Linhas de pré-corte: validateLines, planner, mapa (cor em config.json), lista com remoção, campo `lines` no projeto e testes em tests/preCutLines.test.js.

## Monitoramento sismográfico — 2026-10-27

- [x] Importador da planilha Gantt (tools/import-gantt.mjs, npm run import:gantt) e snapshot data/monitoramento.json.
- [x] Seção de monitoramento: grade, legenda, contagens, tabela por comunidade, visão anual, PDF mês/ano.
- [x] Edição com login e gravação via API (cliente em src/monitoringApi.js).
- [x] Backend Google Apps Script em apps-script/ (Code.gs, appsscript.json, README.md).
- [x] Ajustes de UX do monitoramento (2026-10-27): sem deslocamento de layout ao exibir avisos (status abaixo da barra, altura reservada), botões de edição com posição fixa, login sempre com campos vazios e foco em Usuário, rótulo cinza para pontos sem monitoramento (monitoring.colors.mutedPoint), autocomplete username/current-password.
- [x] Edição simplificada (2026-10-27): diálogo pequeno com fundo desfocado, ação `auth` no backend, sessão em memória, "Salvar" direto, toast de sucesso, limite de 5 tentativas por 10 min e textos técnicos removidos da tela (config.json, monitoring.ui).
- [x] Backend sem setup manual: padrões de ADMIN_USER, ADMIN_PASSWORD_SHA256, XLSX_FILE_ID e SPREADSHEET_ID quando as propriedades não existem; setup() grava as ausentes sem sobrescrever (teste em tests/appsScript.test.js).
- [ ] Preencher monitoring.apiUrl em config.json com a URL do Apps Script implantado (até lá a edição mostra "Edição indisponível no momento.").
- [ ] Trocar a senha inicial (admin) antes de uso real: gerarHashSenha() e ADMIN_PASSWORD_SHA256. O padrão "admin" está no código; sem a troca, qualquer pessoa que leia o repositório entra como administrador.
- [ ] Decidir se os nomes dos pontos do config.json devem seguir a planilha ("Comunidade Pau Ferro", "Comunidade Pichilinga"), já adotados aqui.
- [ ] Corrigir na planilha original as anomalias listadas (março e agosto de 2025; N ausente em 29/02/2025).

## Limpeza de textos e Gantt em PDF — 2026-11-06

- [x] Página do planejador sem parágrafos de instrução (painel, áreas, direção, monitoramento, mensagem, projeto, mapa, cenários, relatório, rodapé e carregamento). Rótulos, títulos, estados vazios curtos, avisos de fonte e mensagens de validação mantidos. Relatório (PDF, DOCX, PNG, TXT) inalterado.
- [x] PDF do Gantt (mês e ano) redesenhado: legenda, cartões de contagem e tabela por comunidade lado a lado, sem sobreposição; nomes do resumo anual quebram em linhas. Medidas, tamanhos e cores em `monitoring.pdf` (config.json). Dados e rótulos da tabela inalterados.
- [x] Configuração: `monitoring.pdf.layout`, `sizes` e `colors`; build valida o bloco. `monitoring.ui.loginHint` removido (diálogo de login sem texto de apoio).
- [x] Testes em tests/monitoringPdf.test.js (uma página por mês, 13 no ano, colunas sem sobreposição, chave ausente recusada, textos removidos da página).
- [x] Reprovação do visual do PDF do Gantt (2026-11-06): refeito com a paleta Enaex do VISUAL_STANDARD do hub (vermelho `#E20613`, cinzas `#38424B`, `#4A4F55`, `#8A8F96`, `#E3E3E3`), fundo branco, grade de filetes finos, marcas em pílulas, legenda em uma linha, cartões sem caixas, tabela com filetes e logotipo Enaex colorido (`assets/enaex-brasil.png`, cópia do hub). Medidas, cores e logo em `monitoring.pdf`; o controlador lê o logo de `monitoring.pdf.logoAsset`. Teste de paleta em tests/monitoringPdf.test.js. Prévias conferidas em output/gantt-preview/ (não versionadas).
- [x] Exportação PNG 4K do Gantt (2026-11-06): botões "Exportar mês (PNG 4K)" e "Exportar ano (PNG 4K)". Mesmo layout e cores do PDF, desenhado em canvas na resolução final (3840 × 2715 px, RGB). Ano gera ZIP com 12 meses e resumo, via JSZip já vendorizado (sem dependência nova). Config em `monitoring.png` (widthPx, minWidthPx = 3840, fontStack, nomes); build recusa largura abaixo do mínimo; testes em tests/monitoringPng.test.js. Layout compartilhado em src/monitoringGantt.js. Versões de cache: app.js 1.4.0, controlador 1.4.0, monitoringPdf/monitoringPng/monitoringGantt 1.4.0. Prévias 4K em output/gantt-preview/ (não versionadas).

## Relatório de apresentação do monitoramento — 2026-11-06

- [x] Referência medida (RT - DESVIOS DE PERFURAÇÃO - PC56B, 14 páginas): página, margens, fontes, tamanhos, cores, logotipos, rodapé e tabelas documentados em SPEC.md.
- [x] Bloco `monitoring.report` em config.json; validação em src/monitoringReportConfig.js, usada pela exportação e pelo build (tools/build.mjs).
- [x] Módulo src/monitoringReportPdf.js com três páginas: capa e resumo (filtros, seis indicadores e tabela por comunidade), grade do mês e resumo anual. Reaproveita `painter` e `measureWith` de monitoringGantt.js e `drawOpsPdf` de monitoringPdf.js.
- [x] Botão "Gerar relatório (PDF)" na seção de monitoramento; usa o ano e o mês dos filtros; "Exportar mês (PDF)" passa a ser secundário.
- [x] Testes em tests/monitoringReport.test.js (contagens conferidas a partir do JSON, filtros, mês sem registro, margens, paleta e PDF de três páginas).
- [x] Prévias em output/report-preview/ (não versionadas): PDF, páginas em PNG e comparações lado a lado com a referência.
- [ ] Logotipo da Mineração Vale Verde (assets/mineracao-vale-verde.png) foi extraído do PDF de referência e é publicado no Pages. Confirmar se pode ficar público.
- [ ] Confirmar a tradução do rodapé ("ESTRITAMENTE PRIVADO E CONFIDENCIAL") e a exceção de dois logotipos por página (VISUAL_STANDARD pede um logo por página).
- [ ] O dashboard não tem filtro de pontos/comunidades; a capa informa os 7 pontos. Se o filtro for criado, o relatório precisa aceitar o subconjunto.
- Versões de cache: monitoringGantt, monitoringPdf, monitoringPng, monitoringReportConfig e monitoringReportPdf em 1.5.0; controlador 1.5.0; app.js 1.5.0 (index.html).

## Renomear áreas e limpeza da página — 2026-11-12

- [x] Renomear áreas e linhas de pré-corte importadas direto na lista (campo editável, confirmado com Enter ou ao sair do campo). Regra em src/areaNames.js; limite em config.validation.maxLabelLength; nome vazio ou longo demais é recusado com a causa. O nome vai para a lista de direções do relatório (prévia, PDF, DOCX e PNG), tooltip do mapa e projeto salvo.
- [x] Projeto: nomes de área e linha validados e aparados em validateProject. Testes em tests/areaNames.test.js.
- [x] Página limpa: rodapé, rótulos de seção repetidos, título "Três cenários. Uma campanha." (agora "Cenários"), frases de satélite e de modo vetorial no mapa, frase de critério dos cartões e explicação de ponto fixo repetida em cada comunidade. Relatórios, exportações e rótulos do monitoramento usados nelas não mudaram. Testes em tests/pageCleanup.test.js.
- [x] Correções da revisão de código e do QA (2026-11-12): renomear grava sempre (inclusive com formulário incompleto); Enter confirma sem enviar o formulário e não apaga a mensagem de erro; linhas sem plano atualizam o rótulo no mapa; o navegador não corta mais o nome (maxlength removido, a regra recusa com a causa); campo de nome com 16 px no celular; erro de projeto aponta a área pela posição.
- [x] Relatório (2026-11-12): nome de área no bloco de direções sai inteiro (sem corte em 39 caracteres); limite `report.maxDirectionRows` obrigatório em config.json, sem valor padrão no código; resumo "+ N áreas" aponta para o projeto JSON (a frase sobre a mensagem TXT era falsa no modelo padrão). Testes em tests/reports.test.js. Limitação registrada no SPEC: palavra sem espaço mais larga que a coluna não quebra.
- [ ] Nome padrão das áreas importadas do DXF é camada mais número (ex.: "DEMONSTRACAO_A 1", src/dxf.js:47), já existente. Agora o usuário renomeia; decidir se o padrão muda.
- [ ] Decidir se os rótulos da legenda do monitoramento devem ser encurtados ("Não houveram desmontes nesta data / Este ponto não foi monitorado", "Quantos desmontes houveram no mês?"). São os mesmos rótulos do PDF/PNG do Gantt (`monitoring.labels` em config.json), então não foram alterados; a grafia "houveram" também está nesses rótulos.
- [ ] Decidir se a data da imagem de satélite deve voltar na tela (removida do mapa; a atribuição do Esri continua no controle do Leaflet).
- Versões de cache: app.js 1.6.0 e styles.css 1.3.5; project.js, map.js e areaNames.js 1.3.7.
