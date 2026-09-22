// Structural checks over content sources, independent of and complementary
// to whatever structural checks a caller runs over its RENDERED documents
// (e.g. comparing § references, fenced blocks and RFC 2119 keywords per
// section across languages). That class of check reads only the final
// render and can miss a defect the source itself already carries — a unit
// can keep every cross-reference and every keyword while reducing most of
// its bullets to stubs in one language, and a render-level parity checker
// passes it. These checks read the sources instead, where a defect can be
// pointed at a file and a line rather than at a rendered section.
//
// Four checks:
//
//   parts-aligned    part k must hold the same fragment in every
//                    language; a shared-cut split (see content.mjs's
//                    bodySplitPlan) rests on this being true.
//   list-parity      the bullets must survive translation.
//   indent-shapes    text pasted at a depth no construct justifies.
//   unwrapped        a translation paragraph left as one long line.

import fs from 'node:fs';
import path from 'node:path';

import { LANGS, requireConfigured } from './config.mjs';
import { validateBodySourceShape } from './units/containers.mjs';

const FENCE_RE = /^\s*(```|~~~)/u;
const WIDE_CP_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/u;

/// Display width, counting East Asian wide code points as two columns —
/// which is how they occupy a terminal and a side-by-side diff.
function displayWidth(line) {
  let width = 0;
  for (const ch of line) width += WIDE_CP_RE.test(ch) ? 2 : 1;
  return width;
}

/// Lines outside fenced blocks. Inside a fence, indentation and line
/// breaks are content, not formatting, and none of these checks apply.
function proseLines(text) {
  const rows = [];
  let inFence = false;
  text.split('\n').forEach((line, i) => {
    if (FENCE_RE.test(line)) { inFence = !inFence; return; }
    if (!inFence) rows.push({ number: i + 1, line });
  });
  return rows;
}

const LIST_MARKER_RE = /^(\s*)(\d+\.[ \t]+|[-*+][ \t]+)/u;

// ---------------------------------------------------------------- parts

const FENCE_BLOCK_RE = /^(```|~~~)[^\n]*\n([\s\S]*?)^\1[^\n]*$/gmu;
const SECTION_REF_RE = /§\s*([\d.]+[\d])/gu;
const ERROR_NAME_RE = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/gu;

/// Items that are never translated, so their position is comparable
/// across languages: code blocks, § references and error names.
function untranslatedItems(text) {
  const counts = new Map();
  const add = (kind, value) => {
    const key = `${kind}:${value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const m of text.matchAll(FENCE_BLOCK_RE)) add('fence', m[2].trim());
  for (const m of text.matchAll(SECTION_REF_RE)) add('section', m[1]);
  for (const m of text.matchAll(ERROR_NAME_RE)) add('error', m[1]);
  return counts;
}

/// MISALIGNMENT — the same item sitting in part 1 of one language and part
/// 2 of another. That means the cut points drifted apart and the files are
/// slices rather than translations. A differing NUMBER of mentions inside
/// the same part is a prose question, not a split defect, and is reported
/// separately by the caller rather than failing the build.
function checkPartsAligned(units, problems, notes) {
  for (const { unit, parts } of units) {
    if (parts.length < 2) continue;
    const placement = new Map();
    parts.forEach((blocks, partIndex) => {
      for (const lang of LANGS) {
        for (const [key, count] of untranslatedItems(blocks[lang])) {
          if (!placement.has(key)) placement.set(key, new Map());
          const byLang = placement.get(key);
          if (!byLang.has(lang)) byLang.set(lang, new Map());
          byLang.get(lang).set(partIndex, count);
        }
      }
    });

    for (const [key, byLang] of placement) {
      const present = [...byLang.keys()];
      if (present.length < 2) continue;
      const partsOf = (lang) => [...byLang.get(lang).keys()].sort((a, b) => a - b);
      const reference = partsOf(present[0]);
      for (const lang of present.slice(1)) {
        if (JSON.stringify(partsOf(lang)) !== JSON.stringify(reference)) {
          problems.push(`${unit}: ${key} sits in different parts across languages (` +
            present.map((l) => `${l}=${partsOf(l).map((p) => p + 1).join('+')}`).join(', ') +
            '); the parts are slices, not translations');
          break;
        }
      }
      for (const partIndex of reference) {
        const counts = present.map((lang) => byLang.get(lang).get(partIndex) ?? 0);
        if (new Set(counts).size > 1) {
          notes.push(`${unit} part ${partIndex + 1}: ${key} mentioned ` +
            present.map((l, i) => `${l}=${counts[i]}`).join(' ') +
            ' — same part, different count; a prose question, not a split defect');
        }
      }
    }
  }
}

// ----------------------------------------------------------------- list

/// Bullets and numbered items must survive translation. This is the check
/// a rendered-document parity gate cannot make: it compares sections, and
/// a section keeps its § references and keywords even when its list has
/// been reduced to stubs.
function checkListParity(units, problems) {
  for (const { unit, parts } of units) {
    parts.forEach((blocks, partIndex) => {
      const count = (text, re) => proseLines(text).filter((r) => re.test(r.line)).length;
      for (const [kind, re] of [['bullet', /^\s*[-*+][ \t]/u], ['ordered', /^\s*\d+\.[ \t]/u]]) {
        const values = LANGS.map((lang) => count(blocks[lang], re));
        if (new Set(values).size > 1) {
          problems.push(`${unit} part ${partIndex + 1}: ${kind} count differs (` +
            LANGS.map((l, i) => `${l}=${values[i]}`).join(' ') +
            '); a translation dropped or invented list items');
        }
      }
    });
  }
}

// --------------------------------------------------------------- indent

/// An indent the translation uses that the reference language never does,
/// MINUS indents justified by a list marker in the translation's own
/// block.
///
/// That exemption is the whole check. A translation may legitimately wrap
/// a bullet the reference fits on one line, using a continuation indent
/// the reference had no occasion for.
function checkIndentShapes(units, problems) {
  const referenceLang = LANGS[0];
  const referenceLabel = referenceLang === 'en' ? 'English' : referenceLang;
  for (const { unit, parts } of units) {
    parts.forEach((blocks, partIndex) => {
      const shape = (text) => {
        const indents = new Set();
        const markerIndents = new Set();
        for (const { line } of proseLines(text)) {
          if (line.trim() === '') continue;
          indents.add(line.length - line.trimStart().length);
          const m = LIST_MARKER_RE.exec(line);
          if (m) markerIndents.add(m[1].length + m[2].length);
        }
        return { indents, markerIndents };
      };
      const reference = shape(blocks[referenceLang]);
      for (const lang of LANGS) {
        if (lang === referenceLang) continue;
        const t = shape(blocks[lang]);
        for (const indent of t.indents) {
          if (reference.indents.has(indent) || t.markerIndents.has(indent)) continue;
          problems.push(`${unit} part ${partIndex + 1}: ${lang} indents by ${indent}, ` +
            `which ${referenceLabel} never uses and no list marker in the block justifies`);
        }
      }
    });
  }
}

// ------------------------------------------------------------ unwrapped

/// A translation line far wider than the widest reference-language line
/// in the same file — the shape of a paragraph edited by substitution and
/// never re-wrapped.
///
/// Relative on purpose: an absolute column limit does not survive contact
/// with a real corpus, since grammar productions and aligned example
/// tables can legitimately run well past ordinary prose width in every
/// language.
const WIDTH_RATIO = 1.4;
const WIDTH_MARGIN = 20;

function checkUnwrapped(units, problems) {
  const referenceLang = LANGS[0];
  const referencePhrase = referenceLang === 'en' ? 'an English' : `the ${referenceLang}`;
  for (const { unit, parts } of units) {
    parts.forEach((blocks, partIndex) => {
      const widest = (text) => proseLines(text)
        .reduce((max, r) => Math.max(max, displayWidth(r.line)), 0);
      const referenceMax = widest(blocks[referenceLang]);
      if (referenceMax === 0) return;
      for (const lang of LANGS) {
        if (lang === referenceLang) continue;
        for (const { number, line } of proseLines(blocks[lang])) {
          const width = displayWidth(line);
          if (width > referenceMax * WIDTH_RATIO && width > referenceMax + WIDTH_MARGIN) {
            problems.push(`${unit} part ${partIndex + 1}: ${lang} line ${number} is ` +
              `${width} columns against ${referencePhrase} maximum of ${referenceMax}; ` +
              're-wrap it, the paragraph was edited without re-wrapping');
          }
        }
      }
    });
  }
}

// ------------------------------------------------------------------ api

export function readUnits(contentDir) {
  requireConfigured();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'manifest.js'), 'utf8').replace('export default ', ''));
  return manifest.map((unit) => {
    const dir = path.join(contentDir, ...unit.split('/'));
    const names = fs.readdirSync(dir)
      .filter((n) => /^body-\d+\.md$/u.test(n))
      .sort((a, b) => Number(a.slice(5, -3)) - Number(b.slice(5, -3)));
    const parts = names.map((name) => validateBodySourceShape(
      unit, 1, fs.readFileSync(path.join(dir, name), 'utf8'), `${unit}/${name}`));
    return { unit, parts };
  });
}

export function checkSources(units) {
  requireConfigured();
  const problems = [];
  const notes = [];
  checkPartsAligned(units, problems, notes);
  checkListParity(units, problems);
  checkIndentShapes(units, problems);
  checkUnwrapped(units, problems);
  return { problems, notes };
}
