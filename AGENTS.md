# AGENTS.md

Guidance for coding agents working in this repository. Humans: see
[README.md](README.md).

## What this is

`@ktav-lang/polydoc` — a zero-dependency Node.js (ESM, `>=24`) library that
assembles multi-language Markdown documents from per-section source units.
It was extracted from `ktav-lang/spec`'s `scripts/build_spec/`, which still
consumes it; behaviour changes here ship to that corpus.

## Commands

```sh
npm test              # node --test, whole suite (~15 s)
npm run docs:build    # regenerate README*.md / CHANGELOG*.md from root-docs/
npm run docs:check    # read-only: fail if generated docs drift from root-docs/
npm pack --dry-run    # inspect what would be published
```

CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run docs:check` on
Ubuntu, Windows and macOS. Both must pass before a change is done.

## Layout

| Path | Role |
|---|---|
| `src/index.mjs` | Public surface: `export *` from every module below. |
| `src/config.mjs` | `configure()` — must run once before any other export; values are live `let` bindings read by every module. |
| `src/units/` | Unit decoding (`>>>>> lang=` blocks) and the CommonMark-subset heading scanner (`blocks.mjs`, `containers.mjs`). |
| `src/content.mjs` | Content-unit tree validation/assembly, split planner, section-inventory lock. |
| `src/root_doc_units.mjs`, `src/root_docs.mjs` | Root-document (README, CHANGELOG, ...) assembly and `writeRootDocs`/`checkRootDocs`. |
| `src/outputs.mjs` | `writeBuildOutputs` / `checkBuildOutputs`. |
| `src/transaction/` | Journal, cross-process lock, backup/install/cleanup, rollback, recovery. |
| `src/registry.mjs` | Docs registry: generated / frozen (SHA-256 lock) / internal. |
| `src/check_sources.mjs` | Structural translation-parity checks over sources. |
| `root-docs/` | Sources of this repo's own README and CHANGELOG (dogfooding). |
| `scripts/build-docs.mjs` | Builds/checks the files above. |
| `test/*.test.mjs` | `node:test` suites; `test/helpers.mjs` holds fixtures and the shared `configure()` call. |
| `test-support/write-outputs.mjs` | Child process killed with `SIGKILL` by crash-recovery tests. |

## Editing documentation

- `README*.md` and `CHANGELOG*.md` at the root are **generated**. Never edit
  them directly — edit `root-docs/<DOC>/<unit>/body-N.md`, then run
  `npm run docs:build`. Unit order is `root-docs/<DOC>/manifest.js`.
- Every body carries all languages (`en`, `ru`, `zh`) behind
  `>>>>> lang=<code>` separators. A change in one language must be made in
  all three, with the same list-item count and structure.
- Keep README, CHANGELOG and the `package.json` `description` consistent:
  the same guarantee must be described with the same precision everywhere.
  In particular, `writeBuildOutputs` is journalled crash recovery, **not** an
  atomic snapshot for readers, and durability is platform-limited;
  `writeRootDocs` has no journal at all.
- Claims about tests or behaviour must be verifiable in this repository.

## Invariants — do not break

- **No runtime dependencies.** Node built-ins only.
- **Public API is everything `src/index.mjs` re-exports.** Renaming or
  removing an export, or changing a signature, is breaking (pre-1.0: MINOR
  bump) and needs a CHANGELOG entry.
- **Writers are synchronous.** `writeBuildOutputs`, `writeRootDocs`,
  `recoverBuildOutputTransaction` do not return promises; `buildBuffers` is
  `async`.
- **Journal format and lock protocol** must stay compatible with
  `ktav-lang/spec`; an existing journal or lock on disk must still recover.
  Do not change them without an explicit request.
- **Crash-injection hooks** in `src/outputs.mjs` use the legacy
  `KTAV_BUILD_SPEC_CRASH_*` environment variables; tests depend on those
  names.
- **No hardcoded language set.** Nothing may assume exactly three languages;
  take them from `configure()`.
- **Configured outputs must never overwrite inputs** (see
  `test/config-output-safety.test.mjs`).
- **LF everywhere.** `.gitattributes` forces `eol=lf`; generated output must
  be byte-identical on every OS.

## Tests

- Framework: `node:test` + `node:assert/strict`; no test dependencies.
- Tests work in `fs.mkdtempSync(os.tmpdir())` directories — never in the
  repository tree.
- A failing or flaky test is fixed at its real cause, not retried or
  skipped. Windows-specific file-locking and rename behaviour is a common
  cause; keep tests portable.
- New behaviour needs a test in the matching `test/*.test.mjs` file.

## Release

1. Set the version in `package.json` (only when asked).
2. Rename the CHANGELOG heading in `root-docs/CHANGELOG/` to
   `## X.Y.Z — YYYY-MM-DD` in all three languages; `npm run docs:build`.
3. Commit, tag `vX.Y.Z`, push, create the GitHub Release.
4. `.github/workflows/publish.yml` publishes on Release (or
   `workflow_dispatch`): OIDC trusted publishing first, falling back to the
   `NPM_TOKEN` secret; `--provenance` is always on. It checks that the tag
   matches `package.json`.

Do not bump versions, commit, push, tag or publish unless explicitly asked.

## Don'ts

- Don't commit machine-specific paths, session logs or checkpoints
  (`docs/checkpoints/` is ignored).
- Don't add files to the npm package: `files` in `package.json` is an
  explicit allow-list.
- Don't touch `worktrees/` or `.rush/` — local tooling state.
