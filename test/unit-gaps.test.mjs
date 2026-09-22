import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  LANGS,
  OUT_FILES,
  README_FILES,
  ROOT_DOCUMENTS,
  SECTION_INVENTORY_LOCK_FORMAT,
  bodyFileName,
  bodySplitPlan,
  checkSources,
  configure,
  decodeUtf8Strict,
  defaultSectionInventoryLockPath,
  findHeadings,
  langSeparator,
  minorLineOf,
  readCanonicalJson,
  readJsonDefault,
  readRelease,
  readUnits,
  requireConfigured,
  splitPlan,
  validateContentDir,
  validateSectionInventoryLock,
  writeSectionInventoryLock,
} from '../src/index.mjs';
import {
  TEST_RELEASE,
  baseFixtures,
  bodySource,
  makeContent,
  metaJs,
  validate,
  write,
} from './helpers.mjs';

function tempRoot(prefix = 'polydoc-unit-gap-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function canonicalDefault(value) {
  return `export default ${JSON.stringify(value, null, 2)}\n`;
}

function restoreConfig() {
  configure({
    langs: ['en', 'ru', 'zh'],
    outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
    readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' },
    sectionInventoryLockFormat: 'polydoc-test-section-inventory',
    rootDocuments: ['README', 'CHANGELOG'],
  });
}

test('configure validates its contract, updates live bindings, and path helpers stay rooted', () => {
  assert.throws(() => configure({ langs: [] }), /langs must be a non-empty array/);
  assert.throws(() => configure({ langs: ['en', 'en'] }), /unique non-empty strings/);
  assert.throws(() => configure({ langs: ['en', 'ru'], outFileNames: { en: 'spec.md' } }),
    /outFileNames\.ru must be a non-empty string/);
  assert.throws(() => configure({ langs: ['en', 'ru'], readmeFileNames: { en: 'README.md' } }),
    /readmeFileNames\.ru must be a non-empty string/);
  assert.throws(() => configure({ langs: ['en'], rootDocuments: [''] }),
    /rootDocuments must be an array of non-empty strings/);

  const root = tempRoot();
  try {
    configure({
      langs: ['en', 'fr'],
      outFileNames: { en: 'spec.md', fr: 'spec.fr.md' },
      readmeFileNames: { en: 'README.md', fr: 'README.fr.md' },
      readmeSourceFile: 'README.source.custom.md',
      sectionInventoryLockFormat: 'custom-lock',
      rootDocuments: ['README'],
    });
    assert.deepEqual([...LANGS], ['en', 'fr']);
    assert.deepEqual(OUT_FILES, { en: 'spec.md', fr: 'spec.fr.md' });
    assert.deepEqual(README_FILES, { en: 'README.md', fr: 'README.fr.md' });
    assert.deepEqual(ROOT_DOCUMENTS, ['README']);
    assert.equal(SECTION_INVENTORY_LOCK_FORMAT, 'custom-lock');
    assert.equal(
      defaultSectionInventoryLockPath(path.join(root, 'versions', '1.0', 'content'), 'inventory.json'),
      path.join(root, 'scripts', 'locks', 'inventory.json'));
    assert.equal(bodyFileName(7), 'body-7.md');
    assert.equal(langSeparator('fr'), '>>>>> lang=fr');
    assert.equal(minorLineOf('12.34.5'), '12.34.x');
  } finally {
    restoreConfig();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('requireConfigured fails before setup in a fresh process', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { requireConfigured } from './src/index.mjs'; requireConfigured();",
  ], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configure\(\{ langs: \[\.\.\.\], \.\.\. \}\) must be called before use/);
});

test('strict JSON readers accept canonical data and reject malformed, non-canonical, BOM, and executable-looking input', () => {
  const root = tempRoot();
  try {
    const defaultPath = path.join(root, 'meta.js');
    const value = { kind: 'frontmatter', bodyParts: 1 };
    write(defaultPath, canonicalDefault(value));
    assert.deepEqual(readJsonDefault(defaultPath), value);

    const jsonPath = path.join(root, 'lock.json');
    write(jsonPath, `${JSON.stringify(value, null, 2)}\n`);
    assert.deepEqual(readCanonicalJson(jsonPath), value);

    write(defaultPath, 'export default {"a": 1, "a": 2}\n');
    assert.throws(() => readJsonDefault(defaultPath), /byte-identical to the canonical serialization/);
    write(defaultPath, 'export default {\n  "a": 1\n};\n');
    assert.throws(() => readJsonDefault(defaultPath), /JSON\.parse failed/);
    write(defaultPath, 'export default {"a": 1}\r\n');
    assert.throws(() => readJsonDefault(defaultPath), /byte-identical to the canonical serialization/);
    write(defaultPath, 'export default {"a": 1}\n globalThis.pwned = true;\n');
    assert.throws(() => readJsonDefault(defaultPath), /JSON\.parse failed/);
    assert.equal(globalThis.pwned, undefined);

    write(jsonPath, '{\n"a": 1\n}\n');
    assert.throws(() => readCanonicalJson(jsonPath), /must be canonical JSON/);
    fs.writeFileSync(defaultPath, Buffer.from([0x65, 0x78, 0x70, 0x6f, 0x72, 0x74, 0x20, 0x64, 0x65, 0x66, 0x61, 0x75, 0x6c, 0x74, 0x20, 0xc3, 0x28]));
    assert.throws(() => readJsonDefault(defaultPath), /not valid UTF-8/);
    fs.writeFileSync(defaultPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(canonicalDefault(value))]));
    assert.throws(() => readJsonDefault(defaultPath), /byte-order mark/);
    assert.throws(() => decodeUtf8Strict(Buffer.from([0xc3, 0x28]), 'payload'), /not valid UTF-8/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('raw CR and invalid source shapes are rejected before content is built', async () => {
  const fx = baseFixtures();
  await assert.rejects(validate(fx, undefined, (contentDir) => {
    const bodyPath = path.join(contentDir, 'sec-1', 'body-1.md');
    fs.writeFileSync(bodyPath, Buffer.from(fs.readFileSync(bodyPath).toString().replace('\n', '\r\n')));
  }), /contains a raw carriage return .*byte offset/);

  await assert.rejects(validate(fx, undefined, (contentDir) => {
    write(path.join(contentDir, 'sec-1', 'body-1.md'), 'not a heading\n');
  }), /body-1\.md: no ">>>>> lang=" separator line found/);

  await assert.rejects(validate(fx, undefined, (contentDir) => {
    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      '>>>>> lang=en\ntext\n>>>>> lang=en\ntext\n>>>>> lang=ru\ntext\n>>>>> lang=zh\ntext\n');
  }), /duplicate separator/);

  await assert.rejects(validate(fx, undefined, (contentDir) => {
    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      bodySource('text\n', 'text\n', 'text\n').replace('>>>>> lang=zh', '>>>>> lang=xx'));
  }), /unexpected language block\(s\) xx/);
});

test('negative meta validation covers kind, keys, ranges, names, and headings', async () => {
  const cases = [
    [() => { const fx = baseFixtures(); fx[1].meta.kind = 'script'; return fx; }, /bad kind/],
    [() => { const fx = baseFixtures(); fx[1].meta.bodyParts = 0; return fx; }, /bad bodyParts/],
    [() => { const fx = baseFixtures(); fx[1].meta.extra = true; return fx; }, /unexpected key/],
    [() => { const fx = baseFixtures(); fx[1].meta.title.en = ''; return fx; }, /missing\/empty title\.en/],
    [() => { const fx = baseFixtures(); fx[1].meta.level = 1; return fx; }, /named unit level must be 2\.\.6/],
    [() => { const fx = baseFixtures(); fx[2].meta.number = '1x'; return fx; }, /bad number/],
    [() => { const fx = baseFixtures(); fx[2].meta.sep = '- '; return fx; }, /bad sep/],
    [() => { const fx = baseFixtures(); fx[2].name = 'sec-9'; return fx; }, /unit name does not match sec-1/],
  ];
  for (const [make, pattern] of cases) await assert.rejects(validate(make()), pattern);

  const fx = baseFixtures();
  await assert.rejects(validate(fx, undefined, (contentDir) => {
    write(path.join(contentDir, 'sec-1', 'body-1.md'), bodySource(
      '# forbidden\n', '# forbidden\n', '# forbidden\n'));
  }), /unit body contains an ATX heading/);
});

test('readRelease rejects negative object, key, version, and date forms', () => {
  const cases = [
    [{ version: '1.2.3' }, /exactly the keys/],
    [{ version: '1.2.3', released: '2020-01-01', extra: true }, /exactly the keys/],
    [{ version: 'v1.2.3', released: '2020-01-01' }, /field version must match/],
    [{ version: '1.2.3', released: '2020-1-1' }, /field released must match/],
    [[], /must export an object/],
  ];
  for (const [value, pattern] of cases) {
    const root = tempRoot();
    try {
      write(path.join(root, 'release.js'), canonicalDefault(value));
      assert.throws(() => readRelease(root), pattern);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('section inventory lock writing records real metadata and validation catches drift', async () => {
  const root = tempRoot();
  try {
    const fixtures = baseFixtures();
    makeContent(root, fixtures, fixtures.map((u) => u.name));
    const contentDir = path.join(root, 'content');
    const lockPath = path.join(root, 'scripts', 'locks', 'section-inventory.json');
    await writeSectionInventoryLock(contentDir, lockPath, TEST_RELEASE);
    assert.equal(fs.existsSync(lockPath), true);
    const before = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(before);
    assert.equal(lock.format, 'polydoc-test-section-inventory');
    assert.equal(lock.version, TEST_RELEASE.version);
    assert.deepEqual(lock.units.map((u) => u.unit), ['frontmatter', 'named-abstract', 'sec-1']);
    assert.deepEqual(lock.units[2], {
      unit: 'sec-1', kind: 'numbered', number: '1', level: 2, sep: '. ',
    });
    validateSectionInventoryLock(lock.units.map((u) => u.unit), lockPath, null, TEST_RELEASE.version);
    await writeSectionInventoryLock(contentDir, lockPath, TEST_RELEASE);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), before);

    const wrongVersion = { ...lock, version: '9.9.9' };
    write(lockPath, JSON.stringify(wrongVersion, null, 2) + '\n');
    assert.throws(() => validateSectionInventoryLock(lock.units.map((u) => u.unit), lockPath, null, TEST_RELEASE.version), /must be version/);
    const wrongFormat = { ...lock, format: 'other' };
    write(lockPath, JSON.stringify(wrongFormat, null, 2) + '\n');
    assert.throws(() => validateSectionInventoryLock(lock.units.map((u) => u.unit), lockPath, null, TEST_RELEASE.version), /unsupported format/);
    const duplicate = { ...lock, units: [lock.units[0], lock.units[0], ...lock.units.slice(2)] };
    write(lockPath, JSON.stringify(duplicate, null, 2) + '\n');
    assert.throws(() => validateSectionInventoryLock(lock.units.map((u) => u.unit), lockPath, null, TEST_RELEASE.version), /unique unit names/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('split plans handle no boundary, exact boundaries, repeated blanks, and Unicode offsets', () => {
  assert.deepEqual(splitPlan('one\ntwo\n', 2, 4), {
    lineCount: 2, blankLineCount: 0, cuts: [], cutIndices: [], boundaryOffsets: [],
  });
  assert.deepEqual(splitPlan('alpha\n\nbeta\n', 2, 4), {
    lineCount: 3, blankLineCount: 1, cuts: [7], cutIndices: [0], boundaryOffsets: [7],
  });
  assert.deepEqual(splitPlan('a\n\nb\n\nc\n', 3, 6).cuts, [3, 6]);
  assert.deepEqual(splitPlan('😀\n\nx\n', 2, 2).cuts, [4]);

  const parts = [{
    en: `first\n\n${Array.from({ length: 39 }, (_, i) => `en-${i}\n`).join('')}`,
    ru: `первый\n\n${Array.from({ length: 39 }, (_, i) => `ru-${i}\n`).join('')}`,
    zh: `第一\n\n${Array.from({ length: 39 }, (_, i) => `zh-${i}\n`).join('')}`,
  }];
  const plan = bodySplitPlan(parts);
  assert.equal(plan.partCount, 2);
  assert.equal(plan.reference, 'en');
  assert.deepEqual(plan.cutIndices, [0]);
  assert.equal(plan.plans.en.cuts[0], 'first\n\n'.length);
  assert.equal(plan.plans.ru.cuts[0], 'первый\n\n'.length);
  assert.equal(plan.plans.zh.cuts[0], '第一\n\n'.length);
});

test('findHeadings handles links, all HTML opener families, tabs, list markers, fences, and Unicode', () => {
  assert.deepEqual(findHeadings('[ref]: /url "title"\n\n# real\n').map((h) => [h.type, h.line, h.raw]), [
    ['ATX', 3, '# real'],
  ]);
  assert.equal(findHeadings('inline [link](https://example.test)\n# title\n')[0].raw, '# title');

  const htmlOpeners = [
    ['<script>', 1], ['<!--', 2], ['<?xml version="1.0"?>', 3],
    ['<!DOCTYPE html>', 4], ['<![CDATA[', 5], ['<div>', 6], ['<custom data="x">', 7],
  ];
  for (const [opener, type] of htmlOpeners) {
    const heading = findHeadings(`${opener}\n`)[0];
    assert.equal(heading.type, 'HTML', opener);
    assert.equal(heading.htmlType, type, opener);
    assert.equal(heading.raw, opener, opener);
  }

  const indented = findHeadings('    # code\n\t# code\n   # heading\n');
  assert.deepEqual(indented.map((h) => h.raw), ['   # heading']);
  const lists = findHeadings('1) item\n2. # ordered\n- # bullet\n+ # plus\n');
  assert.deepEqual(lists.map((h) => [h.raw, h.container]), [
    ['2. # ordered', 'root/list-1'],
    ['- # bullet', 'root/list-2'],
    ['+ # plus', 'root/list-3'],
  ]);
  assert.deepEqual(findHeadings('~~~js\n# hidden\n~~~\n# shown\n').map((h) => h.raw), ['# shown']);
  assert.equal(findHeadings('# Заголовок 😀\n')[0].raw, '# Заголовок 😀');
});

test('readUnits reads nested filesystem units in numeric body order and feeds checkSources', () => {
  const root = tempRoot();
  try {
    const contentDir = path.join(root, 'content');
    write(path.join(contentDir, 'manifest.js'), metaJs(['group/sec-1']));
    const unitDir = path.join(contentDir, 'group', 'sec-1');
    write(path.join(unitDir, 'body-2.md'), bodySource('tail\n', 'хвост\n', '尾部\n'));
    write(path.join(unitDir, 'body-1.md'), bodySource('- one\n', '- один\n', '- 一\n'));
    const units = readUnits(contentDir);
    assert.equal(units.length, 1);
    assert.equal(units[0].unit, 'group/sec-1');
    assert.deepEqual(units[0].parts, [
      { en: '- one\n', ru: '- один\n', zh: '- 一\n' },
      { en: 'tail\n', ru: 'хвост\n', zh: '尾部\n' },
    ]);
    assert.deepEqual(checkSources(units), { problems: [], notes: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
