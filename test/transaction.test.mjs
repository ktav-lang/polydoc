import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildBuffers,
  writeBuildOutputs,
  checkBuildOutputs,
  recoverBuildOutputTransaction,
  pendingTransactionPaths,
} from '../src/index.mjs';
import { baseFixtures, makeContent, write } from './helpers.mjs';

const fixtureScript = fileURLToPath(new URL('../test-support/write-outputs.mjs', import.meta.url));

function tempSpecDir() {
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-txn-'));
  const contentDir = path.join(specDir, 'content');
  makeContent(specDir, baseFixtures(), baseFixtures().map((u) => u.name));
  for (const readme of ['README.md', 'README.ru.md', 'README.zh.md']) {
    write(path.join(contentDir, readme), '# content README\n');
  }
  return { specDir, contentDir };
}

test('writeBuildOutputs installs every output, and checkBuildOutputs then passes clean', async () => {
  const { specDir, contentDir } = tempSpecDir();
  try {
    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, build);
    for (const name of ['spec.md', 'spec.ru.md', 'spec.zh.md']) {
      assert.ok(fs.existsSync(path.join(specDir, name)), `${name} must exist after write`);
    }
    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, build));
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a hand edit to a written output is caught by checkBuildOutputs', async () => {
  const { specDir, contentDir } = tempSpecDir();
  try {
    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, build);
    fs.appendFileSync(path.join(specDir, 'spec.ru.md'), 'hand edit\n');
    assert.throws(() => checkBuildOutputs(specDir, contentDir, build),
      /MISMATCH in spec\.ru\.md/);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('re-running writeBuildOutputs over an already-current tree is a clean no-op rewrite', async () => {
  const { specDir, contentDir } = tempSpecDir();
  try {
    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, build);
    const before = fs.readFileSync(path.join(specDir, 'spec.md'));
    await writeBuildOutputs(specDir, contentDir, build);
    const after = fs.readFileSync(path.join(specDir, 'spec.md'));
    assert.deepEqual(before, after);
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a process killed right after the first journal snapshot recovers to a consistent, checkable state', async () => {
  const { specDir, contentDir } = tempSpecDir();
  try {
    // First write succeeds normally, so the crash run below is an UPDATE
    // (every output already exists with a backup to restore) — the more
    // interesting crash surface than a first-ever write.
    const firstBuild = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, firstBuild);

    // Change the source so the second build's bytes actually differ, then
    // kill the writer immediately after its first journal snapshot is
    // durable — the exact point outputs.mjs checks
    // KTAV_BUILD_SPEC_CRASH_BEFORE_FIRST_JOURNAL for.
    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      fs.readFileSync(path.join(contentDir, 'sec-1', 'body-1.md'), 'utf8')
        .replace('end.', 'end (v2).'));

    const result = spawnSync(process.execPath, [fixtureScript, specDir, contentDir], {
      encoding: 'utf8',
      env: { ...process.env, KTAV_BUILD_SPEC_CRASH_BEFORE_FIRST_JOURNAL: '1' },
    });
    assert.notEqual(result.status, 0, 'the child must have been killed, not exited cleanly');

    // Recovery must find the interrupted transaction and roll it back —
    // no crash env var this time.
    assert.notDeepEqual(pendingTransactionPaths(specDir, contentDir), []);
    await recoverBuildOutputTransaction(specDir, contentDir);
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);

    // Rolled back means the OLD (v1) content is still what's on disk.
    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, firstBuild));
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('a process killed mid-install (one output already renamed in) rolls every output back to v1, not a mix', async () => {
  const { specDir, contentDir } = tempSpecDir();
  try {
    const firstBuild = await buildBuffers(contentDir);
    await writeBuildOutputs(specDir, contentDir, firstBuild);

    write(path.join(contentDir, 'sec-1', 'body-1.md'),
      fs.readFileSync(path.join(contentDir, 'sec-1', 'body-1.md'), 'utf8')
        .replace('end.', 'end (v3).'));

    // The crash fires right after installing output index 0 (spec.md) —
    // i.e. mid-'installing' phase, still short of the durable 'committed'
    // snapshot. Recovery for any phase short of 'committed' rolls back,
    // by design: only a crash AFTER 'committed' is durable completes
    // forward. The guarantee under test is that "one new, five old" never
    // survives — recovery makes every output v1 again, uniformly.
    const result = spawnSync(process.execPath, [fixtureScript, specDir, contentDir], {
      encoding: 'utf8',
      env: { ...process.env, KTAV_BUILD_SPEC_CRASH_AFTER_RENAME: 'install:0' },
    });
    assert.notEqual(result.status, 0);

    assert.notDeepEqual(pendingTransactionPaths(specDir, contentDir), []);
    await recoverBuildOutputTransaction(specDir, contentDir);
    assert.deepEqual(pendingTransactionPaths(specDir, contentDir), []);

    assert.doesNotThrow(() => checkBuildOutputs(specDir, contentDir, firstBuild));
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});
