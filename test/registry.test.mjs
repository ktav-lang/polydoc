import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkDocsRegistry,
  classifyRegistered,
  defaultFrozenDocsLockPath,
  expectedGeneratedPaths,
  frozenSha256,
  internalEntryMatches,
  scanPublicMarkdown,
  writeFrozenDocsLock,
} from '../src/index.mjs';
import { write } from './helpers.mjs';

const REGISTRY = {
  generated: ['README.md', 'README.ru.md', 'README.zh.md', 'CHANGELOG.md', 'CHANGELOG.ru.md', 'CHANGELOG.zh.md'],
  frozen: ['versions/0.1/spec.md'],
  internal: ['versions/*/content/README.source.md', 'docs/notes/'],
};

function tempRoot() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-registry-'));
  fs.mkdirSync(path.join(temp, 'versions'));
  return temp;
}

test('internalEntryMatches: exact, prefix and one-segment wildcard shapes', () => {
  assert.equal(internalEntryMatches('README.md', 'README.md'), true);
  assert.equal(internalEntryMatches('README.md', 'CHANGELOG.md'), false);
  assert.equal(internalEntryMatches('docs/notes/x.md', 'docs/notes/'), true);
  assert.equal(internalEntryMatches('docs/other/x.md', 'docs/notes/'), false);
  assert.equal(internalEntryMatches('versions/0.9/content/README.source.md', 'versions/*/content/README.source.md'), true);
  assert.equal(internalEntryMatches('versions/0.9/extra/content/README.source.md', 'versions/*/content/README.source.md'), false);
});

test('classifyRegistered resolves exactly one category, or null when unregistered', () => {
  assert.equal(classifyRegistered(REGISTRY, 'README.md'), 'generated');
  assert.equal(classifyRegistered(REGISTRY, 'versions/0.1/spec.md'), 'frozen');
  assert.equal(classifyRegistered(REGISTRY, 'docs/notes/x.md'), 'internal');
  assert.equal(classifyRegistered(REGISTRY, 'GUIDE.md'), null);
});

test('expectedGeneratedPaths is derived from configured ROOT_DOCUMENTS/OUT_FILES/README_FILES', () => {
  // helpers.mjs configures rootDocuments: ['README', 'CHANGELOG'].
  const expected = expectedGeneratedPaths('versions/1.0');
  assert.deepEqual(expected, [
    'CHANGELOG.md', 'CHANGELOG.ru.md', 'CHANGELOG.zh.md',
    'README.md', 'README.ru.md', 'README.zh.md',
    'versions/1.0/content/README.md', 'versions/1.0/content/README.ru.md', 'versions/1.0/content/README.zh.md',
    'versions/1.0/spec.md', 'versions/1.0/spec.ru.md', 'versions/1.0/spec.zh.md',
  ].sort());
});

test('checkDocsRegistry flags a declared generated list that drifts from what the builder builds', () => {
  const temp = tempRoot();
  try {
    const wrongRegistry = { ...REGISTRY, generated: ['README.md'] }; // missing the rest
    const problems = checkDocsRegistry(temp, wrongRegistry, defaultFrozenDocsLockPath(temp, 'frozen.lock.json'), 'versions/1.0');
    assert.ok(problems.some((p) => /generated list does not match what the builder generates/.test(p)));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an unregistered public Markdown file at a public location is an error', () => {
  const temp = tempRoot();
  try {
    write(path.join(temp, 'GUIDE.md'), 'a well-meaning hand-kept guide\n');
    const registry = { generated: [], frozen: [], internal: [] };
    const problems = checkDocsRegistry(temp, registry, defaultFrozenDocsLockPath(temp, 'frozen.lock.json'), 'versions/1.0');
    assert.ok(problems.some((p) => /unregistered public Markdown file: GUIDE\.md/.test(p)));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a tree with no frozen documents and no lock has nothing to protect', () => {
  const temp = tempRoot();
  try {
    const registry = { generated: expectedGeneratedPaths('versions/1.0'), frozen: ['versions/0.1/spec.md'], internal: [] };
    const problems = checkDocsRegistry(temp, registry, defaultFrozenDocsLockPath(temp, 'frozen.lock.json'), 'versions/1.0');
    assert.deepEqual(problems, []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a frozen document on disk without a lock is an error, and writeFrozenDocsLock records it', async () => {
  const temp = tempRoot();
  try {
    write(path.join(temp, 'versions', '0.1', 'spec.md'), 'frozen contents\n');
    const registry = { generated: expectedGeneratedPaths('versions/1.0'), frozen: ['versions/0.1/spec.md'], internal: [] };
    const lockPath = defaultFrozenDocsLockPath(temp, 'frozen.lock.json');

    const before = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(before.some((p) => /frozen-docs lock is missing/.test(p)));

    await writeFrozenDocsLock(temp, registry, lockPath);
    const after = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.deepEqual(after, []);

    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(lock.files[0].sha256, frozenSha256(path.join(temp, 'versions', '0.1', 'spec.md')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a hand edit to a frozen document is caught against its lock hash', async () => {
  const temp = tempRoot();
  try {
    write(path.join(temp, 'versions', '0.1', 'spec.md'), 'original\n');
    const registry = { generated: [], frozen: ['versions/0.1/spec.md'], internal: [] };
    const lockPath = defaultFrozenDocsLockPath(temp, 'frozen.lock.json');
    await writeFrozenDocsLock(temp, registry, lockPath);

    fs.appendFileSync(path.join(temp, 'versions', '0.1', 'spec.md'), 'tampered\n');
    const problems = checkDocsRegistry(temp, registry, lockPath, 'versions/1.0');
    assert.ok(problems.some((p) => /versions\/0\.1\/spec\.md differs from its frozen-docs lock hash/.test(p)));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('scanPublicMarkdown finds files at the repo root, versions/<v>/(content/), and recursively under docs/', () => {
  const temp = tempRoot();
  try {
    write(path.join(temp, 'README.md'), 'x\n');
    write(path.join(temp, 'versions', '0.1', 'spec.md'), 'x\n');
    write(path.join(temp, 'versions', '0.1', 'content', 'README.md'), 'x\n');
    write(path.join(temp, 'versions', '0.1', 'content', 'not-scanned', 'ignored.md'), 'x\n');
    write(path.join(temp, 'docs', 'a', 'b', 'deep.md'), 'x\n');
    const found = scanPublicMarkdown(temp);
    assert.deepEqual(found, [
      'README.md',
      'docs/a/b/deep.md',
      'versions/0.1/content/README.md',
      'versions/0.1/spec.md',
    ].sort());
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
