# Contratos

config.json: schemaVersion, version, title, defaults, crs[], communities[], validation, planner, map, report, paths, visual.

data/manifest.json (gerado): schemaVersion, version, configPath, configSha256. Não editar manualmente.

Área: id, name, layer, vertices[{x,y}], direction (azimute graus ou null), source (nome DXF). Coordenadas UTM em metros.

Comunidade: id, name, lat, lon (graus decimais), enabled (boolean), fixed (boolean) e priority (número positivo). `fixed=true` obriga o ponto a integrar todos os cenários e o ponto continua contando na quantidade total de instrumentos. Projetos antigos sem `fixed` são migrados para `false`. Coordenadas fornecidas em graus e minutos decimais são convertidas sem reinterpretar minutos como segundos.

Plano calculado: origin{x,y,lat,lon,radius}, polygons, communities (métricas, incluindo fixed), scenarios[{id,title,description,points,score,coincidentWith}], instrumentCount, fixedPointCount, warnings.

Projeto exportado: schemaVersion, savedAt, crs, meta, polygons, communities, instrumentCount, selectedScenario, messageTemplate. Importação deve validar versão e todos os campos antes de processar.

DOCX/PDF/PNG: relatório do cenário selecionado, nome ENAEX-SMP-AAAAMMDD-cenario-N. O DOCX é OOXML válido com a página A4 renderizada preservando a aparência do relatório. TXT: mensagem UTF-8 customizada para o cenário atual, sem envio automático. Logs JSON: eventos com timestamp, tipo e descrição.


## Monitoramento sismográfico — data/monitoramento.json (2026-10-27)

Gerado por `npm run import:gantt`; mesmo schema retornado pela API (`GET ?action=read`). Não editar manualmente.

```json
{
  "schemaVersion": 1,
  "source": {"fileName": "Tabela 1 - Gantt Chart - Monitoramentos Sismograficos - US MVV.xlsx", "driveFileId": "1Jz49X3on8uu2ia6PC3sH4S_QGAnsnKiK", "importedFile": "gantt.xlsx", "sheets": ["2025", "2026"]},
  "generatedAt": "2026-10-27T13:25:00.000Z",
  "years": {
    "2025": {
      "months": {
        "1": {
          "desmontes": [7, 10, 14, 17, 21, 24, 28, 31],
          "points": {"Barragem de Rejeitos": [7, 10, 14, 17, 21, 24, 28, 31], "Comunidade Lagoa do Mel": [7, 14, 21], "Comunidade Pau Ferro": [7, 14, 21], "Comunidade Torrões": [17, 28], "Comunidade Corredor": [17, 28], "Comunidade Itapicuru": [10, 24, 31], "Comunidade Pichilinga": [10, 24, 31]},
          "anomalies": []
        }
      }
    }
  }
}
```

- `schemaVersion`: 1. Qualquer outro valor é recusado.
- `years`: chaves "AAAA" (uma por aba de ano). `months`: chaves "1" a "12" (meses presentes na aba).
- `desmontes`: dias (inteiros, únicos, em ordem) com "D" na linha de desmontes.
- `points`: exatamente os 7 nomes de `config.monitoring.points`; cada lista traz os dias "M" (1 até o número de dias do mês). Dias fora do mês ("N") não são armazenados; são calculados pelo calendário. Dia inexistente no mês gera erro de validação.
- `anomalies`: textos com divergências de layout encontradas na importação. Vazio quando não há divergência.
- Contagens (desmontes, monitoramentos e por ponto) não são armazenadas: são calculadas pela aplicação e conferidas contra os valores em cache da planilha pelo importador.

Anomalias conhecidas da planilha de origem (2026-10-27): março e agosto de 2025 têm a linha dos dias sobre o rótulo "Barragem de Rejeitos" e os demais rótulos deslocados uma linha (dados lidos pela posição); a linha 34 de março não tem rótulo; fevereiro de 2025 não tem a marcação "N" no dia 29.

Configuração: bloco `monitoring` de config.json (points, monthNames, layout, labels, colors, api (readAction, saveAction, authAction, timeoutMs), ui (textos exibidos), pdf, source, snapshotPath, apiUrl).

Payload de verificação de acesso (`POST apiUrl`, text/plain): `{action: "auth", user, password}`. Resposta: `{ok: true, message: "Acesso liberado."}` ou `{ok: false, code, message}`.

Payload de gravação (`POST apiUrl`, text/plain): `{action: "save", user, password, year, month, desmontes: [dias], points: {nome: [dias]}}`. Resposta: `{ok, message, code?, data?}`.

Campo `code` (ausente em sucesso): `"auth"` = usuário ou senha incorretos; `"locked"` = muitas tentativas (5 falhas em 10 min por usuário). A aplicação usa o code para decidir se volta ao diálogo de login. Credenciais nunca são persistidas pela aplicação.
