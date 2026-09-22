import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ROOT_DOCUMENTS,
  buildRootDocs,
  checkRootDocs,
  rootDocUnitsDir,
  rootOutputName,
  writeRootDocs,
} from '../src/index.mjs';
import { bodySource, metaJs, unitMeta, write } from './helpers.mjs';

function writeUnit(unitsDir, name, bodies, bodyParts = 1) {
  const dir = path.join(unitsDir, name);
  write(path.join(dir, 'meta.js'), metaJs(unitMeta('frontmatter', { bodyParts })));
  bodies.forEach((body, i) => {
    write(path.join(dir, `body-${i + 1}.md`), bodySource(...body));
  });
}

function writeSingleUnitDoc(repoRoot, doc, en, ru, zh) {
  const unitsDir = rootDocUnitsDir(repoRoot, doc);
  write(path.join(unitsDir, 'manifest.js'), metaJs(['only']));
  writeUnit(unitsDir, 'only', [[en, ru, zh]]);
}

const sampleText = (doc, lang) => `# ${doc} ${lang}\n\nbody for ${lang}.\n`;

function tempRoot(withMarker) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-rootdocs-'));
  if (withMarker) fs.mkdirSync(path.join(temp, 'versions'));
  return temp;
}

test('a root document assembled from units generates one file per language, byte for byte', () => {
  const temp = tempRoot(true);
  try {
    writeSingleUnitDoc(temp, 'README', sampleText('README', 'en'), sampleText('README', 'ru'), sampleText('README', 'zh'));
    const docs = buildRootDocs(temp, { rootMarker: 'versions' });
    writeRootDocs(temp, docs);
    for (const lang of ['en', 'ru', 'zh']) {
      assert.equal(
        fs.readFileSync(path.join(temp, rootOutputName('README', lang)), 'utf8'),
        sampleText('README', lang));
    }
    assert.deepEqual(checkRootDocs(temp, docs), []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a hand edit to a generated root document is reported by the check', () => {
  const temp = tempRoot(true);
  try {
    writeSingleUnitDoc(temp, 'CHANGELOG', sampleText('CHANGELOG', 'en'), sampleText('CHANGELOG', 'ru'), sampleText('CHANGELOG', 'zh'));
    const docs = buildRootDocs(temp, { rootMarker: 'versions' });
    writeRootDocs(temp, docs);
    const victim = path.join(temp, rootOutputName('CHANGELOG', 'ru'));
    fs.writeFileSync(victim, `${fs.readFileSync(victim, 'utf8')}hand edit\n`);

    const problems = checkRootDocs(temp, docs);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /CHANGELOG\.ru\.md differs from what root-docs\/CHANGELOG\/ generates/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an artifact whose unit tree is gone fails rather than being left unverifiable', () => {
  const temp = tempRoot(true);
  write(path.join(temp, rootOutputName('README', 'en')), 'orphan\n');
  write(path.join(temp, rootOutputName('README', 'ru')), 'сирота\n');
  try {
    assert.throws(() => buildRootDocs(temp, { rootMarker: 'versions' }), (e) =>
      /root-docs\/README\/manifest\.js is missing, but README\.md, README\.ru\.md exist/.test(e.message));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('rootMarker gates generation — a tree without it generates nothing at all', () => {
  const temp = tempRoot(false);
  try {
    write(path.join(temp, 'README.md'), 'unrelated project\n');
    assert.equal(buildRootDocs(temp, { rootMarker: 'versions' }).size, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('buildRootDocs without a rootMarker option always attempts generation', () => {
  const temp = tempRoot(false); // deliberately no versions/ marker
  try {
    writeSingleUnitDoc(temp, 'README', sampleText('README', 'en'), sampleText('README', 'ru'), sampleText('README', 'zh'));
    const docs = buildRootDocs(temp); // no options at all
    assert.equal(docs.size >= 1, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('every configured root document is actually generated', () => {
  const temp = tempRoot(true);
  try {
    for (const doc of ROOT_DOCUMENTS) {
      writeSingleUnitDoc(temp, doc, sampleText(doc, 'en'), sampleText(doc, 'ru'), sampleText(doc, 'zh'));
    }
    const docs = buildRootDocs(temp, { rootMarker: 'versions' });
    assert.deepEqual([...docs.keys()], [...ROOT_DOCUMENTS]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('release-token substitution is opt-in via options.release', () => {
  const temp = tempRoot(true);
  try {
    writeSingleUnitDoc(temp, 'README',
      'Version @@VERSION@@ released @@DATE@@.\n',
      'Версия @@VERSION@@.\n', '版本 @@VERSION@@。\n');
    const withoutRelease = buildRootDocs(temp, { rootMarker: 'versions' });
    assert.match(withoutRelease.get('README').get('en').toString('utf8'), /@@VERSION@@/);

    const withRelease = buildRootDocs(temp, {
      rootMarker: 'versions', release: { version: '9.9.9', released: '2030-01-01' },
    });
    assert.match(withRelease.get('README').get('en').toString('utf8'), /Version 9\.9\.9 released 2030-01-01\./);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a root-document unit with a non-frontmatter kind is rejected', () => {
  const temp = tempRoot(true);
  try {
    const unitsDir = rootDocUnitsDir(temp, 'CHANGELOG');
    write(path.join(unitsDir, 'manifest.js'), metaJs(['named-only']));
    const dir = path.join(unitsDir, 'named-only');
    write(path.join(dir, 'meta.js'), metaJs(unitMeta('named')));
    write(path.join(dir, 'body-1.md'), bodySource('en.\n', 'ru.\n', 'zh.\n'));

    assert.throws(() => buildRootDocs(temp, { rootMarker: 'versions' }), /must have kind "frontmatter"/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('the shared non-last-unit trailing-newline rule applies across root-doc unit boundaries', () => {
  const temp = tempRoot(true);
  try {
    const unitsDir = rootDocUnitsDir(temp, 'CHANGELOG');
    write(path.join(unitsDir, 'manifest.js'), metaJs(['first', 'second']));
    writeUnit(unitsDir, 'first', [['no blank line after.\n', 'без пустой строки.\n', '后面没有空行。\n']]);
    writeUnit(unitsDir, 'second', [['tail.\n', 'хвост.\n', '尾部。\n']]);

    assert.throws(() => buildRootDocs(temp, { rootMarker: 'versions' }),
      /non-last unit's final chunk must end with "\\n\\n"/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
