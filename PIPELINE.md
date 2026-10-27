# Pipeline

1. Build lê e valida config.json, copia bibliotecas fixadas e gera manifesto estável data/manifest.json com hash e versão.
2. Navegador carrega manifesto e configuração, registra início e apresenta comunidades.
3. Importação valida tamanho e tipo, lê DXF e valida áreas antes de alterar o estado.
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
3. Navegador: lê a API (GET ?action=read) ou o snapshot local com aviso; valida o schema; calcula contagens e N pelo calendário real.
4. Edição: alterna D e M no rascunho; o login envia POST com o payload validado (senha só no corpo da requisição).
5. Backend (Apps Script): valida o payload, confere credenciais por hash, grava com LockService, cria aba de ano pelo modelo se necessário e, se XLSX_FILE_ID estiver definido, atualiza o .xlsx no Drive.
6. Após gravar, a aplicação relê a API; falha de leitura é exibida sem esconder o valor gravado.
7. Testes: npm test (tests/monitoring.test.js cobre parser, contagens, calendário, payload e leitor xlsx).
