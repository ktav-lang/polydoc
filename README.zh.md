[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/polydoc/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/polydoc/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)

# polydoc

**Languages:** [English](README.md) · [Русский](README.ru.md) · **简体中文**

> 从按小节划分、携带全部已配置语言的源单元组装多语言文档——具备漂移防护、
> 支持日志恢复的写入,以及结构化的翻译一致性检查。

**来源：** 这是从 [`ktav-lang/spec`](https://github.com/ktav-lang/spec)
中提取出的通用文档构建引擎——正是同一套代码,用于从按小节划分、单文件内
承载所有语言的源单元组装出 Ktav 规范自身的 `spec.md` 及其根文档
(README、CHANGELOG、CONTRIBUTING、SECURITY)。

## 为什么

靠人工手动保持文档各语言译文同步,经不起真实语料库的考验。
`ktav-lang/spec` 不止一次为这类缺陷发布过修复:某个小节保留了全部
交叉引用和关键词,却有一种语言悄悄丢失了大半个列表项;或者一项面向
最终渲染文档的一致性检查能够通过,只因为它只看最终输出,从不检查
产出它的源文件。polydoc 正是修复这些问题过程中沉淀出的工具——将其
通用化,使任何从小型、按小节划分的多语言单元组装文档的项目都能直接
复用,而不必重新发明一遍。

## 功能

- **内容单元组装**——由若干小型单元目录组成的清单(`meta.js` +
  `body-N.md`),每个正文在 `>>>>> lang=<code>` 分隔符后携带全部已配置
  语言,并在*同一*段落边界处对所有语言进行切分,使第 *k* 部分在每种
  语言中始终是同一段落,而不是三段恰好总量相符的独立切片。
- **根文档组装**——为一批"看起来像手工维护"的文档(README、
  CHANGELOG 等)提供同样的单元形态,而无需完整规范才需要的编号标题
  与小节清单锁定机制。
- **带日志的进程崩溃恢复写入**——`writeBuildOutputs` 记录事务，然后
  按顺序逐个文件执行 backup 和 install。进程崩溃后，recovery 会恢复到
  写入前的一致状态，或完成已经持久提交的事务。这不是面向无关读者的
  原子 snapshot：在 backup/install 期间，读者可能暂时看到缺失、旧的或
  新的文件。写入中断后，必须在下一次 build 或 validation 前调用
  `recoverBuildOutputTransaction`。文件和目录刷新受平台支持限制；
  Windows 及底层文件系统/存储设备会限制 durability，因此不承诺每次
  已确认的写入都能在突然断电后保留。
- **独立的根文档写入契约**——`writeRootDocs` 通过 `writeFileSync`
  直接逐个写入根文档，不使用此日志，也不提供跨文件崩溃恢复或 snapshot
  保证；写入后使用 `checkRootDocs`/`docs:check` 验证结果。
- **文档注册表**——将每个公开的 Markdown 输出分类为生成型(重新构建
  并逐字节校验)、冻结型(历史文件,由 SHA-256 锁固定)或内部型,使
  过期的冻结文件与新出现却未注册的文件都能被发现,而不会悄悄发布。
- **结构化翻译一致性检查**——针对*源文件*而非渲染输出检查部分对齐、
  列表项对齐、缩进形状与未换行的段落,使缺陷可以精确定位到文件与
  行号。

## 安装

```sh
npm install @ktav-lang/polydoc
```

需要 Node.js 24 或更高版本。

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

## 许可证

可自行选择以 [Apache License, Version 2.0](LICENSE-APACHE)
或 [MIT license](LICENSE-MIT) 获得许可。
