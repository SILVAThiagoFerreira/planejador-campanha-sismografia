# Pipeline

1. Build lê e valida config.json, copia bibliotecas fixadas e gera manifesto estável data/manifest.json com hash e versão.
2. Navegador carrega manifesto e configuração, registra início e apresenta comunidades.
3. Importação lê o lote arquivo a arquivo (src/dxfBatch.js): cada DXF valida tamanho, tipo, geometria e fechamento antes de alterar o estado; os aceitos entram e os recusados são listados com nome e causa.
4. Transforma coordenadas para SRC escolhido e verifica região, direções e quantidade.
5. Calcula círculo envolvente, centro e distâncias; inclui os pontos fixos em todos os cenários e seleciona as vagas restantes por estratégia.
6. Renderiza mapa, critérios e relatório do cenário selecionado.
7. Exporta PDF, PNG, TXT ou projeto JSON com identificação; registra evento no log.
8. Testes e build precedem publicação Pages; publicação é conferida no endereço servido.

Erros de validação são exibidos com a causa e registrados. Falha de satélite é explícita, sem inventar ortofoto. Falhas de configuração bloqueiam a inicialização. Erros de armazenamento local não interrompem o cálculo mas são informados.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.


## Monitoramento sismográfico — 2026-10-27

1. Importação (offline): planilha .xlsx exportada do Drive -> `npm run import:gantt -- arquivo.xlsx` -> valida o contrato e grava data/monitoramento.json. Anomalias do layout são impressas e gravadas no snapshot; a execução falha se faltar a linha de dias ou o cabeçalho de mês.
2. Build: `npm run build` valida o bloco monitoring de config.json e, se existir, o snapshot.
3. Navegador: lê a API (GET ?action=read); sem conexão ou sem apiUrl, usa a última cópia publicada com aviso neutro (motivo só no log); valida o schema; calcula contagens e N pelo calendário real.
4. Edição: "Editar dados" abre o diálogo de login; POST {action:"auth"} confirma o acesso. Só então alterna D e M no rascunho. Credenciais ficam em memória (variável), nunca em armazenamento do navegador.
5. Salvar: POST {action:"save"} com as credenciais da sessão (sem novo pedido de senha). Se o servidor recusar (code "auth" ou "locked"), o diálogo volta a abrir e o rascunho é mantido.
6. Backend (Apps Script): limite de 5 falhas por usuário em 10 min (CacheService); valida o payload, confere credenciais por hash (padrões quando as propriedades faltam), grava com LockService, cria aba de ano pelo modelo se necessário e, se XLSX_FILE_ID estiver definido, atualiza o .xlsx no Drive.
7. Após gravar, a aplicação mostra o toast "Salvo no Google Drive." e relê a API; falha de leitura mostra o aviso neutro sem esconder o valor gravado.
8. Testes: npm test (tests/monitoring.test.js cobre parser, contagens, calendário, payload de auth e gravação, respostas e fetch simulado; tests/appsScript.test.js carrega Code.gs com stubs e cobre setup, padrões, auth e limite de tentativas).
