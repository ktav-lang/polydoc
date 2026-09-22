>>>>> lang=en
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

>>>>> lang=ru
## Использование

`configure()` должна быть вызвана один раз, прежде чем что-либо ещё —
она фиксирует набор языков и соглашения об именовании файлов для
остального процесса.

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

// Журналируемое восстановление после падения процесса; не атомарный snapshot:
writeBuildOutputs('versions/1.0', 'versions/1.0/content', build);
// checkBuildOutputs(specDir, contentDir, build) — throws on the first
// byte-level divergence instead, for CI.
```

См. [`src/index.mjs`](src/index.mjs) для полной экспортируемой
поверхности — сборка контента, корневые документы, реестр,
структурные проверки и внутренности транзакции реэкспортированы из
точки входа верхнего уровня.

>>>>> lang=zh
## 用法

`configure()` 必须在使用任何其他功能之前调用一次——它为整个流程
固定语言集合与文件命名约定。

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

// 通过日志支持进程崩溃恢复；这不是面向读者的原子 snapshot：
writeBuildOutputs('versions/1.0', 'versions/1.0/content', build);
// checkBuildOutputs(specDir, contentDir, build) — throws on the first
// byte-level divergence instead, for CI.
```

完整的导出接口见 [`src/index.mjs`](src/index.mjs)——内容组装、根文档、
注册表、结构化检查以及事务内部实现均从顶层入口重新导出。

