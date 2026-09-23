// A repository's front-page documents, generated from a `root-docs/<DOC>/`
// unit tree each instead of N hand-kept files (one per document times one
// per language). Every unit uses the same `>>>>> lang=` blocks as a content
// unit's body, so a translator sees every language in one file — see
// root_doc_units.mjs for the exact shape (meta.js + body-N.md, no
// generated heading).
//
// DELIBERATE ASYMMETRY, so nobody mistakes it for an oversight: this does
// not go through the journalled transaction that installs a release's
// output files. That transaction exists to keep a many-unit assembly
// consistent across a crash, and it is scoped to the release directories a
// caller configures for it. Extending it to the repository root would
// widen where a build may write, in exchange for atomicity on a handful of
// far smaller files. The `--check` guarantee — a hand edit to a generated
// file fails the build — is identical either way, and that is the
// guarantee these files actually need.

import fs from 'node:fs';
import path from 'node:path';

import { assembleRootDocUnits, hasRootDocUnits } from './units.mjs';
// No import cycle: content.mjs imports root_doc_units.mjs, never this file.
import { DERIVED_TOKEN_RE, substituteReleaseTokens } from '../content/tree.mjs';
import { LANGS, ROOT_DOCUMENTS, requireConfigured } from '../config.mjs';
import { fail } from '../units/decode.mjs';

/// Where a root document's unit tree lives, e.g. `<repoRoot>/root-docs/README/`.
export const rootDocUnitsDir = (repoRoot, doc) => path.join(repoRoot, 'root-docs', doc);

export const rootOutputName = (doc, lang) => (lang === 'en' ? `${doc}.md` : `${doc}.${lang}.md`);

/// Read every configured root document's unit tree and return
/// `doc -> lang -> Buffer`. A missing or malformed source fails the build
/// rather than leaving the previous artifact in place.
///
/// Release-token substitution is OPT-IN via `options.release`
/// ({version, released}): with it, every block is substituted and any
/// surviving placeholder fails the build; without it the buffers are
/// byte-identical to the plain assembly.
///
/// `options.rootMarker`: a path segment (relative to repoRoot) whose
/// presence identifies "this is really the configured repository root", so
/// a minimal synthetic test tree with none of the root documents' sources
/// generates nothing instead of failing. Omit it to always attempt
/// generation.
export function buildRootDocs(repoRoot, options = {}) {
  requireConfigured();
  const out = new Map();

  if (options.rootMarker !== undefined &&
      !fs.existsSync(path.join(repoRoot, options.rootMarker))) {
    return out;
  }

  for (const doc of ROOT_DOCUMENTS) {
    const unitsDir = rootDocUnitsDir(repoRoot, doc);

    // A directory with neither the unit tree nor the artifacts is not
    // this repository, and there is nothing to generate. But an artifact
    // WITHOUT its source is the dangerous state: a file that looks
    // generated, that nothing can regenerate or check. Fail on that, and
    // never on the harmless one.
    if (!hasRootDocUnits(unitsDir)) {
      const orphans = LANGS
        .map((lang) => rootOutputName(doc, lang))
        .filter((artifact) => fs.existsSync(path.join(repoRoot, artifact)));
      if (orphans.length === 0) continue;
      fail(`root-docs/${doc}/manifest.js is missing, but ${orphans.join(', ')} exist and are ` +
        `generated from it; restore the unit tree or delete the artifacts — they cannot be ` +
        `checked without it`);
    }

    const blocks = assembleRootDocUnits(unitsDir);
    if (options.release) {
      for (const lang of LANGS) {
        blocks[lang] = substituteReleaseTokens(blocks[lang], options.release);
        const survivor = blocks[lang].match(DERIVED_TOKEN_RE);
        if (survivor !== null) {
          fail(`root-docs/${doc}: ${lang} still contains placeholder ${survivor[0]} after ` +
            `release-token substitution; either it is misspelled or it names a fact ` +
            `the builder does not derive`);
        }
      }
    }
    const perLang = new Map();
    for (const lang of LANGS) perLang.set(lang, Buffer.from(blocks[lang], 'utf8'));
    out.set(doc, perLang);
  }
  return out;
}

export function writeRootDocs(repoRoot, docs) {
  for (const [doc, perLang] of docs) {
    for (const lang of LANGS) {
      fs.writeFileSync(path.join(repoRoot, rootOutputName(doc, lang)), perLang.get(lang));
    }
  }
}

/// Compare every generated root document against what is on disk.
/// Returns a list of human-readable divergences; empty means identical.
export function checkRootDocs(repoRoot, docs) {
  const problems = [];
  for (const [doc, perLang] of docs) {
    for (const lang of LANGS) {
      const name = rootOutputName(doc, lang);
      const expected = perLang.get(lang);
      let actual;
      try {
        actual = fs.readFileSync(path.join(repoRoot, name));
      } catch (e) {
        problems.push(`${name} is missing or unreadable (${e.message}); it is generated from ` +
          `root-docs/${doc}/`);
        continue;
      }
      if (actual.equals(expected)) continue;
      let off = 0;
      const min = Math.min(actual.length, expected.length);
      while (off < min && actual[off] === expected[off]) off++;
      const line = expected.subarray(0, off).toString('utf8').split('\n').length;
      problems.push(
        `${name} differs from what root-docs/${doc}/ generates, first at byte ${off} ` +
        `(line ${line}); edit the unit source, never the generated file`);
    }
  }
  return problems;
}

export { ROOT_DOCUMENTS };
