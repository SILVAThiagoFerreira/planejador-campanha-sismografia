# Pipeline

1. Build lê e valida config.json, copia bibliotecas fixadas e gera manifesto estável data/manifest.json com hash e versão.
2. Navegador carrega manifesto e configuração, registra início e apresenta comunidades.
3. Importação valida tamanho e tipo, lê DXF e valida áreas antes de alterar o estado.
4. Transforma coordenadas para SRC escolhido e verifica região, direções e quantidade.
5. Calcula círculo envolvente, centro, distâncias e cenários.
6. Renderiza mapa, critérios e relatório do cenário selecionado.
7. Exporta PDF, PNG, TXT ou projeto JSON com identificação; registra evento no log.
8. Testes e build precedem publicação Pages; publicação é conferida no endereço servido.

Erros de validação são exibidos com a causa e registrados. Falha de satélite é explícita, sem inventar ortofoto. Falhas de configuração bloqueiam a inicialização. Erros de armazenamento local não interrompem o cálculo mas são informados.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.
