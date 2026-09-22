// The registry of every public Markdown file in a repository, and the
// three answers the question "what is this file?" can have.
//
// A doc-build pipeline typically byte-checks only what it itself
// generates. Two holes follow from that: a historical/frozen artifact no
// tool regenerates goes unchecked by anything, and a brand-new
// unregistered .md dropped at a public location goes unnoticed by every
// tool. Both close here:
//
//   generated  rebuilt from source units by the caller's builder and
//              byte-checked on every run. The list the caller declares is
//              cross-checked against expectedGeneratedPaths(), derived
//              from the configured ROOT_DOCUMENTS/OUT_FILES/README_FILES,
//              so the declared list can never silently drift from what
//              the builder actually builds.
//   frozen     historical artifacts no tool can regenerate. They are
//              pinned by a caller-chosen lock file, and editing one is a
//              deliberate act recorded by writeFrozenDocsLock.
//   internal   deliberately outside the output contract: retired source
//              shapes and working notes. Classified so they are not
//              mistaken for unregistered output; never checked.
//
// A registry is `{ generated: [...], frozen: [...], internal: [...] }`.
// Entries come in three shapes: a trailing '/' is a PREFIX rule; an entry
// containing '*' is a ONE-SEGMENT wildcard ('*' matches any single path
// segment); anything else is an exact path. A file must match at most one
// category by construction; checkDocsRegistry treats a multi-category
// match as a problem rather than silently picking one.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readCanonicalJson } from './content.mjs';
import { ROOT_DOCUMENTS, rootOutputName } from './root_docs.mjs';
import { LANGS, OUT_FILES, README_FILES, requireConfigured } from './config.mjs';

// Does `rel` (a POSIX-style path relative to the repo root) match one
// registry entry? See the header for the three entry shapes.
export function internalEntryMatches(rel, entry) {
  if (entry.endsWith('/')) return rel.startsWith(entry);
  if (entry.includes('*')) {
    const entrySegments = entry.split('/');
    const relSegments = rel.split('/');
    if (entrySegments.length !== relSegments.length) return false;
    return entrySegments.every((segment, i) =>
      segment === '*' || segment === relSegments[i]);
  }
  return rel === entry;
}

function registeredCategories(registry, rel) {
  return ['generated', 'frozen', 'internal']
    .filter((category) => (registry[category] ?? [])
      .some((entry) => internalEntryMatches(rel, entry)));
}

// 'generated' | 'frozen' | 'internal', or null when the path is registered
// in no category (or, by construction never, in more than one — the
// registry check reports that ambiguity instead of resolving it).
export function classifyRegistered(registry, rel) {
  const hits = registeredCategories(registry, rel);
  return hits.length === 1 ? hits[0] : null;
}

// What the builder itself builds, derived from the builder's own
// configuration: every root document times every language, plus the
// release output triple, plus the release content-README triple, at
// `releasePath` (the caller's release output directory, relative to the
// repo root — e.g. `versions/0.8`). The registry check compares the
// explicit `generated` list against this, so adding a root document or a
// language without registering its output is a failure, not a new
// unchecked file.
export function expectedGeneratedPaths(releasePath) {
  requireConfigured();
  const paths = [];
  for (const doc of ROOT_DOCUMENTS) {
    for (const lang of LANGS) paths.push(rootOutputName(doc, lang));
  }
  for (const lang of LANGS) paths.push(`${releasePath}/${OUT_FILES[lang]}`);
  for (const lang of LANGS) paths.push(`${releasePath}/content/${README_FILES[lang]}`);
  return paths.sort();
}

// Every .md file a reader can meet in the repository, as sorted POSIX-style
// paths relative to the repo root: the repo root (non-recursive), each
// versions/<v>/ and versions/<v>/content/ (non-recursive — a version's
// content units are sources, not public Markdown, and are the builder's
// business, not the registry's), and docs/ recursively. Missing
// directories scan as empty, so test fixture trees need nothing extra.
export function scanPublicMarkdown(repoRoot) {
  const found = [];

  const scanFlat = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // no such directory: nothing to scan
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      found.push(`${prefix}${entry.name}`);
    }
  };

  const walkDocs = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // no docs/ at all is normal outside this repository
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walkDocs(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(`${prefix}${entry.name}`);
      }
    }
  };

  scanFlat(repoRoot, '');
  let versions;
  try {
    versions = fs.readdirSync(path.join(repoRoot, 'versions'), { withFileTypes: true });
  } catch {
    versions = [];
  }
  for (const version of versions) {
    if (!version.isDirectory()) continue;
    scanFlat(
      path.join(repoRoot, 'versions', version.name), `versions/${version.name}/`);
    scanFlat(
      path.join(repoRoot, 'versions', version.name, 'content'),
      `versions/${version.name}/content/`);
  }
  walkDocs(path.join(repoRoot, 'docs'), 'docs/');
  return found.sort();
}

export function frozenSha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function defaultFrozenDocsLockPath(repoRoot, lockFileName) {
  return path.join(repoRoot, 'scripts', 'locks', lockFileName);
}

const FROZEN_LOCK_FORMAT = 'ktav-frozen-docs';

function checkFrozenDocs(repoRoot, registry, lockPath, problems) {
  const frozen = registry.frozen ?? [];
  const frozenOnDisk = frozen.filter((rel) => fs.existsSync(path.join(repoRoot, rel)));
  const lockExists = fs.existsSync(lockPath);

  // ASYMMETRY, mirroring the root-docs artifact-without-source rule: a
  // tree with no frozen documents on disk and no lock has nothing to
  // protect — a synthetic test tree builds exactly such a state, and
  // failing it for a history it never had would be wrong. But the moment
  // a frozen document OR a lock exists, enforcement is full.
  if (frozenOnDisk.length === 0 && !lockExists) return;

  for (const rel of frozen) {
    if (!fs.existsSync(path.join(repoRoot, rel))) {
      problems.push(
        `${rel} is registered as a frozen document but is missing from the ` +
        'repository; restore it, or if its removal is deliberate, regenerate ' +
        'the lock with --write-frozen-lock');
    }
  }

  if (!lockExists) {
    problems.push(
      `the frozen-docs lock is missing: ${lockPath} — the repository carries ` +
      'frozen (historical) documents, so their hashes must be recorded; ' +
      'run node scripts/build_spec.mjs --write-frozen-lock');
    return;
  }

  let lock = null;
  let decodeError = null;
  try {
    lock = readCanonicalJson(lockPath);
  } catch (e) {
    decodeError = e;
  }
  if (lock === null) {
    problems.push(
      `the frozen-docs lock at ${lockPath} is not canonical JSON: ` +
      `${decodeError.message}; regenerate it with --write-frozen-lock`);
    return;
  }
  if (lock.format !== FROZEN_LOCK_FORMAT) {
    problems.push(
      `the frozen-docs lock's format is ${JSON.stringify(lock.format)}, ` +
      `expected ${JSON.stringify(FROZEN_LOCK_FORMAT)}`);
    return;
  }
  const files = lock.files;
  const shapeOk = Array.isArray(files) && files.every((f) =>
    f !== null && typeof f === 'object' && !Array.isArray(f) &&
    typeof f.path === 'string' && typeof f.sha256 === 'string');
  if (!shapeOk) {
    problems.push(
      `the frozen-docs lock's files must be a list of {path, sha256} objects: ${lockPath}`);
    return;
  }
  const paths = files.map((f) => f.path);
  if (paths.join('\n') !== [...paths].sort().join('\n')) {
    problems.push(`the frozen-docs lock's files are not sorted by path: ${lockPath}`);
    return;
  }
  const locked = new Map(files.map((f) => [f.path, f.sha256]));
  const missingFromLock = frozen.filter((rel) => !locked.has(rel));
  const extraInLock = paths.filter((rel) => !frozen.includes(rel));
  if (missingFromLock.length > 0 || extraInLock.length > 0) {
    const parts = [];
    if (missingFromLock.length > 0) {
      parts.push(`missing from the lock: ${missingFromLock.join(', ')}`);
    }
    if (extraInLock.length > 0) {
      parts.push(`in the lock but not registered as frozen: ${extraInLock.join(', ')}`);
    }
    problems.push(
      'the frozen-docs lock must cover exactly the frozen documents — ' +
      `${parts.join('; ')}; regenerate it with --write-frozen-lock`);
    return;
  }
  for (const rel of frozen) {
    const absPath = path.join(repoRoot, rel);
    if (!fs.existsSync(absPath)) continue; // already reported above
    const actual = frozenSha256(absPath);
    if (actual !== locked.get(rel)) {
      problems.push(
        `${rel} differs from its frozen-docs lock hash — a frozen version is ` +
        'never edited by hand; if this change is truly deliberate, regenerate ' +
        'the lock with --write-frozen-lock');
    }
  }
}

// `releasePath` is the caller's release output directory relative to the
// repo root (e.g. `versions/0.8`), used only to cross-check `registry`'s
// declared `generated` list against expectedGeneratedPaths(releasePath).
export function checkDocsRegistry(repoRoot, registry, lockPath, releasePath) {
  requireConfigured();
  const problems = [];

  // (a) The explicit generated list must equal what the builder builds.
  const declared = [...(registry.generated ?? [])].sort();
  const expected = expectedGeneratedPaths(releasePath);
  if (declared.join('\n') !== expected.join('\n')) {
    const inDeclared = new Set(declared);
    const inExpected = new Set(expected);
    const difference = [
      ...declared.filter((p) => !inExpected.has(p)).map((p) => `+ ${p}`),
      ...expected.filter((p) => !inDeclared.has(p)).map((p) => `- ${p}`),
    ];
    problems.push(
      'the registry\'s generated list does not match what the builder generates — ' +
      `symmetric difference: ${difference.join(', ')}`);
  }

  // (b) Every public Markdown file must be registered, in one category.
  for (const rel of scanPublicMarkdown(repoRoot)) {
    const hits = registeredCategories(registry, rel);
    if (hits.length > 1) {
      problems.push(
        `${rel} is registered in more than one category (${hits.join(', ')})`);
    } else if (hits.length === 0) {
      problems.push(
        `unregistered public Markdown file: ${rel} — register it in ` +
        'scripts/build_spec/registry.mjs (generated: rebuilt from source units ' +
        'and byte-checked; frozen: historical, hash-locked; internal: ' +
        'deliberately outside the output contract)');
    }
  }

  // (c) Frozen documents are hash-locked, with the asymmetric skip above.
  checkFrozenDocs(repoRoot, registry, lockPath, problems);
  return problems;
}

/// Regenerate the frozen-docs lock from the frozen documents on disk,
/// reporting the delta — the same human-in-the-loop contract as a
/// section-inventory lock writer: a flag that silently rewrote the lock
/// would make "a frozen version was edited" invisible, which is the one
/// thing it must never be. Only documents PRESENT on disk are recorded, so
/// the flag also works on a tree with no frozen history at all (it then
/// records an empty lock); whether that state is acceptable is the check's
/// asymmetric rule, not the writer's.
export async function writeFrozenDocsLock(repoRoot, registry, lockPath) {
  const frozen = registry.frozen ?? [];
  const next = {
    format: FROZEN_LOCK_FORMAT,
    files: frozen
      .filter((rel) => fs.existsSync(path.join(repoRoot, rel)))
      .sort()
      .map((rel) => ({ path: rel, sha256: frozenSha256(path.join(repoRoot, rel)) })),
  };

  let previous = null;
  if (fs.existsSync(lockPath)) {
    try {
      previous = readCanonicalJson(lockPath);
    } catch {
      process.stdout.write(
        'polydoc: existing frozen-docs lock could not be decoded; writing a fresh one\n');
    }
  }

  const lines = [];
  const before = new Map(
    previous === null ? [] : (previous.files ?? []).map((f) => [f.path, f.sha256]));
  const after = new Map(next.files.map((f) => [f.path, f.sha256]));
  for (const [rel, sha] of after) {
    if (!before.has(rel)) {
      lines.push(`  + ${rel}`);
    } else if (before.get(rel) !== sha) {
      lines.push(`  ~ ${rel}`);
      lines.push(`    was ${before.get(rel)}`);
      lines.push(`    now ${sha}`);
    }
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) lines.push(`  - ${rel}`);
  }
  // A first recording with nothing to record is still a recording: the
  // flag's contract is that the lock file exists afterwards, so the empty
  // tree gets its (empty) lock rather than a silent no-op.
  if (lines.length === 0 && previous === null) {
    lines.push(`  no previous lock: recording ${next.files.length} file(s)`);
  }

  if (lines.length === 0) {
    process.stdout.write('polydoc: frozen docs lock is already current; nothing written\n');
    return;
  }

  process.stdout.write(
    'polydoc: frozen docs lock changes:\n' + lines.join('\n') + '\n');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  process.stdout.write(`polydoc: wrote ${lockPath}\n`);
}
