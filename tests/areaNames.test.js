import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAreaName} from '../src/areaNames.js';
import {validateProject} from '../src/project.js';
import fs from 'node:fs';

// O limite vem do config.json real, para que os testes falhem se ele mudar sem revisão.
const {maxLabelLength} = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).validation;

const config = {
  crs: [{id: 'EPSG:31984'}, {id: 'EPSG:32724'}],
  communities: [{id: 'a'}, {id: 'b'}],
  validation: {maxLabelLength, maxNotesLength: 350, closureToleranceMeters: 0.001, minLineLengthMeters: 1, maxVertices: 5000, maxPolygons: 50, maxFileBytes: 1e6}
};

function project(overrides = {}) {
  return {
    schemaVersion: 1,
    crs: 'EPSG:31984',
    communities: [
      {id: 'a', name: 'Comunidade A', lat: -9.6, lon: -36.7, enabled: true, fixed: false},
      {id: 'b', name: 'Comunidade B', lat: -9.7, lon: -36.8, enabled: true, fixed: false}
    ],
    instrumentCount: 1,
    polygons: [{id: 'p1', name: 'Área norte', vertices: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}], direction: null}],
    lines: [],
    meta: {date: '2026-11-12', blastName: 'REG', operation: 'OP', responsible: '', time: '12:00', notes: ''},
    messageTemplate: '',
    selectedScenario: 1,
    ...overrides
  };
}

test('nome de área: aceita o texto digitado e apara os espaços das pontas', () => {
  assert.deepEqual(validateAreaName('  Área leste  ', 100), {ok: true, name: 'Área leste', error: ''});
});

test('nome de área: recusa vazio e só espaços, com a causa', () => {
  for (const value of ['', '   ', null, undefined]) {
    const result = validateAreaName(value, 100);
    assert.equal(result.ok, false);
    assert.match(result.error, /não pode ficar vazio/);
  }
});

test('nome de área: respeita exatamente o limite de config.validation.maxLabelLength', () => {
  assert.equal(validateAreaName('x'.repeat(100), 100).ok, true);
  const refused = validateAreaName('x'.repeat(101), 100);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /máximo 100 caracteres/);
});

test('nome de área: limite ausente ou inválido na configuração interrompe, sem valor padrão', () => {
  assert.throws(() => validateAreaName('Área', undefined), /Limite de nome ausente ou inválido/);
  assert.throws(() => validateAreaName('Área', 0), /Limite de nome ausente ou inválido/);
});

test('projeto: nomes são salvos aparados', () => {
  const value = validateProject(project({polygons: [{...project().polygons[0], name: '  Área norte  '}]}), config);
  assert.equal(value.polygons[0].name, 'Área norte');
});

test('projeto: renomeação sobrevive a salvar e reabrir o arquivo', () => {
  const renamed = project({polygons: [{...project().polygons[0], name: 'Desmonte 12/11 - norte'}]});
  const reopened = validateProject(JSON.parse(JSON.stringify(renamed)), config);
  assert.equal(reopened.polygons[0].name, 'Desmonte 12/11 - norte');
});

test('projeto: área com nome vazio é recusada e a causa aparece na mensagem', () => {
  assert.throws(
    () => validateProject(project({polygons: [{...project().polygons[0], name: '   '}]}), config),
    /Nome de área 1 inválido\. O nome não pode ficar vazio\./
  );
});

test('projeto: a mensagem aponta a área pela posição, não só "inválido"', () => {
  const second = {...project().polygons[0], id: 'p2', name: ''};
  assert.throws(
    () => validateProject(project({polygons: [project().polygons[0], second]}), config),
    /Nome de área 2 inválido/
  );
});

test('projeto: linha de pré-corte com nome vazio é recusada', () => {
  const line = {id: 'l1', name: '', vertices: [{x: 0, y: 0}, {x: 10, y: 0}]};
  assert.throws(() => validateProject(project({lines: [line]}), config), /Nome de linha 1 inválido/);
});

test('projeto: nome acima do limite de caracteres é recusado', () => {
  assert.throws(
    () => validateProject(project({polygons: [{...project().polygons[0], name: 'x'.repeat(101)}]}), config),
    /máximo 100 caracteres/
  );
});
