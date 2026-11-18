import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withCurrentMessageTemplate} from '../src/whatsappTemplate.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

test('modelo padrão do WhatsApp usa o título novo e não tem bloco de observações', () => {
  const template = config.report.whatsappTemplate;
  assert.ok(template.startsWith('*Campanha de Sismografia Planejada | Desmonte {data}*\n'));
  assert.ok(!template.includes('OBSERVAÇÕES') && !template.includes('{observacoes}'));
  assert.ok(template.endsWith('Responsável: {responsavel}'));
});

test('campanha salva com o modelo padrão anterior passa a usar o padrão atual; texto personalizado é mantido', () => {
  const old = config.report.supersededWhatsappTemplates[0];
  assert.ok(old.includes('*SISMOGRAFIA | DESMONTE {data}*') && old.includes('{observacoes}'), 'a lista guarda o modelo antigo');
  const migrated = withCurrentMessageTemplate({messageTemplate: old, polygons: []}, config.report);
  assert.equal(migrated.messageTemplate, config.report.whatsappTemplate);
  assert.deepEqual(migrated.polygons, []);
  const custom = withCurrentMessageTemplate({messageTemplate: 'Meu texto {data}'}, config.report);
  assert.equal(custom.messageTemplate, 'Meu texto {data}');
});

test('o padrão atual não aparece na lista de modelos substituídos', () => {
  assert.ok(!config.report.supersededWhatsappTemplates.includes(config.report.whatsappTemplate));
});

test('ausência da lista de modelos substituídos recusa a leitura, sem lista vazia assumida', () => {
  assert.throws(() => withCurrentMessageTemplate({messageTemplate: 'x'}, {whatsappTemplate: 'y'}), /supersededWhatsappTemplates/);
});
