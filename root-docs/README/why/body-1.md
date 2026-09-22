>>>>> lang=en
## Why

Keeping a document's translations in lockstep by hand doesn't survive
contact with a real corpus. `ktav-lang/spec` shipped a fix for exactly
this shape of defect more than once: a section that keeps every
cross-reference and every keyword while one language quietly loses most
of its bullet points, or a rendered-document parity check that passes
because it only ever looks at the final output, never the sources that
produced it. polydoc is the tooling that grew out of fixing those —
generalized so any project assembling documents from small,
per-section, multi-language units can reuse it instead of reinventing
it.

>>>>> lang=ru
## Зачем

Вручную удерживать переводы документа в синхроне не переживает встречу
с реальным корпусом. `ktav-lang/spec` не раз выпускал исправление
именно такого рода дефекта: раздел сохраняет все перекрёстные ссылки
и все ключевые слова, а один из языков незаметно теряет большую часть
пунктов списка; или проверка паритета на уровне готового документа
проходит, потому что смотрит только на финальный вывод, а не на
исходники, из которых он собран. polydoc — это инструментарий,
выросший из исправления именно таких дефектов, обобщённый так, чтобы
любой проект, собирающий документы из небольших посекционных
многоязычных юнитов, мог переиспользовать его вместо повторного
изобретения.

>>>>> lang=zh
## 为什么

靠人工手动保持文档各语言译文同步,经不起真实语料库的考验。
`ktav-lang/spec` 不止一次为这类缺陷发布过修复:某个小节保留了全部
交叉引用和关键词,却有一种语言悄悄丢失了大半个列表项;或者一项面向
最终渲染文档的一致性检查能够通过,只因为它只看最终输出,从不检查
产出它的源文件。polydoc 正是修复这些问题过程中沉淀出的工具——将其
通用化,使任何从小型、按小节划分的多语言单元组装文档的项目都能直接
复用,而不必重新发明一遍。

