// Standalone script spawned as a child process by transaction.test.mjs's
// crash-recovery scenario: SIGKILL can only be delivered to a real
// process, never simulated in-process. Configures polydoc exactly like
// the test file does, builds the fixture content directory given as
// argv[2], and writes it — with the crash env vars (set by the parent)
// free to fire mid-write, exactly as they would in a real interrupted
// build.
import { configure, buildBuffers, writeBuildOutputs } from '../src/index.mjs';

configure({
  langs: ['en', 'ru', 'zh'],
  outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
  readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' },
  sectionInventoryLockFormat: 'polydoc-test-section-inventory',
  rootDocuments: [],
});

const [, , specDir, contentDir] = process.argv;
const build = await buildBuffers(contentDir);
await writeBuildOutputs(specDir, contentDir, build);
