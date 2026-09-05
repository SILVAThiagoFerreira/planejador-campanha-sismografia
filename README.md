# Planejador de campanha de sismografia

Aplicação estática para importar áreas DXF, comparar três estratégias de posicionamento de sismógrafos e exportar PDF, PNG e mensagem TXT. Executa integralmente no navegador e no GitHub Pages. Os arquivos importados permanecem no dispositivo.

## Executar
`npm ci`, `npm run build`, `npm test` e `npm start`. Abrir http://localhost:8765. O build copia dependências versionadas para vendor e gera data/manifest.json a partir de config.json; nunca editar o manifesto manualmente.

## Configuração
config.json contém projeções, comunidades, limites, critérios, textos, identidade visual e caminhos. EPSG:31984 é SIRGAS 2000 / UTM 24S; EPSG:32724 é WGS84 / UTM 24S. DXF usa X=Este e Y=Norte em metros; selecione o SRC correto antes de importar. Coordenadas das comunidades vieram do usuário em graus e minutos decimais.

O motor calcula o menor círculo que contém todos os vértices das áreas fechadas. O centro é a origem comum. Não confundir com centroide de área. O azimute de saída é informado por área, de 0° (Norte) a menos de 360°, sentido horário. O critério direcional ajuda a comparar posições e não prevê amplitude ou trajetória da vibração.

Na validação do projeto foram importadas duas amostras fornecidas pela operação: `holes-string-PP490826.dxf` e `r280826.dxf`, da pasta de versões 20260828. O primeiro gerou uma poligonal com 184 vértices e o segundo uma poligonal com 25 vértices; a entidade auxiliar `VIEWPORT` do segundo arquivo foi reportada e ignorada. Os arquivos continuam no computador do usuário e não são copiados para o Pages.

Dependências: Leaflet para mapa navegável; proj4 para transformação de coordenadas; jsPDF para PDF; JSZip para o pacote DOCX local. Versões fixadas e cópias locais mantêm cálculo e exportação independentes de CDNs. Imagens de satélite exigem conexão; falhas são indicadas e o mapa vetorial continua disponível. Não há autenticação fictícia ou backend de publicação de dados operacionais.

## Referências técnicas
- https://proj.org/en/stable/operations/projections/utm.html
- https://www.osmre.gov/programs/regulating-active-coal-mines/blaster-training
- https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040

## Publicação
Repositório independente com workflow GitHub Actions que valida e publica somente aplicação, assets e dependências necessárias. Materiais originais em VISUAL não são publicados.
