>>>>> lang=en
- A crash-safe atomic multi-file writer (`writeBuildOutputs`): journalled
  two-phase commit with backup/install/cleanup phases, a cooperative
  cross-process lock with lease/incarnation/quarantine handling, and full
  recovery after a kill at any point — the journal format and lock
  protocol are unchanged from the code this was extracted from, which has
  exercised them under `SIGKILL` injection at every phase transition.
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
- Crash-safe атомарный multi-file writer (`writeBuildOutputs`):
  журналируемый two-phase commit с фазами backup/install/cleanup,
  кооперативная межпроцессная блокировка с обработкой
  lease/incarnation/quarantine и полное восстановление после падения на
  любой точке — формат журнала и протокол блокировки не изменены
  относительно кода, из которого это извлечено, а тот проверялся под
  инъекцией `SIGKILL` на каждом переходе фазы.
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
- 崩溃安全的原子多文件写入器(`writeBuildOutputs`):带备份/安装/清理
  阶段的日志式两阶段提交、具备租约/化身/隔离处理的跨进程协作锁,以及
  在任意时刻被中断后的完整恢复——日志格式与锁协议与被提取自的代码
  保持一致,该代码已在每个阶段转换点通过 `SIGKILL` 注入测试验证。
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
