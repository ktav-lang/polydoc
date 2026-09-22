>>>>> lang=en
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
- **A crash-safe atomic writer** — journalled two-phase commit across
  every output file at once, a cooperative cross-process lock, and full
  recovery after a kill at any phase. Exercised under `SIGKILL`
  injection at every transition in the codebase this was extracted from.
- **A docs registry** — classifies every public Markdown output as
  generated (rebuilt and byte-checked), frozen (historical, pinned by a
  SHA-256 lock) or internal, so a stale frozen file and a brand-new
  unregistered one are both caught instead of silently shipping.
- **Structural translation-parity checks** — part alignment, list-item
  parity, indentation shape, and unwrapped paragraphs, checked against
  the *sources*, not the rendered output, where a defect can be pointed
  at a file and a line.

>>>>> lang=ru
## Что делает

- **Сборка контент-юнитов** — манифест небольших директорий-юнитов
  (`meta.js` + `body-N.md`), каждое тело несёт все настроенные языки
  за разделителем `>>>>> lang=<code>`, разрезанные по *одной и той же*
  границе абзаца во всех языках, так что часть *k* всегда одна и та же
  часть текста, а не три независимых куска, которые просто совпадают
  по сумме.
- **Сборка корневых документов** — та же форма юнита для горстки
  документов, которые обычно ведут вручную (README, CHANGELOG, ...),
  без машинерии нумерованных заголовков и инвентарной блокировки
  секций, нужной полноценной спецификации.
- **Crash-safe атомарный writer** — журналируемый two-phase commit по
  всем выходным файлам сразу, кооперативная межпроцессная блокировка
  и полное восстановление после падения на любой фазе. Проверен под
  инъекцией `SIGKILL` на каждом переходе в кодовой базе, из которой
  извлечён.
- **Реестр документов** — классифицирует каждый публичный Markdown-
  выход как генерируемый (пересобирается и сверяется побайтно),
  замороженный (исторический, закреплён SHA-256-блокировкой) или
  внутренний, так что и устаревший замороженный файл, и новый
  незарегистрированный, будут пойманы, а не тихо уйдут в релиз.
- **Структурные проверки паритета переводов** — выравнивание частей,
  паритет пунктов списка, форма отступов и неперенесённые абзацы,
  проверяются относительно *исходников*, а не отрендеренного вывода,
  где на дефект можно указать файлом и строкой.

>>>>> lang=zh
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

