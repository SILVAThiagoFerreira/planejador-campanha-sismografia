# Pipeline

1. Build lê e valida config.json, copia bibliotecas fixadas e gera manifesto estável data/manifest.json com hash e versão.
2. Navegador carrega manifesto e configuração, registra início e apresenta comunidades.
3. Importação lê o lote arquivo a arquivo (src/dxfBatch.js): cada DXF valida tamanho, tipo, geometria e fechamento antes de alterar o estado; cada arquivo aceito é conferido contra o projeto acumulado (região e cálculo); os que entram seguem e os recusados são listados com nome e causa.
4. Transforma coordenadas para SRC escolhido e verifica região, direções e quantidade.
5. Calcula círculo envolvente (áreas e linhas de pré-corte), centro e distâncias à borda (a menor entre áreas e linhas); inclui os pontos fixos em todos os cenários e seleciona as vagas restantes por estratégia.
6. Renderiza mapa, critérios e relatório do cenário selecionado.
7. Exporta PDF, PNG, TXT ou projeto JSON com identificação; registra evento no log.
8. Testes e build precedem publicação Pages; publicação é conferida no endereço servido.

Erros de validação são exibidos com a causa e registrados. Falha de satélite é explícita, sem inventar ortofoto. Falhas de configuração bloqueiam a inicialização. Erros de armazenamento local não interrompem o cálculo mas são informados.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.


## Monitoramento sismográfico — 2026-10-27

1. Importação (offline): planilha .xlsx exportada do Drive -> `npm run import:gantt -- arquivo.xlsx` -> valida o contrato e grava data/monitoramento.json. Anomalias do layout são impressas e gravadas no snapshot; a execução falha se faltar a linha de dias ou o cabeçalho de mês.
2. Build: `npm run build` valida o bloco monitoring de config.json (inclui `monitoring.pdf`: layout, tamanhos e cores; e `monitoring.png`: largura não abaixo do mínimo) e, se existir, o snapshot.
3. Navegador: lê a API (GET ?action=read); sem conexão ou sem apiUrl, usa a última cópia publicada com aviso neutro (motivo só no log); valida o schema; calcula contagens e N pelo calendário real.
4. Edição: "Editar dados" abre o diálogo de login; POST {action:"auth"} confirma o acesso. Só então alterna D e M no rascunho. Credenciais ficam em memória (variável), nunca em armazenamento do navegador.
5. Salvar: POST {action:"save"} com as credenciais da sessão (sem novo pedido de senha). Se o servidor recusar (code "auth" ou "locked"), o diálogo volta a abrir e o rascunho é mantido.
6. Backend (Apps Script): limite de 5 falhas por usuário em 10 min (CacheService); valida o payload, confere credenciais por hash (padrões quando as propriedades faltam), grava com LockService, cria aba de ano pelo modelo se necessário e, se XLSX_FILE_ID estiver definido, atualiza o .xlsx no Drive.
7. Após gravar, a aplicação mostra o toast "Salvo no Google Drive." e relê a API; falha de leitura mostra o aviso neutro sem esconder o valor gravado.
8. Testes: npm test (tests/monitoring.test.js cobre parser, contagens, calendário, payload de auth e gravação, respostas e fetch simulado; tests/appsScript.test.js carrega Code.gs com stubs e cobre setup, padrões, auth e limite de tentativas).

## Relatório de apresentação do monitoramento — 2026-11-06

1. Botão "Gerar relatório (PDF)": usa o ano e o mês dos filtros da seção. Recusa a geração sem dados lidos (fonte `error`) e com edição pendente. Carrega os logotipos `monitoring.report.logos` sob demanda.
2. Validação: `reportSettings` (src/monitoringReportConfig.js) confere o bloco `monitoring.report` inteiro: chaves, cores, medidas, rótulos e arquivos dos logotipos. Falha interrompe com o caminho da chave.
3. Montagem: `layoutReport` (src/monitoringReportPdf.js) gera as operações das três páginas a partir de `monthView`, `monthSummary` e `yearSummary`, os mesmos dados do dashboard. Não grava nada.
4. Desenho: `drawOpsPdf` escreve o PDF vetorial; `doc.save` entrega o arquivo ao navegador. Registra evento "export" no log.
5. Build: `npm run build` valida `monitoring.report` e os logotipos antes da publicação; `npm test` cobre tests/monitoringReport.test.js.

## Renomeação de áreas — 2026-11-12

1. Lista de áreas: cada área e linha tem um campo de nome (`data-rename` e `data-rename-line`). Ao confirmar, `renameItem` (app.js) chama `validateAreaName` (src/areaNames.js) com `config.validation.maxLabelLength`.
2. Nome válido: é aparado e gravado no estado. `persist()` salva antes de qualquer recálculo, então o nome fica salvo mesmo com o formulário incompleto (`calculate()` não grava nesse caso). Com plano, `calculate()` atualiza prévia e mapa; sem plano, `mapUpdate()` atualiza os rótulos do mapa. Enter confirma no keydown sem enviar o formulário. Nome inválido: mensagem de erro, campo volta ao nome anterior, nada é gravado.
3. Projeto JSON: `validateProject` (src/project.js) recusa nome vazio ou acima do limite e aparam os nomes válidos antes de aplicar.
4. Testes: tests/areaNames.test.js (regra, validação de projeto, renomeação preservada ao reabrir) e tests/pageCleanup.test.js (textos removidos e campos de nome presentes).

## Direções no relatório — 2026-11-12

1. `layoutReport` (src/reportLayout.js) confere `report.maxDirectionRows` antes de desenhar: inteiro maior que zero, senão recusa com a causa.
2. O bloco "Direcionamento informado" usa o nome completo da área; `text()` quebra a linha dentro da coluna. Nada é cortado.
3. Além do limite, a última linha aponta para o projeto JSON. O mesmo layout alimenta prévia, PNG, DOCX (canvas) e PDF vetorial.
4. Testes: tests/reports.test.js cobre nome longo inteiro, resumo com o projeto JSON e limite ausente recusado.
