>>>>> lang=en
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
  hand-maintained file per language.

>>>>> lang=ru
## 0.1.0 — 2026-09-22

### Добавлено

- Первоначальное извлечение из [`ktav-lang/spec`](https://github.com/ktav-lang/spec),
  из `scripts/build_spec/` — движка, собирающего `spec.md` и корневые
  документы репозитория (README, CHANGELOG, CONTRIBUTING, SECURITY) из
  посекционных тройно-переведённых исходных юнитов, обобщённого за
  `configure({ langs, ... })` вместо жёстко заданного набора языков.
- Сборка и валидация дерева контент-юнитов (`validateContentDir`,
  `buildBuffers`): проверка формы манифеста/meta/body-частей,
  планировщик разбиения по границам абзацев, сохраняющий часть *k*
  одним и тем же фрагментом на каждом языке, и инвентарная блокировка
  секций, делающая добавление, удаление или перенумерацию секции
  осознанным и печатаемым действием.
- Сборка корневых документов (`buildRootDocs`/`writeRootDocs`/`checkRootDocs`)
  для документов, собираемых из небольших посекционных юнитов вместо
  одного вручную ведущегося файла на язык.

>>>>> lang=zh
## 0.1.0 — 2026-09-22

### 新增

- 从 [`ktav-lang/spec`](https://github.com/ktav-lang/spec) 的
  `scripts/build_spec/` 中初步提取而来——该引擎从按小节划分、三语
  翻译的源单元组装出 `spec.md` 与仓库的根文档(README、CHANGELOG、
  CONTRIBUTING、SECURITY),并通过 `configure({ langs, ... })` 实现
  通用化,取代了硬编码的语言集合。
- 内容单元树的组装与校验(`validateContentDir`、`buildBuffers`):
  清单/元数据/正文分片的形态检查、能感知段落边界的切分规划器(使第
  *k* 部分在每种语言中始终是同一段落),以及使小节的增删或重新编号
  成为一次明确、可打印记录的操作的小节清单锁定机制。
- 根文档组装(`buildRootDocs`/`writeRootDocs`/`checkRootDocs`),面向
  由小型按主题划分的单元构建的文档,取代每种语言一份手工维护文件的
  模式。

