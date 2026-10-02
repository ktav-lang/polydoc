>>>>> lang=en
## 0.1.1 — 2026-10-02

### Added

- Shared Markdown fragments: define `>>>>> shared=name` before language blocks
  and insert `<<<<< include=name` in each translation. Code, images, links,
  lists and tables can share one authoritative source.
- Reference-count parity rejects dropped or duplicated includes; unknown names,
  duplicate definitions, empty fragments and nested includes fail validation.
- Regression coverage for four languages, legacy inline fences, body-file scope,
  release substitution and Markdown reuse; README examples now use shared code.

### Fixed

- Transaction-lock recovery now treats a live PID with an observed process
  incarnation that differs from the lock's recorded incarnation as a reused
  PID, even before the lease expires.

>>>>> lang=ru
## 0.1.1 — 2026-10-02

### Добавлено

- Общие Markdown-фрагменты: `>>>>> shared=name` задаётся перед языковыми блоками,
  а `<<<<< include=name` вставляется в переводы. Код, изображения, ссылки,
  списки и таблицы имеют один исходник.
- Проверка числа ссылок отклоняет пропущенные и дублированные вставки;
  неизвестные имена, повторные определения, пустые фрагменты и вложенные
  подключения отклоняются при валидации.
- Регрессии покрывают четыре языка, старые code fences, область тела файла,
  подстановку версии и повторное использование Markdown; примеры README
  переведены на общий код.

### Исправлено

- При восстановлении блокировки транзакции живой PID с наблюдаемым
  идентификатором экземпляра процесса, отличающимся от записанного в
  блокировке, теперь считается повторно использованным PID, даже если срок
  аренды ещё не истёк.

>>>>> lang=zh
## 0.1.1 — 2026-10-02

### 新增

- 共享 Markdown 片段：在语言块之前定义 `>>>>> shared=name`，
  在各翻译中插入 `<<<<< include=name`。代码、图片、链接、列表和表格
  可使用同一份源内容。
- 引用次数检查拒绝遗漏或重复插入；未知名称、重复定义、空片段
  及嵌套引用均无法通过验证。
- 回归测试覆盖四种语言、旧代码围栏、正文文件作用域、版本替换
  及 Markdown 复用；README 示例改为共享代码。

### 修复

- 事务锁恢复现在会将观测到的进程实例标识与锁中记录的标识不一致的
  存活 PID 视为已被重新分配的 PID，即使租约尚未到期。

