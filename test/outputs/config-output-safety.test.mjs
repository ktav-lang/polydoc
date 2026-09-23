import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBuffers,
  configure,
  writeBuildOutputs,
} from '../../src/index.mjs';
import { baseFixtures, makeContent, write } from '../helpers.mjs';

const langs = ['en', 'ru', 'zh'];

function names(en, ru, zh) {
  return { en, ru, zh };
}

test('configuration rejects unsafe/colliding outputs before writing, while valid custom names preserve inputs', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-config-safety-')));
  const fixtures = baseFixtures();
  const manifest = fixtures.map((unit) => unit.name);
  try {
    const contentDir = path.join(root, 'content');
    fs.mkdirSync(contentDir, { recursive: true });
    const sourcePath = path.join(contentDir, 'README.source.md');
    const sourceBefore = Buffer.from('source must survive\n');
    fs.writeFileSync(sourcePath, sourceBefore);

    const validOutputs = names('spec.md', 'spec.ru.md', 'spec.zh.md');
    assert.throws(() => configure({
      langs,
      outFileNames: names('spec.md', 'SPEC.md', 'spec.zh.md'),
      readmeFileNames: names('Guide.md', 'Guide.ru.md', 'Guide.zh.md'),
    }), /collide case-insensitively/);
    assert.throws(() => configure({
      langs,
      outFileNames: validOutputs,
      readmeFileNames: names('Guide.md', 'Guide.ru.md', 'Guide.zh.md'),
      readmeSourceFile: '../README.source.md',
    }), /safe file name/);
    assert.throws(() => configure({
      langs,
      outFileNames: validOutputs,
      readmeFileNames: names('Guide.md', 'Guide.ru.md', 'Guide.zh.md'),
      readmeSourceFile: 'MANIFEST.JS',
    }), /protected content input/);
    assert.throws(() => configure({
      langs,
      outFileNames: validOutputs,
      readmeFileNames: names('README.source.md', 'Guide.ru.md', 'Guide.zh.md'),
    }), /protected content input/);
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBefore,
      'a rejected configuration must not alter the source');

    const custom = {
      langs,
      outFileNames: names('custom-spec.md', 'custom-spec.ru.md', 'custom-spec.zh.md'),
      readmeFileNames: names('Guide.md', 'Guide.ru.md', 'Guide.zh.md'),
      readmeSourceFile: 'Guide.source.md',
    };
    configure(custom);
    fs.rmSync(sourcePath);
    makeContent(root, fixtures, manifest);

    const protectedInputs = {
      source: path.join(contentDir, 'Guide.source.md'),
      manifest: path.join(contentDir, 'manifest.js'),
      release: path.join(contentDir, 'release.js'),
      contentPackage: path.join(contentDir, 'package.json'),
      rootPackage: path.join(root, 'package.json'),
    };
    write(protectedInputs.contentPackage, '{"contentInput":true}\n');
    write(protectedInputs.rootPackage, '{"rootInput":true}\n');
    const before = Object.fromEntries(
      Object.entries(protectedInputs).map(([key, file]) => [key, fs.readFileSync(file)]));

    const build = await buildBuffers(contentDir);
    await writeBuildOutputs(root, contentDir, build);

    for (const [key, file] of Object.entries(protectedInputs)) {
      assert.deepEqual(fs.readFileSync(file), before[key], `${key} input was overwritten`);
    }
    for (const name of Object.values(custom.outFileNames)) {
      assert.ok(fs.existsSync(path.join(root, name)), `${name} was not written`);
    }
    for (const name of Object.values(custom.readmeFileNames)) {
      assert.ok(fs.existsSync(path.join(contentDir, name)), `${name} was not written`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
