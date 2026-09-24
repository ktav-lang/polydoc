# 变更日志

**Languages:** [English](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · **简体中文**

本项目的所有重要变更均记录于此。格式遵循
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),版本管理遵循
[Semantic Versioning](https://semver.org/),并采用 pre-1.0 约定:
MINOR 版本号递增可以是破坏性变更。

## 尚未发布

### 修复

- 事务锁恢复现在会将观测到的进程实例标识与锁中记录的标识不一致的
  存活 PID 视为已被重新分配的 PID，即使租约尚未到期。

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
  模式。`writeRootDocs` 直接逐个写入文档，不使用输出写入日志，也不提供
  跨文件崩溃恢复；写入后使用 `checkRootDocs` 验证结果。
- 需要 Node.js 24 或更高版本。

- 带日志的进程崩溃恢复写入(`writeBuildOutputs`):带备份/安装/清理
  阶段、按顺序逐个文件执行的日志式两阶段提交，以及具备租约/化身/隔离
  处理的跨进程协作锁。进程崩溃后,`recoverBuildOutputTransaction` 会
  恢复到写入前的一致状态，或完成已经持久提交的事务；这不是面向无关
  读者的原子 snapshot,durability 也受平台与存储设备刷新能力的限制。
  日志格式与锁协议从 `ktav-lang/spec` 原样沿用；测试套件会在注入的
  崩溃点用 `SIGKILL` 终止真实的写入进程，并验证恢复结果。
- 文档注册表(`checkDocsRegistry`/`writeFrozenDocsLock`):将每个公开
  的 Markdown 输出分类为生成型(重新构建并逐字节校验)、冻结型(历史
  文件,由 SHA-256 锁固定)或内部型,使过期的冻结文件与新出现却未
  注册的文件都不会被忽略。
- 结构化翻译一致性检查(`checkSources`):跨语言的部分对齐、列表项
  对齐、缩进形状,以及未换行(从未重新排版)的段落——这些检查针对
  的是真实存在过的缺陷:当时所有面向渲染文档的检查仍然通过,缺陷却
  已经进入了语料库。
- 一个 CommonMark 子集标题扫描器(`findHeadings`),用于防止生成的
  小节标题混入单元正文,并能正确识别围栏代码块、块引用、列表与链接
  引用定义。
