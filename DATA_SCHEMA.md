# Contratos

config.json: schemaVersion, version, title, defaults, crs[], communities[], validation, planner, map, report, paths, visual.

data/manifest.json (gerado): schemaVersion, version, configPath, configSha256. Não editar manualmente.

Área: id, name, layer, vertices[{x,y}], direction (azimute graus ou null), source (nome DXF). Coordenadas UTM em metros.

Comunidade: id, name, lat, lon (graus decimais), enabled (boolean), priority (número positivo). Coordenadas fornecidas em graus e minutos decimais são convertidas sem reinterpretar minutos como segundos.

Plano calculado: origin{x,y,lat,lon,radius}, polygons, communities (métricas), scenarios[{id,title,description,points,score,coincidentWith}], warnings.

Projeto exportado: schemaVersion, savedAt, crs, meta, polygons, communities, instrumentCount, selectedScenario, messageTemplate. Importação deve validar versão e todos os campos antes de processar.

PDF/PNG: relatório do cenário selecionado, nome ENAEX-SMP-AAAAMMDD-cenario-N. TXT: mensagem UTF-8 customizada para o cenário atual, sem envio automático. Logs JSON: eventos com timestamp, tipo e descrição.
