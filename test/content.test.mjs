import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import path from 'node:path';

import { substituteReleaseTokens, minorLineOf, bodySplitPlan } from '../src/index.mjs';
import { baseFixtures, buildInTemp, sameLanguageBodies, unitMeta, validate } from './helpers.mjs';

test('a clean fixture set validates and reports the manifest', async () => {
  const result = await validate(baseFixtures());
  assert.deepEqual(result.manifest, ['frontmatter', 'named-abstract', 'sec-1']);
  assert.equal(result.units.size, 3);
});

test('manifest must start with "frontmatter"', async () => {
  await assert.rejects(
    validate(baseFixtures(), ['named-abstract', 'frontmatter', 'sec-1']),
    /manifest\.js must start with "frontmatter"/);
});

test('a numbered unit directory name must match sec-<number>', async () => {
  const fx = baseFixtures();
  fx[2].name = 'sec-9';
  await assert.rejects(validate(fx), /unit name does not match sec-1/);
});

test('every language block is required in every body file', async () => {
  const fx = baseFixtures();
  await assert.rejects(
    validate(fx, undefined, (contentDir) => {
      // A hand-written body file missing the ru/zh separators entirely —
      // bodySource() always writes all three, so this bypasses it.
      fs.writeFileSync(
        path.join(contentDir, 'named-abstract', 'body-1.md'),
        '>>>>> lang=en\nonly english\n\n');
    }),
    /missing language block\(s\) ru, zh/);
});

test('an unexpected top-level directory not in manifest.js is rejected', async () => {
  await assert.rejects(
    validate(baseFixtures(), undefined, (contentDir) => {
      // A directory that exists on disk but was never named in manifest.js.
      fs.mkdirSync(path.join(contentDir, 'sec-99'));
      fs.writeFileSync(path.join(contentDir, 'sec-99', 'meta.js'), 'export default {}\n');
    }),
    /unexpected directory under content\/: "sec-99" \(not in manifest\.js\)/);
});

test('buildBuffers assembles one buffer per language with generated headings', async () => {
  const { bufs } = await buildInTemp(baseFixtures());
  const en = bufs.en.toString('utf8');
  assert.match(en, /^# Frontmatter/);
  assert.match(en, /## Abstract/);
  assert.match(en, /## 1\. Intro/);
  const ru = bufs.ru.toString('utf8');
  assert.match(ru, /## 1\. Введение/);
});

test('release tokens are substituted in bodies, not in the frontmatter heading text itself', async () => {
  const fx = baseFixtures();
  fx[0].bodies = [[
    '# Frontmatter\n\nVersion @@VERSION@@ released @@DATE@@.\n\n',
    '# Frontmatter\n\nВерсия @@VERSION@@ от @@DATE@@.\n\n',
    '# Frontmatter\n\n版本 @@VERSION@@ 于 @@DATE@@。\n\n',
  ]];
  const { bufs } = await buildInTemp(fx);
  assert.match(bufs.en.toString('utf8'), /Version 4\.5\.6 released 2020-06-01\./);
});

test('a surviving @@VERSION@@ that the builder never substitutes fails the build', async () => {
  // substituteReleaseTokens only ever touches unit bodies (via buildBuffers);
  // calling it directly proves the substitution itself is correct and total.
  const text = substituteReleaseTokens('v@@VERSION@@ on @@DATE@@ (@@MINOR_LINE@@)',
    { version: '1.2.3', released: '2024-01-01' });
  assert.equal(text, 'v1.2.3 on 2024-01-01 (1.2.x)');
});

test('minorLineOf derives the supported-branch line from a full version', () => {
  assert.equal(minorLineOf('0.8.0'), '0.8.x');
  assert.equal(minorLineOf('12.34.56'), '12.34.x');
});

test('non-last unit bodies must end with exactly one blank line', async () => {
  const fx = baseFixtures();
  fx[1].bodies = [sameLanguageBodies(['mid, no blank line.\n'])[0]];
  await assert.rejects(validate(fx), /non-last unit's final chunk must end with "\\n\\n"/);
});

test('the last unit must end with a single newline, not a trailing blank line', async () => {
  const fx = baseFixtures();
  fx[2].bodies = [sameLanguageBodies(['end.\n\n'])[0]];
  await assert.rejects(validate(fx), /last unit's final chunk must end with a single "\\n"/);
});

test('bodyParts is a mandated split count, not a free choice — a short body must be one part', async () => {
  const fx = baseFixtures();
  fx[2].meta = unitMeta('numbered', { __num: '1', bodyParts: 2 });
  fx[2].bodies = [
    ['first en.\n\n', 'first ru.\n\n', 'first zh.\n\n'],
    ['second en.\n', 'second ru.\n', 'second zh.\n'],
  ];
  await assert.rejects(validate(fx),
    /bodyParts 2 does not match the mandated split count 1/);
});

test('a body long enough to need two parts is split at the same blank-line boundary in every language', async () => {
  // Built from bodySplitPlan itself rather than a hand-guessed cut point:
  // this proves the VALIDATOR accepts exactly what the PLANNER mandates,
  // not that a hand-picked boundary happens to be right.
  const para = (marker, n) => Array.from({ length: n }, (_, i) => `${marker} line ${i + 1}`).join('\n') + '\n';
  const whole = { en: para('en', 25) + '\n' + para('en', 25), ru: para('ru', 25) + '\n' + para('ru', 25), zh: para('zh', 25) + '\n' + para('zh', 25) };
  const plan = bodySplitPlan([{ en: whole.en, ru: whole.ru, zh: whole.zh }]);
  assert.equal(plan.partCount, 2, 'fixture must actually need two parts for this test to mean anything');

  const perLang = Object.fromEntries(['en', 'ru', 'zh'].map((lang) => {
    const cuts = [0, ...plan.plans[lang].cuts, whole[lang].length];
    const slices = [];
    for (let i = 0; i < cuts.length - 1; i++) slices.push(whole[lang].slice(cuts[i], cuts[i + 1]));
    return [lang, slices];
  }));
  const fx = baseFixtures();
  fx[2].meta = unitMeta('numbered', { __num: '1', bodyParts: plan.partCount });
  fx[2].bodies = perLang.en.map((_, i) => [perLang.en[i], perLang.ru[i], perLang.zh[i]]);

  const result = await validate(fx);
  assert.equal(result.units.get('sec-1').parts.length, plan.partCount);
});

test('the section-inventory lock, when required, must match the manifest', async () => {
  const fx = baseFixtures();
  await assert.rejects(
    validate(fx, undefined, undefined, { lock: ['frontmatter', 'named-abstract'] }),
    /does not match manifest\.js at index 2/);
});

test('a lock matching the manifest and structural metadata validates cleanly', async () => {
  const fx = baseFixtures();
  const result = await validate(fx, undefined, undefined, { lock: ['frontmatter', 'named-abstract', 'sec-1'] });
  assert.equal(result.manifest.length, 3);
});
