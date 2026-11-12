import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('página: rodapé e cabeçalhos repetidos saíram; o rótulo do painel permanece', () => {
  const html = read('index.html');
  for (const text of ['<footer', 'Enaex Brasil · Planejador de Campanha de Sismografia', 'Três cenários. Uma campanha.', 'Situação espacial do desmonte', 'Comparação de alternativas', 'Documento da campanha', 'Monitoramento sismográfico']) {
    assert.ok(!html.includes(text), `${text} removido da página`);
  }
  assert.ok(html.includes('<h2>Cenários</h2>'), 'título dos cenários');
  assert.ok(html.includes('Configuração da campanha'), 'rótulo do painel permanece');
});

test('mapa: sem texto de rodapé de satélite nem frase de modo vetorial', () => {
  const map = read('src/map.js');
  assert.ok(!map.includes('Consulte a data da imagem'), 'aviso de data da imagem removido');
  assert.ok(!map.includes('Geometrias e distâncias preservadas'), 'frase do modo vetorial removida');
  assert.match(map, /function reportStatus\(message\)\{if\(status\)\{status\.textContent=message;status\.hidden=!message;\}\}/, 'status some quando vazio');
  assert.match(map, /Falha ao carregar parte do satélite/, 'falha de satélite continua visível');
});

test('cenários: sem frase de critério repetida em cada cartão', () => {
  assert.ok(!read('app.js').includes('Combinação definida pelo critério.'));
});

test('ponto fixo: explicação fica no leitor de tela e no título, sem linha visível em cada comunidade', () => {
  const app = read('app.js');
  assert.ok(!app.includes('<small id="fixed-help-'), 'linha visível removida');
  assert.match(app, /<span class="sr-only" id="fixed-help-\$\{i\}">Incluir em todos os cenários<\/span>/);
});

test('nomes: áreas e linhas têm campo editável; o navegador não corta o nome e Enter não envia o formulário', () => {
  const app = read('app.js');
  assert.match(app, /data-rename="\$\{i\}"/);
  assert.match(app, /data-rename-line="\$\{i\}"/);
  // Sem maxlength: um nome longo é recusado com a causa, não cortado em silêncio pelo navegador.
  assert.ok(!app.includes('maxlength="${config.validation.maxLabelLength}"'), 'sem corte silencioso do navegador');
  assert.match(app, /validateAreaName\(input\.value,config\.validation\.maxLabelLength\)/);
  assert.match(app, /e\.key==='Enter'&&/, 'Enter tratado no campo de nome');
  assert.match(app, /e\.preventDefault\(\);e\.target\.blur\(\)/, 'Enter confirma e não envia o formulário');
});
