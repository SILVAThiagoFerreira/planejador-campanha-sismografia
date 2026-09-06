import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyCampaignPresets} from '../src/presets.js';
const {defaults} = JSON.parse(fs.readFileSync(new URL('../config.json',import.meta.url),'utf8'));
test('restored legacy defaults migrate without changing original input',()=>{
  const old={time:'',responsible:'Equipe Técnica Enaex'};
  const updated=applyCampaignPresets(old,defaults);
  assert.equal(updated.time,'12:00');
  assert.equal(updated.responsible,'Setor Técnico de Operações - Enaex Brasil');
  assert.equal(old.time,'');
});
test('custom campaign time and responsible are preserved',()=>{
  const custom={time:'14:30',responsible:'Responsável da campanha'};
  assert.deepEqual(applyCampaignPresets(custom,defaults),custom);
});
