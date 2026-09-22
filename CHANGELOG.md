# Changelog

**Languages:** **English** · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh.md)

All notable changes to this project are documented here. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is
[Semantic Versioning](https://semver.org/) with the pre-1.0 convention
that a MINOR bump is breaking.

## Unreleased

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
  hand-maintained file per language.

- A crash-safe atomic multi-file writer (`writeBuildOutputs`): journalled
  two-phase commit with backup/install/cleanup phases, a cooperative
  cross-process lock with lease/incarnation/quarantine handling, and full
  recovery after a kill at any point — the journal format and lock
  protocol are unchanged from the code this was extracted from, which has
  exercised them under `SIGKILL` injection at every phase transition.
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
