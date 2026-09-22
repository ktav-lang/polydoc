import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  TRANSACTION_JOURNAL_FILE,
  TRANSACTION_LOCK_FILE,
  TRANSACTION_LOCK_VERSION,
  buildBuffers,
  buildRootDocs,
  checkBuildOutputs,
  checkDocsRegistry,
  checkRootDocs,
  defaultFrozenDocsLockPath,
  expectedGeneratedPaths,
  pendingTransactionPaths,
  rootDocUnitsDir,
  rootOutputName,
  recoverBuildOutputTransaction,
  writeBuildOutputs,
  writeRootDocs,
} from '../src/index.mjs';
import { baseFixtures, bodySource, makeContent, metaJs, unitMeta, write } from './helpers.mjs';

const fixtureScript = fileURLToPath(new URL('../test-support/write-outputs.mjs', import.meta.url));
const LANGS = ['en', 'ru', 'zh'];
const OUTPUTS = [
  ['spec', 'spec.md'], ['spec', 'spec.ru.md'], ['spec', 'spec.zh.md'],
  ['content', 'README.md'], ['content', 'README.ru.md'], ['content', 'README.zh.md'],
];
const hex = 'a'.repeat(32);
const CRASH_INCARNATION = 'c'.repeat(32);
const RECOVERY_INCARNATION = 'd'.repeat(32);

function tempRoot(prefix = 'polydoc-e2e-gap-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function freshFixture() {
  const specDir = tempRoot();
  const contentDir = path.join(specDir, 'content');
  const fixtures = baseFixtures();
  makeContent(specDir, fixtures, fixtures.map((u) => u.name));
  return { specDir, contentDir };
}

function existingFixture() {
  const fixture = freshFixture();
  for (const name of ['README.md', 'README.ru.md', 'README.zh.md']) {
    write(path.join(fixture.contentDir, name), '# old README\n');
  }
  return fixture;
}

function outputPaths(specDir, contentDir) {
  return OUTPUTS.map(([root, name]) => path.join(root === 'spec' ? specDir : contentDir, name));
}

function runCrash(specDir, contentDir, variable, value) {
  const result = spawnSync(process.execPath, [fixtureScript, specDir, contentDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      [variable]: value,
      KTAV_TEST_PROCESS_INCARNATION: CRASH_INCARNATION,
    },
  });
  assert.notEqual(result.status, 0, `child must be killed at ${variable}=${value}`);
  return result;
}

function runCrashAfterCommit(specDir, contentDir) {
  const result = spawnSync(process.execPath, [fixtureScript, specDir, contentDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KTAV_BUILD_SPEC_CRASH_AFTER_COMMIT: '1',
      KTAV_TEST_PROCESS_INCARNATION: CRASH_INCARNATION,
    },
  });
  assert.notEqual(result.status, 0, 'child must be killed after the committed snapshot');
}

async function exitedPid() {
  const child = spawn(process.execPath, ['-e', '']);
  const pid = child.pid;
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(signal, null);
  return pid;
}

function writeRootUnit(repoRoot, doc, texts) {
  const unitsDir = rootDocUnitsDir(repoRoot, doc);
  const unitDir = path.join(unitsDir, 'only');
  write(path.join(unitsDir, 'manifest.js'), metaJs(['only']));
  write(path.join(unitDir, 'meta.js'), metaJs(unitMeta('frontmatter')));
  write(path.join(unitDir, 'body-1.md'), bodySource(...texts));
}

test('a first-ever install crash leaves no output after recovery', async () => {
  const { specDir, contentDir } = freshFixture();
  try {
    runCrash(specDir, contentDir, 'KTAV_BUILD_SPEC_CRASH_BEFORE_FIRST_JOURNAL', '1');
    assert.notDeepEqual(pendingTransactionPaths(specDir, contentDir), []);

    await recoverBuildOutputTransaction(specDir, contentDir, {
      processIncarnation: RECOVERY_INCARNATION,
    });

    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
    for (const filePath of outputPaths(specDir, contentDir)) {
      assert.equal(fs.existsSync(filePath), false, `${filePath} must remain absent`);
    }
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a crash after the final install can recover the durable post-commit state', async () => {
  const { specDir, contentDir } = existingFixture();
  try {
    const firstBuild = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, firstBuild);
    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      bodySource('end v2.\n', 'конец v2.\n', '结束 v2.\n'));
    write(path.join(contentDir, 'README.source.md'),
      bodySource('# README v2\n', '# README v2\n', '# README v2\n'));
    const secondBuild = await buildBuffers(contentDir);

    await runCrashAfterCommit(specDir, contentDir);
    assert.notDeepEqual(pendingTransactionPaths(specDir, contentDir), []);
    assert.deepEqual(outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p)), [
      secondBuild.bufs.en, secondBuild.bufs.ru, secondBuild.bufs.zh,
      secondBuild.readmeBufs.en, secondBuild.readmeBufs.ru, secondBuild.readmeBufs.zh,
    ]);

    await recoverBuildOutputTransaction(specDir, contentDir);

    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, secondBuild));
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
    assert.deepEqual(outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p)), [
      secondBuild.bufs.en, secondBuild.bufs.ru, secondBuild.bufs.zh,
      secondBuild.readmeBufs.en, secondBuild.readmeBufs.ru, secondBuild.readmeBufs.zh,
    ]);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a stale lock owner is reclaimed by a later real writer', async () => {
  const { specDir, contentDir } = freshFixture();
  try {
    const stalePid = await exitedPid();
    write(path.join(specDir, TRANSACTION_LOCK_FILE), JSON.stringify({
      format: 'ktav-build-output-lock',
      version: TRANSACTION_LOCK_VERSION,
      pid: stalePid,
      incarnation: hex,
      nonce: 'b'.repeat(32),
      leaseUntil: Date.now() + 60_000,
    }) + '\n');
    const build = await buildBuffers(contentDir);

    await writeBuildOutputs(specDir, contentDir, build);

    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, build));
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('malformed journal metadata is rejected without changing outputs', async () => {
  const { specDir, contentDir } = existingFixture();
  try {
    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, build);
    const before = outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p));
    write(path.join(specDir, TRANSACTION_JOURNAL_FILE), '{"phase":"installing"}\n');

    assert.throws(
      () => recoverBuildOutputTransaction(specDir, contentDir),
      /transaction journal has an invalid schema; ambiguous data was left untouched/);

    assert.deepEqual(outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p)), before);
    assert.equal(fs.existsSync(path.join(specDir, TRANSACTION_JOURNAL_FILE)), true);
    assert.equal(fs.existsSync(path.join(specDir, TRANSACTION_LOCK_FILE)), false);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('corrupt lock metadata blocks writing and remains untouched', async () => {
  const { specDir, contentDir } = freshFixture();
  try {
    const build = await buildBuffers(contentDir);
    const lockPath = path.join(specDir, TRANSACTION_LOCK_FILE);
    write(lockPath, '{not-json}\n');

    assert.throws(() => writeBuildOutputs(specDir, contentDir, build),
      /transaction lock is corrupt/);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), '{not-json}\n');
    for (const filePath of outputPaths(specDir, contentDir)) {
      assert.equal(fs.existsSync(filePath), false, `${filePath} must not be installed`);
    }
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('missing and mismatched spec/readme outputs are all detected by check mode', async () => {
  const { specDir, contentDir } = existingFixture();
  try {
    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, build);

    fs.rmSync(path.join(specDir, 'spec.ru.md'));
    assert.throws(() => checkBuildOutputs(specDir, contentDir, build), /MISMATCH in spec\.ru\.md/);
    await writeBuildOutputs(specDir, contentDir, build);
    fs.rmSync(path.join(contentDir, 'README.zh.md'));
    assert.throws(() => checkBuildOutputs(specDir, contentDir, build), /README\.zh\.md.*missing/);

    await writeBuildOutputs(specDir, contentDir, build);
    write(path.join(specDir, 'spec.zh.md'), 'wrong\n');
    assert.throws(() => checkBuildOutputs(specDir, contentDir, build), /MISMATCH in spec\.zh\.md/);
    await writeBuildOutputs(specDir, contentDir, build);
    write(path.join(contentDir, 'README.ru.md'), 'wrong\n');
    assert.throws(() => checkBuildOutputs(specDir, contentDir, build), /MISMATCH in README\.ru\.md/);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('modified content rewrites every language and readme output atomically', async () => {
  const { specDir, contentDir } = existingFixture();
  try {
    const firstBuild = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, firstBuild);
    const before = outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p));

    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      bodySource('end changed.\n', 'конец changed.\n', '结束 changed.\n'));
    write(path.join(contentDir, 'README.source.md'),
      bodySource('# content README changed\n', '# content README changed\n', '# content README changed\n'));
    const secondBuild = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, secondBuild);

    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, secondBuild));
    const after = outputPaths(specDir, contentDir).map((p) => fs.readFileSync(p));
    assert.deepEqual(after, [
      secondBuild.bufs.en, secondBuild.bufs.ru, secondBuild.bufs.zh,
      secondBuild.readmeBufs.en, secondBuild.readmeBufs.ru, secondBuild.readmeBufs.zh,
    ]);
    assert.equal(after.every((bytes, index) => !bytes.equals(before[index])), true);
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('write mode refuses unsafe destinations and roots', async (t) => {
  const { specDir, contentDir } = freshFixture();
  try {
    const build = await buildBuffers(contentDir);
    const sibling = path.join(specDir, 'sibling');
    fs.mkdirSync(sibling);
    assert.throws(() => writeBuildOutputs(specDir, sibling, build),
      /contentDir .* must resolve to the expected child/);

    const outside = path.join(specDir, 'outside.md');
    write(outside, 'outside\n');
    const destination = path.join(specDir, 'spec.md');
    try {
      fs.symlinkSync(outside, destination);
    } catch (error) {
      if (!['EACCES', 'EPERM', 'ENOTSUP'].includes(error.code)) throw error;
      t.skip('symlinks are unavailable on this platform');
      return;
    }
    assert.throws(() => writeBuildOutputs(specDir, contentDir, build),
      /output destination .* is not a regular file \(symlink/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'outside\n');
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);

    const alias = path.join(specDir, 'alias');
    fs.symlinkSync(specDir, alias, 'junction');
    assert.throws(() => writeBuildOutputs(alias, path.join(alias, 'content'), build),
      /specDir path component .* is a symlink or junction/);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a real version tree integrates root documents, release outputs and registry checks', async () => {
  const repoRoot = tempRoot('polydoc-release-e2e-');
  try {
    fs.mkdirSync(path.join(repoRoot, 'versions'));
    writeRootUnit(repoRoot, 'README', [
      '# README\n\nroot readme en.\n', '# README\n\nroot readme ru.\n', '# README\n\nroot readme zh.\n',
    ]);
    writeRootUnit(repoRoot, 'CHANGELOG', [
      '# CHANGELOG\n\nroot changelog en.\n', '# CHANGELOG\n\nroot changelog ru.\n', '# CHANGELOG\n\nroot changelog zh.\n',
    ]);
    const releaseDir = path.join(repoRoot, 'versions', '1.2');
    const contentDir = path.join(releaseDir, 'content');
    const fixtures = baseFixtures();
    makeContent(releaseDir, fixtures, fixtures.map((u) => u.name));
    for (const lang of LANGS) write(path.join(contentDir, `README${lang === 'en' ? '' : `.${lang}`}.md`), 'old\n');

    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(releaseDir, contentDir, build);
    assert.doesNotThrow(() => checkBuildOutputs(releaseDir, contentDir, build));

    const rootDocs = buildRootDocs(repoRoot, { rootMarker: 'versions' });
    writeRootDocs(repoRoot, rootDocs);
    assert.deepEqual(checkRootDocs(repoRoot, rootDocs), []);
    assert.equal(fs.readFileSync(path.join(repoRoot, rootOutputName('README', 'ru')), 'utf8'),
      '# README\n\nroot readme ru.\n');

    const registry = {
      generated: expectedGeneratedPaths('versions/1.2'),
      frozen: [],
      internal: ['versions/*/content/README.source.md'],
    };
    assert.deepEqual(checkDocsRegistry(
      repoRoot, registry, defaultFrozenDocsLockPath(repoRoot, 'frozen.lock.json'), 'versions/1.2'), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
