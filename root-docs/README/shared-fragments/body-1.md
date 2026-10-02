>>>>> shared=syntax
````text
>>>>> shared=example
```js
console.log(42);
```

>>>>> shared=logo
![Logo](https://example.com/logo.svg)

>>>>> shared=links
[docs]: https://example.com/docs
````

>>>>> lang=en
## Shared Markdown fragments

Define language-independent Markdown once, before the first language block:

<<<<< include=syntax

- Inside every `>>>>> lang=<code>` block, put `<<<<< include=example`,
  `<<<<< include=logo` or `<<<<< include=links` on its own column-zero line.
  Translated link labels can use the shared definition: `[Read][docs]`.
- Names are case-sensitive ASCII identifiers: start with a letter, then use
  letters, digits, `_` or `-`. Definitions are scoped to one `body-N.md` file.
- Fragments can contain code, images, links, lists, tables or other Markdown.
  Separator blank lines at the end of definitions are excluded; internal
  whitespace is preserved. Existing language-separator restrictions still apply.
- Every configured language must use each shared name the same number of times.
  Empty definitions, unknown names, duplicate names and nested includes fail.
- Includes are not expanded inside fenced code. No files or URLs are loaded,
  and nothing is executed. Relative links keep their normal Markdown meaning.

Expansion happens before heading, split-size, translation-shape and output
checks, and before release-token substitution. Generated Markdown is complete;
readers do not need Polydoc or an include extension. Legacy inline sources remain valid.

>>>>> lang=ru
## Общие Markdown-фрагменты

Задайте независимый от языка Markdown один раз, перед первым языковым блоком:

<<<<< include=syntax

- В каждом блоке `>>>>> lang=<code>` поместите `<<<<< include=example`,
  `<<<<< include=logo` или `<<<<< include=links` отдельной строкой без отступа.
  Подписи ссылок можно переводить, сохраняя общее определение: `[Читать][docs]`.
- Имена — ASCII-идентификаторы с учётом регистра: первая буква, далее буквы,
  цифры, `_` или `-`. Область определения — один файл `body-N.md`.
- Фрагменты могут содержать код, изображения, ссылки, списки, таблицы и другой
  Markdown. Пустые строки-разделители в конце определения исключаются;
  внутренние пробелы сохраняются. Ограничения языковых разделителей остаются.
- Каждый настроенный язык должен использовать имя одинаковое число раз.
  Пустые определения, неизвестные и повторные имена, вложенные вставки отклоняются.
- Внутри code fences вставки не раскрываются. Файлы и URL не загружаются,
  ничего не исполняется. Относительные ссылки сохраняют обычный смысл Markdown.

Раскрытие выполняется до проверки заголовков, размера частей, структуры переводов
и результатов, а также до подстановки версии. Готовый Markdown самодостаточен:
читателям не нужен Polydoc или расширение вставок. Старые inline-исходники допустимы.

>>>>> lang=zh
## 共享 Markdown 片段

在第一个语言块之前，定义一次与语言无关的 Markdown：

<<<<< include=syntax

- 在每个 `>>>>> lang=<code>` 块中，将 `<<<<< include=example`、
  `<<<<< include=logo` 或 `<<<<< include=links` 放在独立且无缩进的行上。
  链接文字可翻译，同时复用定义，例如 `[阅读][docs]`。
- 名称是区分大小写的 ASCII 标识符：以字母开头，后续可用字母、数字、
  `_` 或 `-`。定义仅作用于当前 `body-N.md` 文件。
- 片段可包含代码、图片、链接、列表、表格或其他 Markdown。定义末尾的
  分隔空行不纳入内容，内部空白保持不变。语言分隔符限制仍然适用。
- 每种已配置语言对同一名称的引用次数必须相同。空定义、未知名称、
  重复名称及嵌套引用均无法通过验证。
- 代码围栏内的引用保持原样。不加载文件或 URL，也不执行内容。
  相对链接保留正常的 Markdown 语义。

展开先于标题、分块大小、翻译结构及输出检查，也先于版本占位符替换。
生成的 Markdown 是完整文档；读者无需 Polydoc 或引用扩展。
旧的内联源文件仍然有效。

