# Changelog

**Languages:** **English** · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh.md)

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is
[Semantic Versioning](https://semver.org/) with the pre-1.0 convention
that a MINOR bump is breaking.

## 0.1.1 — 2026-10-02

### Added

- Shared Markdown fragments: define `>>>>> shared=name` before language blocks
  and insert `<<<<< include=name` in each translation. Code, images, links,
  lists and tables can share one authoritative source.
- Reference-count parity rejects dropped or duplicated includes; unknown names,
  duplicate definitions, empty fragments and nested includes fail validation.
- Regression coverage for four languages, legacy inline fences, body-file scope,
  release substitution and Markdown reuse; README examples now use shared code.

### Fixed

- Transaction-lock recovery now treats a live PID with an observed process
  incarnation that differs from the lock's recorded incarnation as a reused
  PID, even before the lease expires.

## 0.1.0 — 2026-09-22

### Added

- Initial extraction from [`ktav-lang/spec`](https://github.com/ktav-lang/spec)'s
  `scripts/build_spec/` — the engine that assembles `spec.md` and the
  repository's root documents (README, CHANGELOG, CONTRIBUTING,
  SECURITY) from per-section triple-translated source units, generalized
  behind `configure({ langs, ... })` instead of a hardcoded language set.
- Content-unit tree assembly and validation (`validateContentDir`,
  `buildBuffers`): manifest/meta/body-part shape checking, a
  paragraph-boundary-aware split planner that keeps part *k* the same
  fragment in every language, and a section-inventory lock that makes an
  added, removed or renumbered section a deliberate, printed act.
- Root-document assembly (`buildRootDocs`/`writeRootDocs`/`checkRootDocs`)
  for documents built from small per-topic units instead of one
  hand-maintained file per language. `writeRootDocs` writes each document
  directly, without the output-write journal or cross-file crash
  recovery; validate the result with `checkRootDocs`.
- Requires Node.js 24 or later.

- Journalled crash recovery for output writes (`writeBuildOutputs`):
  a journalled two-phase commit with backup/install/cleanup phases,
  applied sequentially one file at a time, and a cooperative
  cross-process lock with lease/incarnation/quarantine handling. After a
  process crash, `recoverBuildOutputTransaction` restores a consistent
  pre-write state or completes a durable commit; it is not an atomic
  snapshot for unrelated readers, and durability is limited by platform
  and storage flushing support. The journal format and lock protocol are
  carried over unchanged from `ktav-lang/spec`; the test suite kills a
  real writer process with `SIGKILL` at injected crash points and checks
  recovery.
- A docs registry (`checkDocsRegistry`/`writeFrozenDocsLock`): classifies
  every public Markdown output as generated (rebuilt and byte-checked),
  frozen (historical, pinned by a SHA-256 lock) or internal, so neither a
  stale frozen file nor a brand-new unregistered one goes unnoticed.
- Structural translation-parity checks (`checkSources`): part alignment
  across languages, list-item parity, indentation shape, and unwrapped
  (never re-flowed) paragraphs — checks written against real defects that
  reached a corpus while every rendered-document-level check still
  passed.
- A CommonMark-subset heading scanner (`findHeadings`) used to keep
  generated section headings out of unit bodies, correctly aware of
  fenced code, block quotes, lists and link reference definitions.
