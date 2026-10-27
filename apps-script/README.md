# Backend do monitoramento sismográfico (Google Apps Script)

Web app que lê e grava a planilha Gantt de monitoramento e, opcionalmente, mantém o arquivo `.xlsx` original do Drive atualizado. Os arquivos deste diretório **não são publicados** no GitHub Pages.

## Arquivos
- `Code.gs`: leitura (`doGet`), gravação (`doPost`), validação, autenticação, bloqueio e exportação para o Drive.
- `appsscript.json`: manifesto com escopos OAuth, serviço avançado Drive v3 e acesso da web app (`USER_DEPLOYING`, `ANYONE_ANONYMOUS`).

## 1. Criar a planilha nativa
1. No Google Drive, abra o `.xlsx` original ("Tabela 1 - Gantt Chart - Monitoramentos Sismograficos - US MVV") e use **Arquivo > Salvar como Planilhas Google**. A cópia nativa tem o mesmo layout (uma aba por ano: `2025`, `2026`...).
2. Anote o ID do arquivo original (`1Jz49X3on8uu2ia6PC3sH4S_QGAnsnKiK`); ele será usado em `XLSX_FILE_ID`.

## 2. Criar o projeto de script
1. Na planilha nativa, **Extensões > Apps Script**. O projeto fica vinculado à planilha.
2. Substitua o conteúdo de `Code.gs` pelo arquivo deste diretório e crie `appsscript.json` com o mesmo conteúdo (em **Configurações do projeto > Mostrar o arquivo de manifesto**).
3. Em **Serviços**, confirme que o **Drive API** está ativo como `Drive` (v3). O manifesto já declara isso.

## 3. Configurar propriedades do script (opcional)
O script já funciona sem nenhuma propriedade: quando uma propriedade não existe, usa o padrão abaixo (configuração, não dado). A função `setup` grava as propriedades que faltarem, sem sobrescrever as existentes. Execute-a no editor (botão Executar; autorize as permissões):
- `ADMIN_USER` = `admin` (padrão igual)
- `ADMIN_PASSWORD_SHA256` = SHA-256 (hex) da senha inicial `admin` (padrão igual)
- `XLSX_FILE_ID` = `1Jz49X3on8uu2ia6PC3sH4S_QGAnsnKiK` (se vazio, o `.xlsx` no Drive não é atualizado)
- `SPREADSHEET_ID` = ID da planilha vinculada ao script (padrão: a própria planilha vinculada)

**Trocar a senha antes do uso em produção (obrigatório):** o padrão `admin` está no código do repositório, então qualquer pessoa que o leia conhece a senha inicial. Edite `NOVA_SENHA` na função `gerarHashSenha()`, execute-a e copie o hash registrado no log para `ADMIN_PASSWORD_SHA256`. Nunca grave a senha em texto no código nem no front-end.

## 4. Implantar a web app
1. **Implantar > Nova implantação > Tipo: App da Web**.
2. Executar como: **Eu** (USER_DEPLOYING). Quem tem acesso: **Qualquer pessoa** (ANYONE_ANONYMOUS).
3. Copie a URL terminada em `/exec`.
4. Em `config.json`, preencha `monitoring.apiUrl` com essa URL e rode `npm run build`.
5. Após alterar o código, use **Implantar > Gerenciar implantações > Editar > Nova versão** para manter a mesma URL.

## Contrato da API
### Leitura: `GET {apiUrl}?action=read`
Resposta JSON:
```json
{"ok": true, "data": {"schemaVersion": 1, "source": {"fileName": "...", "sheets": ["2025","2026"]}, "generatedAt": "2026-10-27T12:00:00.000Z", "years": {"2025": {"months": {"1": {"desmontes": [7, 10], "points": {"Barragem de Rejeitos": [3, 5]}, "anomalies": []}}}}}}
```
Os dados têm o mesmo schema de `data/monitoramento.json` (ver `DATA_SCHEMA.md`).

### Verificação de acesso: `POST {apiUrl}` com `action: "auth"`
- Corpo (text/plain): `{"action": "auth", "user": "admin", "password": "..."}`.
- Só confere as credenciais; não grava nada.
- Sucesso: `{"ok": true, "message": "Acesso liberado."}`.
- Recusa: `{"ok": false, "code": "auth", "message": "Usuário ou senha incorretos."}`.
- Limite de tentativas: após 5 falhas em 10 minutos para o mesmo usuário (nome sem diferença de maiúsculas e espaços), a resposta é `{"ok": false, "code": "locked", "message": "Muitas tentativas. Aguarde alguns minutos."}`, mesmo com a senha correta. O contador fica no CacheService; cada falha renova a janela e um acerto zera o contador.

### Gravação: `POST {apiUrl}`
- Corpo: string JSON enviada com `Content-Type: text/plain` (evita preflight CORS):
```json
{"action": "save", "user": "admin", "password": "...", "year": 2026, "month": 10, "desmontes": [3, 10], "points": {"Barragem de Rejeitos": [3, 10], "Comunidade Lagoa do Mel": [], "...": []}}
```
- Validações: usuário (até 100 caracteres), senha (até 200), ano com aba `AAAA`, mês 1 a 12, dias inteiros, únicos, em ordem e dentro do mês, e exatamente os 7 nomes de ponto.
- Credenciais: mesma verificação da ação `auth` (inclui o limite de tentativas).
- Gravação: escreve `D` na linha acima dos dias e `M` nas linhas dos pontos, somente para dias do mês. Células `N`, rótulos e fórmulas de contagem não são alterados. Usa `LockService` (espera até 30 s).
- Aba do ano inexistente: copia a aba-modelo mais recente, limpa as marcações e recalcula as células `N`.
- Se `XLSX_FILE_ID` estiver definido, exporta a planilha como `.xlsx` e atualiza o arquivo original via Drive API v3 (`Drive.Files.update`).
- Resposta: `{"ok": true, "message": "...", "data": {...}}` ou `{"ok": false, "code": "auth" | "locked", "message": "..."}` (sem `code` nas demais falhas). Falhas de validação e de credenciais retornam HTTP 200 com `ok: false`, para que a aplicação exiba a mensagem.

### Erros
- `Usuário ou senha incorretos.` (`code: "auth"`): credenciais recusadas. A aplicação volta ao diálogo de login.
- `Muitas tentativas. Aguarde alguns minutos.` (`code: "locked"`): limite atingido.
- Mensagens de validação começam com o campo afetado (ex.: `Ponto desconhecido: ...`).
- Falhas na exportação do `.xlsx` não desfazem a gravação; a resposta informa a falha.

### Testes automáticos
`npm test` carrega `Code.gs` num sandbox com stubs dos serviços do Google (tests/appsScript.test.js) e cobre setup(), padrões, `auth` e o limite de tentativas. Não substitui o teste manual na implantação.

## Sincronização com config.json
As constantes no topo de `Code.gs` (nomes de pontos, meses, rótulos e marcadores) espelham `config.json`, bloco `monitoring`. Se mudar nomes de pontos ou rótulos, altere os dois.

## Logs
Os eventos são registrados com `console.log` em JSON (Apps Script > Execuções e Stackdriver). A aplicação também registra no log local da sessão (botão "Baixar log" do planejador).

## Teste manual rápido
1. Abra a URL `/exec?action=read` no navegador: deve aparecer um JSON com `"ok": true`.
2. No planejador, abra a seção de monitoramento, clique em "Editar dados", informe credenciais inválidas e clique em "Entrar": deve aparecer "Usuário ou senha incorretos." no diálogo. Com as credenciais corretas, marque um dia e clique em "Salvar": deve aparecer o toast "Salvo no Google Drive.".
3. Com credenciais válidas, grave e confira a célula na planilha nativa e o `.xlsx` no Drive.
