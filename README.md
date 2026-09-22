[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/polydoc/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/polydoc/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)

# polydoc

**Languages:** **English** · [Русский](README.ru.md) · [简体中文](README.zh.md)

> Assemble multi-language documents from per-section source units that
> carry every configured language — with drift protection, journalled
> crash recovery for output writes, and structural translation-parity
> checks.

**Origin:** this is a general-purpose extraction of the document
build engine behind [`ktav-lang/spec`](https://github.com/ktav-lang/spec) —
the same code that assembles the Ktav specification's own `spec.md` and
its root documents (README, CHANGELOG, CONTRIBUTING, SECURITY) from
per-section source units carrying every language in one file.

## Why

Keeping a document's translations in lockstep by hand doesn't survive
contact with a real corpus. `ktav-lang/spec` shipped a fix for exactly
this shape of defect more than once: a section that keeps every
cross-reference and every keyword while one language quietly loses most
of its bullet points, or a rendered-document parity check that passes
because it only ever looks at the final output, never the sources that
produced it. polydoc is the tooling that grew out of fixing those —
generalized so any project assembling documents from small,
per-section, multi-language units can reuse it instead of reinventing
it.

## What it does

- **Content-unit assembly** — a manifest of small unit directories
  (`meta.js` + `body-N.md`), each body carrying every configured
  language behind a `>>>>> lang=<code>` separator, split at the *same*
  paragraph boundary in every language so part *k* is always the same
  fragment, never three independent slices that happen to add up.
- **Root-document assembly** — the same unit shape for a handful of
  hand-maintained-feeling documents (README, CHANGELOG, ...), without
  the numbered-heading and section-inventory machinery a full spec
  needs.
- **Journalled crash recovery for output writes** — `writeBuildOutputs`
  journals a transaction, then backs up and installs outputs sequentially,
  one file at a time. After a process crash, recovery restores a consistent
  pre-write state or completes a durable commit. This is not an atomic
  snapshot for unrelated readers: during backup/install, a reader can
  temporarily see missing, old, or new files. If a write is interrupted,
  call `recoverBuildOutputTransaction` before the next build or validation.
  File and directory flushing is limited by platform support; Windows and
  the underlying filesystem/storage can limit durability, so this is not a
  promise that every acknowledged write survives sudden power loss.
- **A separate root-document write contract** — `writeRootDocs` writes each
  root document directly with `writeFileSync`, without this journal or
  cross-file crash recovery. It provides no cross-file snapshot guarantee;
  use `checkRootDocs`/`docs:check` to validate the result afterward.
- **A docs registry** — classifies every public Markdown output as
  generated (rebuilt and byte-checked), frozen (historical, pinned by a
  SHA-256 lock) or internal, so a stale frozen file and a brand-new
  unregistered one are both caught instead of silently shipping.
- **Structural translation-parity checks** — part alignment, list-item
  parity, indentation shape, and unwrapped paragraphs, checked against
  the *sources*, not the rendered output, where a defect can be pointed
  at a file and a line.

## Install

```sh
npm install @ktav-lang/polydoc
```

Requires Node.js 24 or later.

## Usage

`configure()` must run once, before anything else — it fixes the
language set and file-naming conventions for the rest of the process.

```js
import {
  configure,
  buildBuffers,
  writeBuildOutputs,
  recoverBuildOutputTransaction,
  checkBuildOutputs,
} from '@ktav-lang/polydoc';

configure({
  langs: ['en', 'ru', 'zh'],
  outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
  readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' },
  sectionInventoryLockFormat: 'my-project-section-inventory',
  rootDocuments: ['README', 'CHANGELOG'],
});

const build = await buildBuffers('versions/1.0/content', {
  requireSectionInventoryLock: true,
  sectionInventoryLockPath: 'scripts/locks/section-inventory.1.0.lock.json',
});

// Journalled process-crash recovery; this is not an atomic reader snapshot:
writeBuildOutputs('versions/1.0', 'versions/1.0/content', build);
// checkBuildOutputs(specDir, contentDir, build) — throws on the first
// byte-level divergence instead, for CI.
```

See [`src/index.mjs`](src/index.mjs) for the full exported surface —
content assembly, root documents, the registry, structural checks, and
the transaction internals are all re-exported from the top-level entry
point.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE)
or [MIT license](LICENSE-MIT) at your option.
