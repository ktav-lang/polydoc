import { LANGS } from '../config.mjs';
import { isFenceCloser, parseFenceOpener } from './blocks.mjs';

const NAME = '[A-Za-z][A-Za-z0-9_-]*';
const DEFINITION = new RegExp(`^>>>>> shared=(${NAME})$`);
const INCLUDE = new RegExp(`^<<<<< include=(${NAME})$`);

/** Shared Markdown definitions are local to one body file. */
export function expandSharedFragments(src, reject, label) {
  if (!src.startsWith('>>>>> shared=') && !src.includes('<<<<< include=')) return src;
  const lines = src.split('\n');
  const shared = new Map();
  let index = 0;
  while (lines[index]?.startsWith('>>>>> shared=')) {
    const match = DEFINITION.exec(lines[index]);
    if (!match) reject(`${label}: invalid shared fragment name at line ${index + 1}`);
    const name = match[1];
    if (shared.has(name)) reject(`${label}: duplicate shared fragment name ${name}`);
    const first = ++index;
    let fragmentFence = null;
    while (index < lines.length) {
      const line = lines[index];
      if (fragmentFence) {
        if (line.startsWith('>>>>> lang=')) reject(`${label}: shared fragment ${name} contains a reserved language separator`);
        if (isFenceCloser(line, fragmentFence)) fragmentFence = null;
      } else {
        if (line.startsWith('>>>>> shared=') || line.startsWith('>>>>> lang=')) break;
        fragmentFence = parseFenceOpener(line);
        if (!fragmentFence && line.startsWith('<<<<< include=')) reject(`${label}: shared fragments cannot include other fragments`);
      }
      index++;
    }
    if (fragmentFence) reject(`${label}: shared fragment ${name} has no closing fence`);
    let end = index;
    while (end > first && lines[end - 1] === '') end--;
    const fragment = lines.slice(first, end).join('\n');
    if (!fragment.trim()) reject(`${label}: shared fragment ${name} is empty`);
    shared.set(name, fragment);
  }

  const output = [];
  const references = new Map();
  let language = null;
  let fence = null;
  for (; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      if (isFenceCloser(line, fence)) fence = null;
      output.push(line);
      continue;
    }
    const opener = parseFenceOpener(line);
    if (opener) {
      fence = opener;
      output.push(line);
      continue;
    }
    if (line.startsWith('>>>>> lang=')) language = line.slice('>>>>> lang='.length);
    if (line.startsWith('<<<<< include=')) {
      const match = INCLUDE.exec(line);
      if (!match) reject(`${label}: invalid shared fragment reference at line ${index + 1}`);
      if (!shared.has(match[1])) reject(`${label}: unknown shared fragment ${match[1]} at line ${index + 1}`);
      if (!references.has(language)) references.set(language, new Map());
      const counts = references.get(language);
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      output.push(shared.get(match[1]));
    } else {
      output.push(line);
    }
  }
  for (const name of shared.keys()) {
    const counts = LANGS.map(lang => references.get(lang)?.get(name) ?? 0);
    if (counts.some(count => count !== counts[0])) {
      reject(`${label}: shared fragment ${name} reference counts differ (${LANGS.map((lang, i) => `${lang}=${counts[i]}`).join(' ')})`);
    }
  }
  return output.join('\n');
}
