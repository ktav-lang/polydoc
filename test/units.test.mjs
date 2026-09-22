import assert from 'node:assert/strict';
import test from 'node:test';

import { findHeadings } from '../src/index.mjs';
import './helpers.mjs'; // configure() side effect

test('a plain ATX heading is found', () => {
  const headings = findHeadings('# Title\n\nbody\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].type, 'ATX');
  assert.equal(headings[0].level, 1);
});

test('a heading-looking line inside a fenced code block is not a heading', () => {
  const headings = findHeadings('```\n# not a heading\n```\n');
  assert.deepEqual(headings, []);
});

test('a heading-looking line inside a block quote is still found, at that container', () => {
  const headings = findHeadings('> # quoted heading\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].container, 'root/quote');
});

test('a heading inside a list item is found, at a list container', () => {
  const headings = findHeadings('- item\n  # heading in list\n');
  assert.equal(headings.length, 1);
  assert.match(headings[0].container, /^root\/list-\d+$/);
});

test('a Setext heading (underlined paragraph) is found', () => {
  const headings = findHeadings('Title\n=====\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].type, 'Setext');
  assert.equal(headings[0].level, 1);
});

test('a thematic break is not mistaken for a Setext underline', () => {
  const headings = findHeadings('paragraph\n\n---\n');
  assert.deepEqual(headings, []);
});

test('an unterminated link reference definition does not swallow a following heading', () => {
  const headings = findHeadings('[ref]: /url "unterminated\n# real heading\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].type, 'ATX');
});

test('a complete link reference definition consumes its lines without producing a heading', () => {
  const headings = findHeadings('[ref]: /url "title"\n\nbody\n');
  assert.deepEqual(headings, []);
});

test('a raw HTML block opener outside a fence is found as an HTML heading', () => {
  const headings = findHeadings('<div>\n\nprose after\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].type, 'HTML');
});

test('an HTML block opener inside a fence is not treated as HTML', () => {
  const headings = findHeadings('```\n<div>\n```\n');
  assert.deepEqual(headings, []);
});

test('nested blockquote and list containers compose correctly', () => {
  const headings = findHeadings('> - # nested heading\n');
  assert.equal(headings.length, 1);
  assert.match(headings[0].container, /^root\/quote\/list-\d+$/);
});

test('a heading after a closed fence is still detected', () => {
  const headings = findHeadings('```\ncode\n```\n# after fence\n');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].raw, '# after fence');
});
