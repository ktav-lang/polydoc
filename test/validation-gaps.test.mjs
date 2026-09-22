import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assembleRootDocUnits,
  buildRootDocs,
  checkDocsRegistry,
  checkRootDocs,
  checkSources,
  configure,
  defaultFrozenDocsLockPath,
  expectedGeneratedPaths,
  frozenSha256,
  rootDocUnitsDir,
  rootOutputName,
  validateContentDir,
  writeFrozenDocsLock,
} from '../src/index.mjs';
import {
  baseFixtures,
  bodySource,
  lockUnits,
  makeContent,
  metaJs,
  TEST_RELEASE,
  unitMeta,
  validate,
  write,
} from './helpers.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rootUnit(unitsDir, name, en = '# Title\n\nbody.\n', ru = '# Заголовок\n\nтекст.\n', zh = '# 标题\n\n正文。\n') {
  const dir = path.join(unitsDir, name);
  write(path.join(dir, 'meta.js'), metaJs(unitMeta('frontmatter')));
  write(path.join(dir, 'body-1.md'), bodySource(en, ru, zh));
}

function rootTree(repoRoot, doc = 'README', names = ['one']) {
  fs.mkdirSync(path.join(repoRoot, 'versions'), { recursive: true });
  const unitsDir = rootDocUnitsDir(repoRoot, doc);
  write(path.join(unitsDir, 'manifest.js'), metaJs(names));
  for (const name of names) rootUnit(unitsDir, name, `# ${name}\n\nbody.\n`, `# ${name} ru\n\nтекст.\n`, `# ${name} zh\n\n正文。\n`);
  return unitsDir;
}

function registryForFrozen(frozen) {
  return { generated: expectedGeneratedPaths('versions/1.0'), frozen, internal: [] };
}

function writeFrozenLock(lockPath, files) {
  write(lockPath, JSON.stringify({ format: 'ktav-frozen-docs', files }, null, 2) + '\n');
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

async function validateWithLock(lockValue, mutate) {
  const dir = tempDir('polydoc-section-lock-gap-');
  try {
    const fixtures = baseFixtures();
    makeContent(dir, fixtures, fixtures.map((u) => u.name));
    if (mutate) mutate(path.join(dir, 'content'));
    const lockPath = path.join(dir, 'section-inventory.lock.json');
    write(lockPath, JSON.stringify(lockValue, null, 2) + '\n');
    return await validateContentDir(path.join(dir, 'content'), {
      requireSectionInventoryLock: true,
      sectionInventoryLockPath: lockPath,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('content rejects missing, extra, and malformed body files', async () => {
  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      fs.rmSync(path.join(contentDir, 'sec-1', 'body-1.md'));
    }),
    /unit "sec-1": missing body-1\.md \(meta\.bodyParts is 1\)/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'sec-1', 'body-2.md'), bodySource('extra.\n', 'extra.\n', 'extra.\n'));
    }),
    /unit "sec-1": unexpected extra file body-2\.md beyond meta\.bodyParts 1/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'sec-1', 'body-01.md'), bodySource('odd.\n', 'odd.\n', 'odd.\n'));
    }),
    /unit "sec-1": unexpected body file\(s\) body-01\.md/);
});

test('content rejects malformed body source blocks and special entries', async () => {
  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'named-abstract', 'body-1.md'), 'not a language-block source\n');
    }),
    /unit "named-abstract": body-1\.md: no ">>>>> lang=" separator line found/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      fs.mkdirSync(path.join(contentDir, 'sec-1', 'nested'));
    }),
    /unit "sec-1": subdirectory "nested" is not allowed inside a unit directory/);
});

test('a symlink cannot stand in for the content manifest or a body file', async (t) => {
  const dir = tempDir('polydoc-content-symlink-gap-');
  try {
    const fixtures = baseFixtures();
    makeContent(dir, fixtures, fixtures.map((u) => u.name));
    const contentDir = path.join(dir, 'content');
    fs.rmSync(path.join(contentDir, 'manifest.js'));
    try {
      fs.symlinkSync(path.join(contentDir, 'release.js'), path.join(contentDir, 'manifest.js'), 'file');
      await assert.rejects(
        validateContentDir(contentDir),
        /manifest\.js is not a regular file \(symlinks, directories and other special entries are not allowed under content\/\)/);
    } catch (e) {
      if (!['EACCES', 'EPERM', 'ENOTSUP'].includes(e.code)) throw e;
      t.skip(`file symlinks unavailable: ${e.code}`);
      return;
    }

    fs.rmSync(path.join(contentDir, 'manifest.js'));
    write(path.join(contentDir, 'manifest.js'), metaJs(fixtures.map((u) => u.name)));
    const bodyPath = path.join(contentDir, 'sec-1', 'body-1.md');
    fs.rmSync(bodyPath);
    try {
      fs.symlinkSync(path.join(contentDir, 'README.source.md'), bodyPath, 'file');
      await assert.rejects(
        validateContentDir(contentDir),
        /unit "sec-1": entry "body-1\.md" is not a regular file/);
    } catch (e) {
      if (!['EACCES', 'EPERM', 'ENOTSUP'].includes(e.code)) throw e;
      t.skip(`file symlinks unavailable: ${e.code}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release.js requires canonical bytes and the exact release schema', async () => {
  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'release.js'), `export default ${JSON.stringify(TEST_RELEASE)}\n`);
    }),
    /release\.js must be byte-identical to the canonical serialization/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'release.js'), metaJs({ released: TEST_RELEASE.released, version: TEST_RELEASE.version }));
    }),
    /release\.js must have exactly the keys \{version, released\} in that order/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'release.js'), metaJs({ version: '4.5', released: TEST_RELEASE.released }));
    }),
    /release\.js field version must match/);

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      write(path.join(contentDir, 'release.js'), metaJs({ version: TEST_RELEASE.version, released: '2020-6-1' }));
    }),
    /release\.js field released must match/);
});

test('the section-inventory lock rejects canonical, version, missing, extra, and metadata drift', async () => {
  const fixtures = baseFixtures();
  const manifest = fixtures.map((u) => u.name);
  const units = lockUnits(fixtures, manifest);
  const valid = { format: 'polydoc-test-section-inventory', units, version: TEST_RELEASE.version };

  const dir = tempDir('polydoc-lock-canonical-gap-');
  try {
    makeContent(dir, fixtures, manifest);
    const lockPath = path.join(dir, 'section.lock.json');
    write(lockPath, JSON.stringify(valid));
    await assert.rejects(
      validateContentDir(path.join(dir, 'content'), { requireSectionInventoryLock: true, sectionInventoryLockPath: lockPath }),
      /must be canonical JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await assert.rejects(
    validateWithLock({ ...valid, version: '9.9.9' }),
    /section-inventory\.lock\.json must be version "4\.5\.6"/);

  await assert.rejects(
    validateWithLock({ ...valid, units: units.slice(0, 2) }),
    /section-inventory\.lock\.json does not match manifest\.js at index 2/);

  await assert.rejects(
    validateWithLock({ ...valid, units: [...units, { ...units[2], unit: 'sec-2', number: '2' }] }),
    /section-inventory\.lock\.json does not match manifest\.js at index 3/);

  await assert.rejects(
    validateWithLock({ ...valid, units: units.map((u) => u.unit === 'named-abstract' ? { ...u, level: 3 } : u) }),
    /structural record for unit "named-abstract" differs from meta\.js field "level"/);
});

test('content accepts the unit-tree README source and rejects two README sources', async () => {
  const result = await validate(baseFixtures(), undefined, (contentDir) => {
    fs.rmSync(path.join(contentDir, 'README.source.md'));
    const readmeDir = path.join(contentDir, 'readme-units');
    write(path.join(readmeDir, 'manifest.js'), metaJs(['intro']));
    rootUnit(readmeDir, 'intro', '# Readme\n\ncontent.\n', '# Readme ru\n\nсодержание.\n', '# Readme zh\n\n内容。\n');
  });
  assert.equal(result.readmes.en, '# Readme\n\ncontent.\n');

  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      const readmeDir = path.join(contentDir, 'readme-units');
      write(path.join(readmeDir, 'manifest.js'), metaJs(['intro']));
      rootUnit(readmeDir, 'intro');
    }),
    /both "README\.source\.md" and "readme-units\/manifest\.js" exist/);
});

test('root-document trees reject orphan, missing, and malformed units', () => {
  const orphan = tempDir('polydoc-root-orphan-unit-gap-');
  try {
    const unitsDir = rootTree(orphan);
    rootUnit(unitsDir, 'orphan');
    assert.throws(
      () => buildRootDocs(orphan, { rootMarker: 'versions' }),
      /unexpected directory "orphan" \(not in manifest\.js\)/);
  } finally {
    fs.rmSync(orphan, { recursive: true, force: true });
  }

  const missing = tempDir('polydoc-root-missing-unit-gap-');
  try {
    rootTree(missing);
    fs.rmSync(path.join(rootDocUnitsDir(missing, 'README'), 'one'), { recursive: true });
    assert.throws(
      () => buildRootDocs(missing, { rootMarker: 'versions' }),
      /manifest\.js lists unit "one" but its directory is missing/);
  } finally {
    fs.rmSync(missing, { recursive: true, force: true });
  }

  const malformed = tempDir('polydoc-root-malformed-unit-gap-');
  try {
    const unitsDir = rootTree(malformed);
    fs.rmSync(path.join(unitsDir, 'one', 'meta.js'));
    assert.throws(
      () => assembleRootDocUnits(unitsDir),
      /unit "one": missing meta\.js/);
    write(path.join(unitsDir, 'one', 'meta.js'), metaJs(unitMeta('frontmatter')));
    fs.mkdirSync(path.join(unitsDir, 'one', 'nested'));
    assert.throws(
      () => assembleRootDocUnits(unitsDir),
      /unit "one": entry "nested" is not a regular file/);
  } finally {
    fs.rmSync(malformed, { recursive: true, force: true });
  }
});

test('root-document checks report missing generated outputs and orphan artifacts', () => {
  const temp = tempDir('polydoc-root-output-gap-');
  try {
    rootTree(temp, 'README');
    const docs = buildRootDocs(temp);
    write(path.join(temp, rootOutputName('README', 'en')), docs.get('README').get('en'));
    write(path.join(temp, rootOutputName('README', 'ru')), docs.get('README').get('ru'));
    const missing = checkRootDocs(temp, docs);
    assert.deepEqual(missing.length, 1);
    assert.match(missing[0], /README\.zh\.md is missing or unreadable/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  const orphan = tempDir('polydoc-root-artifact-gap-');
  try {
    write(path.join(orphan, 'README.md'), 'orphan artifact\n');
    assert.throws(
      () => buildRootDocs(orphan),
      /root-docs\/README\/manifest\.js is missing, but README\.md exist/);
  } finally {
    fs.rmSync(orphan, { recursive: true, force: true });
  }
});

test('registry reports ambiguous categories instead of choosing one', () => {
  const temp = tempDir('polydoc-registry-ambiguous-gap-');
  try {
    write(path.join(temp, 'README.md'), 'generated\n');
    const registry = { generated: expectedGeneratedPaths('versions/1.0'), frozen: [], internal: ['README.md'] };
    const problems = checkDocsRegistry(temp, registry, defaultFrozenDocsLockPath(temp, 'frozen.lock.json'), 'versions/1.0');
    assert.deepEqual(problems, ['README.md is registered in more than one category (generated, internal)']);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('frozen lock reports missing, extra, unsorted, malformed, and mismatched entries', async () => {
  const temp = tempDir('polydoc-registry-lock-gap-');
  try {
    const first = 'versions/0.1/spec.md';
    const second = 'versions/0.2/spec.md';
    write(path.join(temp, first), 'first\n');
    write(path.join(temp, second), 'second\n');
    const registry = registryForFrozen([first, second]);
    const lockPath = defaultFrozenDocsLockPath(temp, 'frozen.lock.json');

    writeFrozenLock(lockPath, [{ path: first, sha256: frozenSha256(path.join(temp, first)) }]);
    let problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /missing from the lock: versions\/0\.2\/spec\.md/.test(p)));

    writeFrozenLock(lockPath, [
      { path: first, sha256: frozenSha256(path.join(temp, first)) },
      { path: second, sha256: frozenSha256(path.join(temp, second)) },
      { path: 'versions/0.3/spec.md', sha256: 'extra' },
    ]);
    problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /in the lock but not registered as frozen: versions\/0\.3\/spec\.md/.test(p)));

    writeFrozenLock(lockPath, [
      { path: second, sha256: frozenSha256(path.join(temp, second)) },
      { path: first, sha256: frozenSha256(path.join(temp, first)) },
    ]);
    problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /files are not sorted by path/.test(p)));

    writeFrozenLock(lockPath, [
      { path: first, sha256: 'wrong' },
      { path: second, sha256: frozenSha256(path.join(temp, second)) },
    ]);
    problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /versions\/0\.1\/spec\.md differs from its frozen-docs lock hash/.test(p)));

    write(lockPath, '{"format":"ktav-frozen-docs","files":[]}');
    problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /is not canonical JSON/.test(p)));

    await writeFrozenDocsLock(temp, registry, lockPath);
    assert.deepEqual(checkDocsRegistry(temp, registry, lockPath, 'versions/1.0'), []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('content validation follows configured README output and source names', async () => {
  const root = tempDir('polydoc-configured-readme-gap-');
  const readmeFiles = { en: 'Guide.md', ru: 'Guide.ru.md', zh: 'Guide.zh.md' };
  try {
    configure({
      langs: ['en', 'ru', 'zh'],
      outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
      readmeFileNames: readmeFiles,
      readmeSourceFile: 'Guide.source.md',
      sectionInventoryLockFormat: 'polydoc-test-section-inventory',
      rootDocuments: ['README', 'CHANGELOG'],
    });
    const fixtures = baseFixtures();
    makeContent(root, fixtures, fixtures.map((u) => u.name));
    const contentDir = path.join(root, 'content');
    for (const file of Object.values(readmeFiles)) write(path.join(contentDir, file), 'generated\n');
    const result = await validateContentDir(contentDir);
    assert.equal(result.readmes.en.startsWith('# content README'), true);
  } finally {
    restoreConfig();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checkSources uses the first configured language as its reference language', () => {
  try {
    configure({ langs: ['de', 'fr'] });
    const { problems } = checkSources([{
      unit: 'abschnitt-1',
      parts: [{ de: 'text\n', fr: '  texte\n' }],
    }]);
    assert.deepEqual(problems, [
      'abschnitt-1 part 1: fr indents by 2, which de never uses and no list marker in the block justifies',
    ]);
  } finally {
    restoreConfig();
  }
});
