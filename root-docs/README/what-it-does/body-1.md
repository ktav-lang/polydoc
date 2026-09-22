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
- **Journalled crash recovery for output writes** — `writeBuildOutputs`
  journals a transaction, then backs up and installs outputs sequentially,
  one file at a time. After a process crash, recovery restores a consistent
  pre-write state or completes a durable commit. This is not an atomic
  snapshot for unrelated readers: during backup/install, a reader can
  temporarily see missing, old, or new files. If a write is interrupted,
  call `recoverBuildOutputTransaction` before the next build or validation.
  File and directory flushing is limited by platform support; Windows and
  the underlying filesystem/storage can limit durability, so this is not a
  promise that every acknowledged write survives sudden power loss.
- **A separate root-document write contract** — `writeRootDocs` writes each
  root document directly with `writeFileSync`, without this journal or
  cross-file crash recovery. It provides no cross-file snapshot guarantee;
  use `checkRootDocs`/`docs:check` to validate the result afterward.
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
- **Журналируемое восстановление записи после падения процесса** —
  `writeBuildOutputs` журналирует транзакцию, затем последовательно,
  по одному файлу, выполняет backup и install. После падения процесса
  recovery возвращает согласованное состояние до записи или завершает
  надёжно зафиксированный commit. Это не атомарный snapshot для сторонних
  читателей: во время backup/install читатель может временно увидеть
  отсутствующие, старые или новые файлы. После прерванной записи вызовите
  `recoverBuildOutputTransaction` до следующей сборки или проверки.
  Сброс данных и каталогов ограничен возможностями платформы; Windows и
  нижележащие файловая система/хранилище ограничивают durability, поэтому
  нет обещания, что каждая подтверждённая запись переживёт внезапное
  отключение питания.
- **Отдельный контракт записи корневых документов** — `writeRootDocs`
  напрямую записывает каждый документ через `writeFileSync`, без этого
  журнала и межфайлового crash recovery. Атомарный snapshot нескольких
  файлов не гарантируется; проверяйте результат через
  `checkRootDocs`/`docs:check`.
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

