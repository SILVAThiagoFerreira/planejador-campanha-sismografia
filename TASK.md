# Entrega

Construir aplicação independente no navegador com visual do Aviso de Desmonte, sete comunidades fornecidas, importação de múltiplas áreas DXF, direção por área, quantidade de sismógrafos, três cenários explicados, mapa e relatórios DOCX/PDF/PNG/TXT. Publicar no GitHub Pages após testes de geometria, validação de exportação e inspeção visual desktop/mobile.

Permitir marcar pontos habilitados como fixos, garantindo sua inclusão nos três cenários e sua persistência no projeto sem alterar a quantidade total de instrumentos.

Configuração centralizada em config.json. Arquitetura modular: leitura DXF, validação, geometria, planejamento, mapa, relatórios, logs e controlador. Bibliotecas locais versionadas justificadas no README. Não modificar ferramentas vizinhas nem arquivos originais de referência.

## Ajustes do relatório — 06/09/2026

Horário inicial: 12:00. Responsável inicial: Setor Técnico de Operações - Enaex Brasil. Os presets ficam em config.json; campanhas restauradas/importadas com horário vazio ou responsável padrão antigo recebem os novos valores, preservando valores personalizados. O relatório remove o subtítulo de cenário e o parágrafo sobre previsão de vibração; o rodapé mostra somente o responsável e logo proporcional. Avanço planejado apresenta horário e quantidade em uma frase e desmonte em linha separada. A seleção e os nomes dos arquivos continuam identificando o cenário.

Logo da aplicação atualizado com VISUAL/logo.png fornecido pelo usuário, copiado sem alteração para assets/planejador-logo.png. Aplicado ao cabeçalho, carregamento, favicon e ícone Apple; caminho visual.logo no config.json.
