import assert from 'node:assert/strict';
import test from 'node:test';

import { checkSources } from '../../src/index.mjs';
import '../helpers.mjs'; // configure() side effect — each test file runs in its own module graph

const unit = (name, parts) => [{ unit: name, parts }];

const run = (units) => checkSources(units);

test('a clean unit produces no problems', () => {
  const { problems } = run(unit('sec-1', [{
    en: '- one\n- two\n',
    ru: '- один\n- два\n',
    zh: '- 一\n- 二\n',
  }]));
  assert.deepEqual(problems, []);
});

test('a dropped bullet is caught — the defect a rendered-document gate misses', () => {
  const { problems } = run(unit('sec-1', [{
    en: '- alpha (§ 5.8)\n- beta (§ 3.7)\n- gamma (§ 3.6)\n',
    ru: '- альфа (§ 5.8)\n- бета (§ 3.7)\n- гамма (§ 3.6)\n',
    zh: '- 甲 (§ 5.8)\n- 乙 (§ 3.7)\n',
  }]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /bullet count differs \(en=3 ru=3 zh=2\)/);
  assert.match(problems[0], /dropped or invented list items/);
});

test('an item landing in a different part across languages is caught', () => {
  const { problems } = run(unit('sec-5.9', [
    { en: 'see § 5.2 here\n', ru: 'ничего\n', zh: '无\n' },
    { en: 'tail\n', ru: 'см. § 5.2 здесь\n', zh: '见 § 5.2\n' },
  ]));
  assert.ok(problems.some((p) => /sits in different parts across languages/.test(p)));
});

test('the same item counted differently inside one part is a note, not a failure', () => {
  // checkPartsAligned only looks at multi-part units — the note-vs-failure
  // distinction is specifically about count, not placement, so both parts
  // here mention § 5.2 in the SAME part index, just a different number of
  // times.
  const { problems, notes } = run(unit('sec-1', [
    { en: 'see § 5.2 and § 5.2 again\n', ru: 'см. § 5.2\n', zh: '见 § 5.2\n' },
    { en: 'tail\n', ru: 'хвост\n', zh: '尾部\n' },
  ]));
  assert.deepEqual(problems, []);
  assert.ok(notes.some((n) => /same part, different count/.test(n)));
});

test('an indent the reference language never uses, unjustified by a list marker, is caught', () => {
  const { problems } = run(unit('sec-1', [{
    en: 'text\n',
    ru: '  text indented by two\n',
    zh: 'text\n',
  }]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ru indents by 2, which English never uses/);
});

test('a list-marker-justified continuation indent is not flagged', () => {
  const { problems } = run(unit('sec-1', [{
    en: '- a long english bullet on one line\n',
    ru: '- короткая\n  продолжение на второй строке\n',
    zh: '- 短\n',
  }]));
  assert.deepEqual(problems, []);
});

test('an unwrapped translation line far wider than the reference is caught', () => {
  const enLine = 'short english line';
  const ruLine = 'очень длинная строка на русском языке которая совсем не была перенесена и продолжает идти дальше и дальше без остановки вообще';
  const { problems } = run(unit('sec-1', [{ en: `${enLine}\n`, ru: `${ruLine}\n`, zh: 'short\n' }]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ru line 1 is \d+ columns against an English maximum of \d+/);
  assert.match(problems[0], /re-wrap it/);
});

test('fenced code blocks are exempt from every check', () => {
  const { problems } = run(unit('sec-1', [{
    en: '```\nsome code with weird   indentation\n```\n',
    ru: '```\n            way more indentation than en\n```\n',
    zh: '```\ncode\n```\n',
  }]));
  assert.deepEqual(problems, []);
});

test('a single-part unit is never checked for cross-part alignment', () => {
  const { problems } = run(unit('sec-1', [{
    en: 'see § 5.2\n', ru: 'ничего про параграф\n', zh: '无\n',
  }]));
  assert.deepEqual(problems, []);
});
