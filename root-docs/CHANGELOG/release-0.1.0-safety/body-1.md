>>>>> lang=en
- Journalled crash recovery for output writes (`writeBuildOutputs`):
  a journalled two-phase commit with backup/install/cleanup phases,
  applied sequentially one file at a time, and a cooperative
  cross-process lock with lease/incarnation/quarantine handling. After a
  process crash, `recoverBuildOutputTransaction` restores a consistent
  pre-write state or completes a durable commit; it is not an atomic
  snapshot for unrelated readers, and durability is limited by platform
  and storage flushing support. The journal format and lock protocol are
  carried over unchanged from `ktav-lang/spec`; the test suite kills a
  real writer process with `SIGKILL` at injected crash points and checks
  recovery.
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
>>>>> lang=ru
- Журналируемое восстановление записи после падения процесса
  (`writeBuildOutputs`): журналируемый two-phase commit с фазами
  backup/install/cleanup, выполняемыми последовательно по одному файлу,
  и кооперативная межпроцессная блокировка с обработкой
  lease/incarnation/quarantine. После падения процесса
  `recoverBuildOutputTransaction` возвращает согласованное состояние до
  записи или завершает надёжно зафиксированный commit; это не атомарный
  snapshot для сторонних читателей, а durability ограничена
  возможностями платформы и хранилища по сбросу данных. Формат журнала и
  протокол блокировки перенесены из `ktav-lang/spec` без изменений;
  тесты убивают реальный процесс записи через `SIGKILL` во внедрённых
  точках падения и проверяют восстановление.
- Реестр документов (`checkDocsRegistry`/`writeFrozenDocsLock`):
  классифицирует каждый публичный Markdown-выход как генерируемый
  (пересобирается и сверяется побайтно), замороженный (исторический,
  закреплён SHA-256-блокировкой) или внутренний, так что ни устаревший
  замороженный файл, ни новый незарегистрированный не останутся
  незамеченными.
- Структурные проверки паритета переводов (`checkSources`): выравнивание
  частей между языками, паритет пунктов списка, форма отступов и
  неперенесённые (никогда не переформатированные) абзацы — проверки,
  написанные против реальных дефектов, которые попадали в корпус, пока
  все проверки на уровне готового документа всё ещё проходили.
- Сканер заголовков в подмножестве CommonMark (`findHeadings`),
  используемый, чтобы не пускать генерируемые заголовки секций в тела
  юнитов, корректно распознающий блоки кода, цитаты, списки и
  определения ссылок.
>>>>> lang=zh
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
