import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  configure,
  buildBuffers,
  validateContentDir,
  README_SOURCE_FILE,
  bodyFileName,
  langSeparator,
} from '../src/index.mjs';

// Every test in this suite shares one configuration: three languages, the
// same file-naming shape ktav-lang/spec uses (this code was extracted
// from there), a project-neutral lock format name.
configure({
  langs: ['en', 'ru', 'zh'],
  outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
  readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' },
  sectionInventoryLockFormat: 'polydoc-test-section-inventory',
  rootDocuments: ['README', 'CHANGELOG'],
});

export function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

export function metaJs(obj) {
  return 'export default ' + JSON.stringify(obj, null, 2) + '\n';
}

// Body sources are Markdown: one `>>>>> lang=` block per language, no
// escaping at all. A block owns its trailing newline, so text that
// already ends in one is written through untouched.
export function bodySource(en, ru, zh) {
  let out = '';
  for (const [lang, text] of [['en', en], ['ru', ru], ['zh', zh]]) {
    out += langSeparator(lang) + '\n' + text;
    if (text.length > 0 && !text.endsWith('\n')) out += '\n';
  }
  return out;
}

// kind: 'frontmatter' | 'named' | 'numbered'
export function unitMeta(kind, opts = {}) {
  const { __num, ...rest } = opts;
  if (kind === 'frontmatter') {
    return { kind: 'frontmatter', number: null, level: null, title: null, bodyParts: 1, ...rest };
  }
  if (kind === 'named') {
    return {
      kind: 'named', number: null, level: 2,
      title: { en: 'Abstract', ru: 'Аннотация', zh: '摘要' },
      bodyParts: 1, ...rest,
    };
  }
  return {
    kind: 'numbered', number: __num || '1', sep: '. ', level: 2,
    title: { en: 'Intro', ru: 'Введение', zh: '引言' },
    bodyParts: 1, ...rest,
  };
}

export const TEST_RELEASE = { version: '4.5.6', released: '2020-06-01' };

// unit defs: { name, meta, bodies: [[en,ru,zh], ...], extraFiles }
export function makeContent(dir, unitDefs, manifestNames) {
  write(path.join(dir, 'content', 'release.js'),
    'export default ' + JSON.stringify(TEST_RELEASE, null, 2) + '\n');
  write(path.join(dir, 'content', README_SOURCE_FILE),
    bodySource('# content README\n', '# content README\n', '# content README\n'));
  for (const u of unitDefs) {
    const ud = path.join(dir, 'content', u.name);
    write(path.join(ud, 'meta.js'), metaJs(u.meta));
    const bodies = u.bodies || [['text.\n\n', 'текст.\n\n', '文本。\n\n']];
    bodies.forEach((b, i) => {
      write(path.join(ud, bodyFileName(i + 1)), bodySource(b[0], b[1], b[2]));
    });
    for (const extra of u.extraFiles || []) {
      write(path.join(ud, extra.name), extra.content);
    }
  }
  write(path.join(dir, 'content', 'manifest.js'),
    'export default ' + JSON.stringify(manifestNames, null, 2) + '\n');
}

export function lockUnits(unitDefs, manifestNames) {
  const byName = new Map(unitDefs.map((unit) => [unit.name, unit.meta]));
  return manifestNames.map((unit) => {
    const meta = byName.get(unit);
    return {
      unit,
      kind: meta.kind,
      number: meta.number,
      level: meta.level,
      sep: meta.kind === 'numbered' ? meta.sep : null,
    };
  });
}

export const LAST = ['end.\n', 'конец.\n', '结束。\n'];
export const MID = ['mid.\n\n', 'середина.\n\n', '中间。\n\n'];

export function baseFixtures() {
  return [
    { name: 'frontmatter', meta: unitMeta('frontmatter'), bodies: [['# Frontmatter\n\nfm.\n\n', '# Frontmatter\n\nфм.\n\n', '# Frontmatter\n\n前言。\n\n']] },
    { name: 'named-abstract', meta: unitMeta('named'), bodies: [MID] },
    { name: 'sec-1', meta: unitMeta('numbered', { __num: '1' }), bodies: [LAST] },
  ];
}

export async function validate(fixtures, manifest, mutate, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-test-'));
  try {
    makeContent(dir, fixtures, manifest || fixtures.map((u) => u.name));
    if (mutate) mutate(path.join(dir, 'content'));
    const validateOptions = {};
    if (options.lock) {
      const lockPath = path.join(dir, 'section-inventory.lock.json');
      write(lockPath, JSON.stringify({
        format: 'polydoc-test-section-inventory',
        units: options.lock.map((unit) => typeof unit === 'string'
          ? lockUnits(fixtures, [unit])[0] : unit),
        version: TEST_RELEASE.version,
      }, null, 2) + '\n');
      validateOptions.sectionInventoryLockPath = lockPath;
      validateOptions.requireSectionInventoryLock = true;
    }
    return await validateContentDir(path.join(dir, 'content'), validateOptions);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function sameLanguageBodies(parts) {
  return parts.map((part) => [part, part, part]);
}

export async function buildInTemp(fixtures, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-build-'));
  try {
    makeContent(dir, fixtures, fixtures.map((u) => u.name));
    if (mutate) mutate(path.join(dir, 'content'));
    return await buildBuffers(path.join(dir, 'content'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
