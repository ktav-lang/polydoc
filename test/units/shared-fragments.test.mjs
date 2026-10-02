import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildRootDocs, checkSources, configure, readUnits, validateBodySourceShape, writeRootDocs } from '../../src/index.mjs';
import { bodySource, buildInTemp, metaJs, unitMeta, write } from '../helpers.mjs';

test('one shared snippet updates all four generated translations and their parity checks', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-shared-'));
  const langs = ['en', 'ru', 'zh', 'es'];
  configure({ langs, rootDocuments: ['README'] });
  try {
    const unitsDir = path.join(temp, 'root-docs', 'README');
    const bodyPath = path.join(unitsDir, 'example', 'body-1.md');
    write(path.join(unitsDir, 'manifest.js'), metaJs(['example']));
    write(path.join(unitsDir, 'example', 'meta.js'), metaJs(unitMeta('frontmatter')));
    for (const value of [41, 42]) {
      const snippet = '```js\nexport const answer = ' + value + ';\n```';
      const body = '>>>>> shared=example\n' + snippet + '\n\n' + langs.map(lang =>
        `>>>>> lang=${lang}\n# ${lang}\n\n<<<<< include=example\n`).join('');
      write(bodyPath, body);
      const docs = buildRootDocs(temp);
      writeRootDocs(temp, docs);
      for (const lang of langs) {
        const filename = lang === 'en' ? 'README.md' : `README.${lang}.md`;
        assert.equal(fs.readFileSync(path.join(temp, filename), 'utf8'), `# ${lang}\n\n${snippet}\n`);
      }
      assert.deepEqual(checkSources(readUnits(unitsDir)).problems, []);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    configure({ langs: ['en', 'ru', 'zh'], outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' }, readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' }, sectionInventoryLockFormat: 'polydoc-test-section-inventory', rootDocuments: ['README', 'CHANGELOG'] });
  }
});

test('legacy inline fences and include-looking code remain byte-identical', () => {
  const text = '```text\n<<<<< include=literal\n>>>>> shared=literal\n```\n';
  assert.deepEqual(validateBodySourceShape('legacy', 1, bodySource(text, text, text)), { en: text, ru: text, zh: text });
});

test('multiple shared blocks preserve order, fence markers and literal references', () => {
  const first = '~~~~text\n<<<<< include=literal\n~~~\n~~~~';
  const second = '```js\nconst count = 2;\n```';
  const preamble = `>>>>> shared=first\n${first}\n\n>>>>> shared=second\n${second}\n\n`;
  const body = '<<<<< include=second\n\n<<<<< include=first\n';
  const decoded = validateBodySourceShape('example', 1, preamble + bodySource(body, body, body));
  const expected = `${second}\n\n${first}\n`;
  assert.deepEqual(decoded, { en: expected, ru: expected, zh: expected });
});

test('malformed definitions, unsafe names and unknown references are rejected', () => {
  const languages = bodySource('<<<<< include=example\n', '<<<<< include=example\n', '<<<<< include=example\n');
  for (const preamble of [
    '>>>>> shared=../example\n```js\n42\n```\n\n',
    '>>>>> shared=example \n```js\n42\n```\n\n',
    '>>>>> shared=example\n\n',
    '>>>>> shared=example\n```js\n42\n',
    '>>>>> shared=example\n```js\n42\n```\n\n>>>>> shared=example\n```js\n43\n```\n\n',
    '>>>>> shared=example\n```text\n>>>>> lang=en\n```\n\n',
    '',
  ]) assert.throws(() => validateBodySourceShape('example', 1, preamble + languages), Error);
  const valid = '>>>>> shared=example\n```js\n42\n```\n\n';
  for (const reference of ['<<<<< include=../example\n', '<<<<< include=example trailing\n', '<<<<< include=missing\n']) {
    assert.throws(() => validateBodySourceShape('example', 1, valid + bodySource(reference, reference, reference)), Error);
  }
});

test('a translation cannot silently drop or duplicate a shared reference', () => {
  const preamble = '>>>>> shared=example\n```js\n42\n```\n\n';
  assert.throws(() => validateBodySourceShape('example', 1, preamble + bodySource('<<<<< include=example\n', 'no example\n', '<<<<< include=example\n')), Error);
  assert.throws(() => validateBodySourceShape('example', 1, preamble + bodySource('<<<<< include=example\n', '<<<<< include=example\n\n<<<<< include=example\n', '<<<<< include=example\n')), Error);
});

test('shared names never leak into another body file', () => {
  const preamble = '>>>>> shared=example\n```js\n42\n```\n\n';
  const body = bodySource('<<<<< include=example\n', '<<<<< include=example\n', '<<<<< include=example\n');
  validateBodySourceShape('first', 1, preamble + body);
  assert.throws(() => validateBodySourceShape('second', 1, body), Error);
});

test('content builds substitute release tokens inside shared code after expansion', async () => {
  const preamble = '>>>>> shared=version\n```js\nexport const version = \"@@VERSION@@\";\n```\n\n';
  const body = '# Test\n\n<<<<< include=version\n';
  const bodies = bodySource(body, body, body);
  const built = await buildInTemp([{ name: 'frontmatter', meta: unitMeta('frontmatter'), bodies: [['end.\n', 'конец.\n', '结束。\n']] }], contentDir => {
    write(path.join(contentDir, 'frontmatter', 'body-1.md'), preamble + bodies);
  });
  for (const lang of ['en', 'ru', 'zh']) assert.equal(built.bufs[lang].toString('utf8'), '# Test\n\n```js\nexport const version = "4.5.6";\n```\n');
});

test('images and reference links can be shared while link labels remain translated', () => {
  const image = '![Logo](https://example.com/logo.svg)';
  const links = '[docs]: https://example.com/docs\n  \"Documentation\"';
  const preamble = `>>>>> shared=logo\n${image}\n\n>>>>> shared=links\n${links}\n\n`;
  const labels = { en: 'Read', ru: 'Читать', zh: '阅读' };
  const body = bodySource(...Object.values(labels).map(label => `<<<<< include=logo\n\n[${label}][docs]\n\n<<<<< include=links\n`));
  const decoded = validateBodySourceShape('example', 1, preamble + body);
  for (const [lang, label] of Object.entries(labels)) assert.equal(decoded[lang], `${image}\n\n[${label}][docs]\n\n${links}\n`);
});

test('common lists and tables preserve internal blank lines and participate in parity checks', () => {
  const fragment = '- One\n- Two\n\n| A | B |\n|---|---|\n| 1 | 2 |';
  const body = '<<<<< include=table\n';
  const decoded = validateBodySourceShape('example', 1, `>>>>> shared=table\n${fragment}\n\n` + bodySource(body, body, body));
  assert.deepEqual(decoded, { en: fragment + '\n', ru: fragment + '\n', zh: fragment + '\n' });
  assert.deepEqual(checkSources([{ unit: 'example', parts: [decoded] }]).problems, []);
});

test('nested references outside code are rejected rather than leaked into generated Markdown', () => {
  const source = '>>>>> shared=outer\n<<<<< include=inner\n\n>>>>> shared=inner\n[Docs](https://example.com)\n\n';
  const body = '<<<<< include=outer\n';
  assert.throws(() => validateBodySourceShape('example', 1, source + bodySource(body, body, body)), Error);
});
