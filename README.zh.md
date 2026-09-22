[![CI](https://img.shields.io/github/actions/workflow/status/ktav-lang/polydoc/ci.yml?style=flat-square&logo=github&label=CI)](https://github.com/ktav-lang/polydoc/actions)
![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue?style=flat-square)

# polydoc

**Languages:** [English](README.md) · [Русский](README.ru.md) · **简体中文**

> 从按小节划分、三语对照翻译的源单元组装多语言文档——具备漂移防护、
> 崩溃安全的原子写入,以及结构化的翻译一致性检查。

**规范：** 这是从 [`ktav-lang/spec`](https://github.com/ktav-lang/spec)
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
- **崩溃安全的原子写入器**——对所有输出文件一次性执行带日志的
  两阶段提交、跨进程协作锁,以及在任意阶段中断后的完整恢复。在提取
  该代码的项目中,已在每个阶段转换点通过 `SIGKILL` 注入测试验证。
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

## 用法

`configure()` 必须在使用任何其他功能之前调用一次——它为整个流程
固定语言集合与文件命名约定。

```js
import {
  configure,
  buildBuffers,
  writeBuildOutputs,
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

// Write every output atomically, or verify it's already up to date:
await writeBuildOutputs('versions/1.0', 'versions/1.0/content', build);
// checkBuildOutputs(specDir, contentDir, build) — throws on the first
// byte-level divergence instead, for CI.
```

完整的导出接口见 [`src/index.mjs`](src/index.mjs)——内容组装、根文档、
注册表、结构化检查以及事务内部实现均从顶层入口重新导出。

## 许可证

可自行选择以 [Apache License, Version 2.0](LICENSE-APACHE)
或 [MIT license](LICENSE-MIT) 获得许可。
