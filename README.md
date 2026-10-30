# Planejador de campanha de sismografia

Aplicação estática para importar áreas DXF, comparar três estratégias de posicionamento de sismógrafos e exportar PDF, PNG e mensagem TXT. Executa integralmente no navegador e no GitHub Pages. Os arquivos importados permanecem no dispositivo.

## Executar
`npm ci`, `npm run build`, `npm test` e `npm start`. Para regenerar o snapshot do monitoramento a partir da planilha: `npm run import:gantt -- "caminho/planilha.xlsx"` (gera `data/monitoramento.json` e lista as anomalias). Abrir http://localhost:8765. O build copia dependências versionadas para vendor e gera data/manifest.json a partir de config.json; nunca editar o manifesto manualmente.

## Configuração
config.json contém projeções, comunidades, limites, critérios, textos, identidade visual e caminhos. Em `report.situationBlock` ficam a proporção (`heightRatio`) e a largura de geração (`diagramWidth`) do bloco comum entre esquema de distâncias e mapa do relatório. EPSG:31984 é SIRGAS 2000 / UTM 24S; EPSG:32724 é WGS84 / UTM 24S. DXF usa X=Este e Y=Norte em metros; selecione o SRC correto antes de importar. Coordenadas das comunidades vieram do usuário em graus e minutos decimais. `validation.closureToleranceMeters` (0,001 m) define quando o último vértice de uma polilinha coincide com o primeiro, fechando a área mesmo sem a marcação de fechamento do CAD.

O motor calcula o menor círculo que contém todos os vértices das áreas fechadas. O centro é a origem comum. Não confundir com centroide de área. O azimute de saída é informado por área, de 0° (Norte) a menos de 360°, sentido horário. O critério direcional ajuda a comparar posições e não prevê amplitude ou trajetória da vibração.

No cadastro de pontos, **Ponto fixo** inclui obrigatoriamente a comunidade nos três cenários. O ponto fixo faz parte da quantidade total informada; por exemplo, com três instrumentos e um ponto fixo, cada estratégia escolhe mais dois pontos. O sistema impede uma quantidade de pontos fixos maior que a quantidade de instrumentos.

Na validação do projeto foram importadas duas amostras fornecidas pela operação: `holes-string-PP490826.dxf` e `r280826.dxf`, da pasta de versões 20260828. O primeiro gerou uma poligonal com 184 vértices e o segundo uma poligonal com 25 vértices; a entidade auxiliar `VIEWPORT` do segundo arquivo foi reportada e ignorada. Os arquivos continuam no computador do usuário e não são copiados para o Pages.

Monitoramento: bloco `monitoring` em config.json (pontos, meses, rótulos, cores, `apiUrl` vazia até a implantação do Apps Script; textos exibidos ao usuário em `monitoring.ui`). O importador usa apenas o leitor de xlsx com JSZip já existente; nenhuma dependência nova.

Dependências: Leaflet para mapa navegável; proj4 para transformação de coordenadas; jsPDF para PDF; JSZip para o pacote DOCX local. Versões fixadas e cópias locais mantêm cálculo e exportação independentes de CDNs. Imagens de satélite exigem conexão; falhas são indicadas e o mapa vetorial continua disponível. O monitoramento sismográfico (seção final do planejador) lê e grava a planilha Gantt por meio de um backend Google Apps Script (`apps-script/`, ver `apps-script/README.md`), com login de administrador validado no servidor por hash SHA-256; a senha não é armazenada no navegador nem persistida, e fica só em memória durante a página. Sem conexão com o Google Drive, a seção exibe a última cópia publicada (`data/monitoramento.json`) com um aviso neutro; diagnósticos técnicos ficam apenas no log. Cores da seção de monitoramento (inclusive `monitoring.colors.mutedPoint`, rótulo cinza de pontos sem monitoramento) ficam em config.json. Nenhum dado de campanha é gravado no Pages.

## Referências técnicas
- https://proj.org/en/stable/operations/projections/utm.html
- https://www.osmre.gov/programs/regulating-active-coal-mines/blaster-training
- https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040

## Publicação
Repositório independente com workflow GitHub Actions que valida e publica somente aplicação, assets e dependências necessárias. Materiais originais em VISUAL não são publicados.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.

Logo da aplicação atualizado com VISUAL/logo.png fornecido pelo usuário, copiado sem alteração para assets/planejador-logo.png. Aplicado ao cabeçalho, carregamento, favicon e ícone Apple; caminho visual.logo no config.json.

PDF: textos, tabelas e esquema de distâncias são vetoriais e selecionáveis; mapa e logotipos são imagens. Fonte padrão do PDF em config.json (report.pdfFontFamily).
