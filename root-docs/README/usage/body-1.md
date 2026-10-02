>>>>> shared=usage
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

recoverBuildOutputTransaction('versions/1.0', 'versions/1.0/content');
const build = await buildBuffers('versions/1.0/content', {
  requireSectionInventoryLock: true,
  sectionInventoryLockPath: 'scripts/locks/section-inventory.1.0.lock.json',
});
writeBuildOutputs('versions/1.0', 'versions/1.0/content', build);
checkBuildOutputs('versions/1.0', 'versions/1.0/content', build);
```

>>>>> lang=en
## Usage

`configure()` must run once, before anything else — it fixes the
language set and file-naming conventions for the rest of the process.

`writeBuildOutputs` provides journalled process-crash recovery, not an atomic
reader snapshot. `checkBuildOutputs` throws on byte-level divergence.

<<<<< include=usage

See [`src/index.mjs`](src/index.mjs) for the full exported surface —
content assembly, root documents, the registry, structural checks, and
the transaction internals are all re-exported from the top-level entry
point.

>>>>> lang=ru
## Использование

`configure()` должна вызываться первой: она фиксирует набор языков
и соглашения об именовании файлов для остального процесса.

`writeBuildOutputs` даёт журналируемое восстановление, не атомарный snapshot
для читателей. `checkBuildOutputs` отклоняет побайтовое расхождение.

<<<<< include=usage

См. [`src/index.mjs`](src/index.mjs) для полной экспортируемой
поверхности — сборка контента, корневые документы, реестр,
структурные проверки и внутренности транзакции реэкспортированы из
точки входа верхнего уровня.

>>>>> lang=zh
## 用法

`configure()` 必须在使用任何其他功能之前调用一次——它为整个流程
固定语言集合与文件命名约定。

`writeBuildOutputs` 支持带日志的进程崩溃恢复，不提供面向读者的原子 snapshot。
`checkBuildOutputs` 会在字节级差异出现时抛出错误。

<<<<< include=usage

完整的导出接口见 [`src/index.mjs`](src/index.mjs)——内容组装、根文档、
注册表、结构化检查以及事务内部实现均从顶层入口重新导出。

