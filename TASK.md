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
