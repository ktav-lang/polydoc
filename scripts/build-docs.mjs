#!/usr/bin/env node
// Builds this repository's own README/CHANGELOG from root-docs/ —
// dogfooding the engine polydoc ships. Run with --check for a
// CI-friendly, read-only verification (first divergence on stderr, no
// writes) instead of regenerating the files.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { configure, buildRootDocs, writeRootDocs, checkRootDocs } from '../src/index.mjs';

configure({
  langs: ['en', 'ru', 'zh'],
  rootDocuments: ['README', 'CHANGELOG'],
});

function usage() {
  process.stderr.write(
    'usage: node scripts/build-docs.mjs [--check]\n' +
    '  (no args)  regenerate README.md/.ru.md/.zh.md and CHANGELOG.md/.ru.md/.zh.md\n' +
    '  --check    verify the generated files match root-docs/ without writing\n'
  );
}

function cli() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, '..');

  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) { usage(); process.exit(0); }
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    usage();
    process.exit(1);
  }
  const checkMode = args[0] === '--check';

  let docs;
  try {
    docs = buildRootDocs(root);
  } catch (e) {
    process.stderr.write(`build-docs: ${e.message}\n`);
    process.exit(1);
  }

  if (!checkMode) {
    writeRootDocs(root, docs);
    process.stdout.write(`build-docs: assembled ${docs.size} document(s) from root-docs/\n`);
    process.exit(0);
  }

  const problems = checkRootDocs(root, docs);
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`build-docs --check: ${problem}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

const isMain = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) cli();
