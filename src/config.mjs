import path from 'node:path';

// polydoc is configured once per process, before any other export is used.
// Every other module reads these as live ES-module bindings (a `let`
// export's value is a live reference, not a snapshot — a later
// reassignment here is visible to every importer that reads it after
// configure() runs), so configure() must run before any content is built
// or checked, not merely before this module is imported.
export let LANGS = null;
export let OUT_FILES = null;
export let README_FILES = null;
export let README_SOURCE_FILE = 'README.source.md';
export let SECTION_INVENTORY_LOCK_FORMAT = 'polydoc-section-inventory';
export let ROOT_DOCUMENTS = [];

export const BODY_FILE_RE = /^body-(\d+)\.md$/u;
export const bodyFileName = (k) => `body-${k}.md`;
// The separator deliberately is NOT Markdown syntax that the document
// itself uses. `##` was the obvious choice and the wrong one: a heading
// marker is the single most common construct in a specification, so the
// delimiter would have competed with the content it delimits.
export const LANG_SEPARATOR_RE = /^>>>>> lang=.*$/gm;
export const langSeparator = (lang) => `>>>>> lang=${lang}`;
export const RELEASE_FILE = 'release.js';
// These names are inputs owned by the content validator. Generated outputs
// must never be allowed to replace any of them.
export const CONTENT_SERVICE_FILE_NAMES = Object.freeze([
  'manifest.js', RELEASE_FILE, 'package.json', 'readme-units',
]);
export const VERSION_TOKEN = '@@VERSION@@';
export const DATE_TOKEN = '@@DATE@@';
export const MINOR_LINE_TOKEN = '@@MINOR_LINE@@';

// The supported minor line a release version belongs to, e.g.
// '0.8.0' -> '0.8.x'. Derived, never stored.
export function minorLineOf(version) {
  return `${version.split('.').slice(0, 2).join('.')}.x`;
}

const NUMBERED_HEADING_PREFIX_RE = /^\d+(?:\.\d+)*/u;
const UNICODE_WORD_CODE_POINT_RE = /^[\p{L}\p{N}_]/u;

const BODY_LINE_LIMIT = 40;
const BODY_TARGET_LINES = 30;
// The split rule targets roughly 30 lines per file. This cap still permits
// about 122,880 body lines, but prevents metadata from driving an unbounded
// body-file loop before the files themselves have been inspected.
export const MAX_BODY_PARTS = 4096;

function fail(msg) {
  throw new Error(msg);
}

function foldedName(name) {
  return name.toLowerCase();
}

function validateFileName(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    fail(`polydoc.configure: ${label} must be a non-empty string`);
  }
  // Configuration names are single directory entries. Rejecting Windows
  // syntax on every platform keeps a checked-in config portable.
  if (value === '.' || value === '..' || /[\\/]/u.test(value) ||
      /[\u0000-\u001f\u007f<>:"|?*]/u.test(value) ||
      /[ .]$/u.test(value) || path.isAbsolute(value) ||
      /^[A-Za-z]:/u.test(value) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu.test(value)) {
    fail(`polydoc.configure: ${label} must be a safe file name without path separators or reserved Windows characters`);
  }
}

function validateNameMap(config, key, langs) {
  const values = config[key];
  if (values === undefined) return [];
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    fail(`polydoc.configure: ${key} must be an object of file names`);
  }
  const result = [];
  for (const lang of langs) {
    const value = values[lang];
    validateFileName(value, `${key}.${lang}`);
    result.push({ lang, value });
  }
  return result;
}

/// Must be called exactly once, before any other polydoc export is used
/// (content building, checking, or writing). Re-calling it — e.g. between
/// independent test cases in the same process — is fine; it simply
/// replaces the previous configuration.
///
/// `langs`: the fixed set of languages every source carries, in the
///   canonical key order (this is what "triple" means when langs has
///   three entries — nothing else in polydoc assumes exactly three).
/// `outFileNames`: `{ [lang]: filename }` for the release document
///   (e.g. `spec.md`, `spec.ru.md`, `spec.zh.md`).
/// `readmeFileNames`: `{ [lang]: filename }` for the per-version README
///   generated alongside it.
/// `readmeSourceFile`: the single-file README source name (default
///   `README.source.md`), used only when a version's content directory
///   has no `readme-units/` tree.
/// `sectionInventoryLockFormat`: the `format` field written to and
///   checked in the section-inventory lock — keep this byte-identical to
///   whatever an existing checked-in lock file already says, or every
///   existing lock fails validation.
/// `rootDocuments`: the ordered list of repository-root documents
///   (e.g. `['README', 'CHANGELOG', 'CONTRIBUTING', 'SECURITY']`).
export function configure(config) {
  if (!Array.isArray(config?.langs) || config.langs.length === 0 ||
      !config.langs.every((l) => typeof l === 'string' && l.length > 0) ||
      new Set(config.langs).size !== config.langs.length) {
    fail('polydoc.configure: langs must be a non-empty array of unique non-empty strings');
  }
  const outNames = validateNameMap(config, 'outFileNames', config.langs);
  const readmeNames = validateNameMap(config, 'readmeFileNames', config.langs);
  const readmeSourceFile = config.readmeSourceFile ?? 'README.source.md';
  validateFileName(readmeSourceFile, 'readmeSourceFile');
  const sourceServiceName = CONTENT_SERVICE_FILE_NAMES.find(
    (name) => foldedName(name) === foldedName(readmeSourceFile));
  if (sourceServiceName !== undefined) {
    fail(`polydoc.configure: readmeSourceFile ${JSON.stringify(readmeSourceFile)} conflicts with protected content input ${JSON.stringify(sourceServiceName)}`);
  }

  const protectedNames = new Map([
    ...CONTENT_SERVICE_FILE_NAMES.map((name) => [foldedName(name), name]),
    [foldedName(readmeSourceFile), 'readmeSourceFile'],
  ]);
  const outputNames = [...outNames, ...readmeNames];
  const seenOutputs = new Map();
  for (const { lang, value } of outputNames) {
    const folded = foldedName(value);
    const prior = seenOutputs.get(folded);
    if (prior !== undefined) {
      fail(`polydoc.configure: output names ${JSON.stringify(prior.value)} (${prior.lang}) and ${JSON.stringify(value)} (${lang}) collide case-insensitively`);
    }
    seenOutputs.set(folded, { lang, value });
    const protectedName = protectedNames.get(folded);
    if (protectedName !== undefined) {
      fail(`polydoc.configure: output name ${JSON.stringify(value)} conflicts with protected content input ${JSON.stringify(protectedName)}`);
    }
  }
  if (config.rootDocuments !== undefined &&
      (!Array.isArray(config.rootDocuments) ||
       !config.rootDocuments.every((d) => typeof d === 'string' && d.length > 0))) {
    fail('polydoc.configure: rootDocuments must be an array of non-empty strings');
  }

  LANGS = [...config.langs];
  OUT_FILES = config.outFileNames !== undefined ? { ...config.outFileNames } : null;
  README_FILES = config.readmeFileNames !== undefined ? { ...config.readmeFileNames } : null;
  README_SOURCE_FILE = readmeSourceFile;
  SECTION_INVENTORY_LOCK_FORMAT = config.sectionInventoryLockFormat ?? 'polydoc-section-inventory';
  ROOT_DOCUMENTS = config.rootDocuments !== undefined ? [...config.rootDocuments] : [];
}

export function requireConfigured() {
  if (LANGS === null) {
    fail('polydoc: configure({ langs: [...], ... }) must be called before use');
  }
}

export function defaultSectionInventoryLockPath(contentDir, lockFileName) {
  return path.resolve(
    contentDir, '..', '..', '..', 'scripts', 'locks', lockFileName);
}

export { BODY_LINE_LIMIT, BODY_TARGET_LINES, NUMBERED_HEADING_PREFIX_RE, UNICODE_WORD_CODE_POINT_RE };
