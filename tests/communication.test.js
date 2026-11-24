import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCommunicationMessage,
  communicationFileName,
  greetingFor,
  validateCommunicationSettings,
} from '../src/communication.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const settings = config.report.communication;

const points = [
  {id: 'P01', name: 'Barragem de Rejeitos', lat: -9.6672333, lon: -36.7714, distance: 1200},
  {id: 'P02', name: 'Comunidade de Pau-Ferro', lat: -9.67, lon: -36.75, distance: 980},
  {id: 'P03', name: 'Comunidade de Torrões', lat: -9.68, lon: -36.74, distance: 1500},
];
const data = {
  config,
  meta: {date: '2026-11-24', blastName: 'REG', time: '08:30', operation: 'MINA SERROTE'},
  plan: {origin: {x: 749069.1, y: 8930215.4, lat: -9.67, lon: -36.73, radius: 100}, polygons: [], communities: points},
  scenario: {id: 2, title: 'Direcionamento', points},
};

// Fortaleza é UTC-3 sem horário de verão: instantes com offset explícito evitam depender do fuso da máquina.
const at = local => new Date(`2026-11-24T${local}-03:00`);

test('bloco report.communication do config.json é válido', () => {
  assert.doesNotThrow(() => validateCommunicationSettings(settings));
});

test('saudação segue o horário: boa noite de madrugada, bom dia de 5h a 11h59, boa tarde de 12h a 17h59, boa noite a partir de 18h', () => {
  assert.equal(greetingFor(at('00:00:00'), settings), settings.greetings.evening);
  assert.equal(greetingFor(at('04:59:59'), settings), settings.greetings.evening);
  assert.equal(greetingFor(at('05:00:00'), settings), settings.greetings.morning);
  assert.equal(greetingFor(at('08:00:00'), settings), settings.greetings.morning);
  assert.equal(greetingFor(at('11:59:59'), settings), settings.greetings.morning);
  assert.equal(greetingFor(at('12:00:00'), settings), settings.greetings.afternoon);
  assert.equal(greetingFor(at('17:59:59'), settings), settings.greetings.afternoon);
  assert.equal(greetingFor(at('18:00:00'), settings), settings.greetings.evening);
  assert.equal(greetingFor(at('23:59:59'), settings), settings.greetings.evening);
});

test('saudação usa o fuso configurado, não o da máquina', () => {
  // 06:30 UTC é 03:30 em Fortaleza (boa noite); no fuso UTC o mesmo instante é 06:30 (bom dia).
  const instant = new Date('2026-11-24T06:30:00Z');
  assert.equal(greetingFor(instant, settings), settings.greetings.evening);
  assert.equal(greetingFor(instant, {...settings, timeZone: 'UTC'}), settings.greetings.morning);
});

test('mensagem começa com a saudação do horário e lista só os locais, sem coordenadas', () => {
  const text = buildCommunicationMessage(data, settings, at('14:10:00'));
  assert.equal(text, [
    'Boa tarde!',
    '',
    '*Locais de monitoramento - 24/11/2026*',
    '1. Barragem de Rejeitos',
    '2. Comunidade de Pau-Ferro',
    '3. Comunidade de Torrões',
  ].join('\n'));
});

test('mensagem de comunicação não traz coordenadas, UTM, distâncias nem responsável', () => {
  const text = buildCommunicationMessage(data, settings, at('09:00:00'));
  assert.doesNotMatch(text, /\d{3} \d{2}\.\d{3} [NSWE]/, 'latitude/longitude em graus e minutos');
  assert.doesNotMatch(text, /UTM|Latitude|Longitude|Leste|Norte|Distância|°| m\b/i);
  assert.doesNotMatch(text, /\d{6,}/, 'nenhuma coordenada métrica');
  assert.match(text, /^Bom dia!/);
});

test('o modelo padrão não tem campos de coordenadas nem de responsável', () => {
  for (const key of ['latitude', 'longitude', 'norte', 'leste', 'zona', 'pontos', 'quantidade', 'responsavel', 'observacoes']) {
    assert.ok(!settings.template.includes(`{${key}}`), `campo {${key}} não deve estar no TXT de comunicação`);
  }
});

test('nome do arquivo usa a data em AAAAMMDD e o número do cenário', () => {
  assert.equal(communicationFileName(data, settings), '20261124-COMUNICACAO-cenario-2.txt');
});

test('cenário sem pontos é recusado antes de gerar o texto', () => {
  const empty = {...data, scenario: {id: 1, title: 'Vazio', points: []}};
  assert.throws(() => buildCommunicationMessage(empty, settings, at('09:00:00')), /Calcule e selecione um cenário/);
});

test('configuração inválida é recusada com a causa', () => {
  const broken = (change) => ({...settings, ...change});
  assert.throws(() => validateCommunicationSettings(undefined), /report\.communication ausente/);
  assert.throws(() => validateCommunicationSettings(broken({morningUntilHour: 18, afternoonUntilHour: 12})), /nightUntilHour < morningUntilHour < afternoonUntilHour/);
  assert.throws(() => validateCommunicationSettings(broken({nightUntilHour: 12})), /nightUntilHour < morningUntilHour < afternoonUntilHour/);
  assert.throws(() => validateCommunicationSettings(broken({afternoonUntilHour: 25})), /afternoonUntilHour deve ser uma hora inteira de 0 a 24/);
  assert.throws(() => validateCommunicationSettings(broken({morningUntilHour: 9.5})), /morningUntilHour deve ser uma hora inteira/);
  assert.throws(() => validateCommunicationSettings(broken({timeZone: 'Marte/Olympus'})), /timeZone inválido/);
  assert.throws(() => validateCommunicationSettings(broken({greetings: {...settings.greetings, evening: ''}})), /greetings\.evening ausente/);
  assert.throws(() => validateCommunicationSettings(broken({template: '{saudacao} sem locais'})), /precisa conter \{saudacao\} e \{locais\}/);
  assert.throws(() => validateCommunicationSettings(broken({template: '{saudacao}\n{locais}\n{latitude}'})), /Campo desconhecido.*\{latitude\}/);
  assert.throws(() => validateCommunicationSettings(broken({fileName: '{data}-{hora}.txt'})), /Campo desconhecido.*\{hora\}/);
});

test('campo desconhecido no modelo não some em silêncio ao gerar a mensagem', () => {
  // A validação já recusa; aqui confirma que a geração também não aceita a chave.
  assert.throws(() => buildCommunicationMessage(data, {...settings, template: '{saudacao} {locais} {zona}'}, at('09:00:00')), /Campo desconhecido/);
});

test('chave extra em report.communication e em greetings é recusada, não ignorada', () => {
  assert.throws(() => validateCommunicationSettings({...settings, morningUntilHours: 12}), /Chave desconhecida em report\.communication: morningUntilHours/);
  assert.throws(() => validateCommunicationSettings({...settings, greetings: {...settings.greetings, night: 'Boa noite'}}), /greetings: night/);
});

test('nome do arquivo precisa terminar em .txt e não pode ter caracteres proibidos', () => {
  assert.throws(() => validateCommunicationSettings({...settings, fileName: '{data}-comunicacao'}), /precisa ser um nome \.txt/);
  assert.throws(() => validateCommunicationSettings({...settings, fileName: '{data}/cenario-{cenario}.txt'}), /caracteres proibidos/);
  assert.throws(() => validateCommunicationSettings({...settings, fileName: 'a:{cenario}.txt'}), /caracteres proibidos/);
});

test('campo usado no modelo sem valor é recusado, sem linha em branco', () => {
  const semRegiao = {...data, meta: {...data.meta, blastName: ''}};
  assert.throws(() => buildCommunicationMessage(semRegiao, {...settings, template: '{saudacao}\n{regiao}\n{locais}'}, at('09:00:00')), /Campo \{regiao\} sem valor/);
  // Sem {regiao} no modelo, o mesmo dado vazio não impede a geração.
  assert.doesNotThrow(() => buildCommunicationMessage(semRegiao, settings, at('09:00:00')));
});
