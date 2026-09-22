import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TRANSACTION_FORMAT,
  TRANSACTION_JOURNAL_FILE,
  TRANSACTION_JOURNAL_TMP_FILE,
  TRANSACTION_LOCK_CLAIM_FORMAT,
  TRANSACTION_LOCK_CLAIM_VERSION,
  TRANSACTION_LOCK_FILE,
  TRANSACTION_LOCK_FORMAT,
  TRANSACTION_LOCK_LEASE_MS,
  TRANSACTION_LOCK_UNVERIFIED_INCARNATION,
  TRANSACTION_LOCK_VERSION,
  TRANSACTION_VERSION,
  acquireTransactionLock,
  assertDigest,
  assertTransactionLockOwned,
  claimExactStaleFile,
  cleanExistingClaims,
  cleanExistingQuarantines,
  cleanJournalTmpIfSafe,
  cleanLegacyFixedArtifacts,
  cleanMalformedLegacyQuarantine,
  cleanStaleCandidateTemps,
  cleanStaleLockClaimTemps,
  cleanStaleLockLeaseTemps,
  completeOne,
  configure,
  hashBytes,
  journalStateJson,
  lockClaimEqual,
  lockClaimIsActive,
  lockClaimPathForTarget,
  lockIdentityEqual,
  lockIncarnationForOwner,
  lockIsActive,
  lockJson,
  lockLeasePath,
  lockOwnerPath,
  lockRecordQuarantinePath,
  lockReleasePath,
  outputPaths,
  ownerHintFromCorruptSource,
  pendingTransactionPaths,
  readLock,
  readLockClaim,
  readTransactionJournal,
  releaseTransactionLock,
  rollbackOne,
  transactionArtifactName,
  transactionLockPath,
  transactionOutputs,
  transactionOutputArtifactInfo,
  transactionLockGuard,
  transactionLockOwnershipGuard,
  validateJournalState,
  verifyNew,
  verifyOld,
  writeJournalSnapshot,
  writeLockCandidate,
} from '../src/index.mjs';

configure({
  langs: ['en', 'ru', 'zh'],
  outFileNames: { en: 'spec.md', ru: 'spec.ru.md', zh: 'spec.zh.md' },
  readmeFileNames: { en: 'README.md', ru: 'README.ru.md', zh: 'README.zh.md' },
  sectionInventoryLockFormat: 'polydoc-test-section-inventory',
  rootDocuments: ['README', 'CHANGELOG'],
});

const INC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const INC_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NONCE_A = '11111111111111111111111111111111';
const NONCE_B = '22222222222222222222222222222222';
const NONCE_C = '33333333333333333333333333333333';

function tempDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'polydoc-txn-gap-')));
}

function withTemp(run) {
  const specDir = tempDir();
  const contentDir = path.join(specDir, 'content');
  fs.mkdirSync(contentDir);
  try {
    return run(specDir, contentDir);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
}

function options(now = 1000, processIncarnation = INC_A) {
  return { now, processIncarnation, reclaimerNonce: NONCE_C };
}

function owner({ nonce = NONCE_A, pid = process.pid, incarnation = INC_A,
  leaseUntil = 0 } = {}) {
  return {
    format: TRANSACTION_LOCK_FORMAT,
    version: TRANSACTION_LOCK_VERSION,
    pid,
    incarnation,
    nonce,
    leaseUntil,
  };
}

function claim(target, { nonce = NONCE_B, pid = process.pid, incarnation = INC_A,
  createdAt = 100 } = {}) {
  return {
    format: TRANSACTION_LOCK_CLAIM_FORMAT,
    version: TRANSACTION_LOCK_CLAIM_VERSION,
    pid,
    incarnation,
    nonce,
    createdAt,
    target,
  };
}

function put(filePath, value) {
  fs.writeFileSync(filePath, typeof value === 'string' ? value : lockJson(value));
}

function throwsMessage(fn, message) {
  assert.throws(fn, (error) => {
    assert.equal(error.message, message);
    return true;
  });
}

function journalState({ phase = 'prepared', nonce = NONCE_A, allExisted = true } = {}) {
  const outputs = transactionOutputs().map(({ root, name }, index) => {
    const old = Buffer.from(`old-${index}`);
    const next = Buffer.from(`new-${index}`);
    return {
      root,
      name,
      existed: allExisted,
      oldLength: allExisted ? old.length : null,
      oldSha256: allExisted ? hashBytes(old) : null,
      newLength: next.length,
      newSha256: hashBytes(next),
    };
  });
  const existingCount = allExisted ? outputs.length : 0;
  return {
    format: TRANSACTION_FORMAT,
    version: TRANSACTION_VERSION,
    nonce,
    durability: process.platform === 'win32' ? 'file-only-platform-limited' : 'directory-fsync',
    phase,
    backupIndex: phase === 'prepared' ? 0 : existingCount,
    installIndex: ['committed', 'cleaning'].includes(phase) ? outputs.length : 0,
    cleanupIndex: phase === 'cleaning' ? outputs.length : 0,
    rollbackIndex: 0,
    outputs,
  };
}

test('lock identity and claim parsers enforce canonical schema and ownership semantics', () => withTemp((specDir) => {
  const target = owner({ leaseUntil: 900 });
  const lockPath = transactionLockPath(specDir);
  put(lockPath, target);
  assert.deepEqual(readLock(lockPath), target);
  assert.equal(lockIdentityEqual(target, { ...target, leaseUntil: 10 }), true);
  assert.equal(lockIdentityEqual(target, { ...target, nonce: NONCE_B }), false);
  assert.equal(lockIncarnationForOwner({ processIncarnation: INC_A }), INC_A);
  assert.equal(lockIncarnationForOwner({ processIncarnation: null }), TRANSACTION_LOCK_UNVERIFIED_INCARNATION);

  const targetClaim = claim(target);
  const claimPath = lockClaimPathForTarget(specDir, target);
  put(claimPath, targetClaim);
  assert.deepEqual(readLockClaim(claimPath), targetClaim);
  assert.equal(lockClaimEqual(targetClaim, { ...targetClaim, createdAt: 101 }), false);
  assert.equal(lockClaimEqual(targetClaim, { ...targetClaim, target: { ...target, leaseUntil: 1 } }), true);
  assert.equal(lockClaimIsActive(targetClaim, 1000, options(1000, INC_A)), true);
  assert.equal(lockClaimIsActive({ ...targetClaim, incarnation: INC_B }, 1000,
    options(1000, INC_A)), false);

  fs.writeFileSync(lockPath, `${JSON.stringify({ ...target, extra: true })}\n`);
  throwsMessage(() => readLock(lockPath),
    'transaction lock has an invalid schema; no transaction mutation was attempted');
  fs.writeFileSync(claimPath, JSON.stringify(targetClaim));
  throwsMessage(() => readLockClaim(claimPath),
    'transaction lock claim has an invalid schema; no transaction mutation was attempted');
}));

test('lock active checks distinguish lease expiry, process incarnation, and lease identity', () => withTemp((specDir) => {
  const target = owner({ leaseUntil: 5 });
  put(transactionLockPath(specDir), target);
  assert.equal(lockIsActive(specDir, target, 10, options(10, INC_A)), true,
    'an expired lease does not reclaim a live matching process');
  assert.equal(lockIsActive(specDir, target, 10, options(10, INC_B)), false);
  put(lockLeasePath(specDir, target), { ...target, nonce: NONCE_B });
  throwsMessage(() => lockIsActive(specDir, target, 10, options(10, INC_A)),
    'transaction lock lease belongs to a different incarnation; no transaction mutation was attempted');
}));

test('lock acquisition publishes candidate/owner/lease and release removes exact artifacts', () => withTemp((specDir) => {
  const acquireOptions = { ...options(500), processIncarnation: INC_A };
  const acquired = acquireTransactionLock(specDir, acquireOptions);
  assert.equal(acquired.pid, process.pid);
  assert.equal(acquired.incarnation, INC_A);
  assert.equal(acquired.leaseUntil, 500 + TRANSACTION_LOCK_LEASE_MS);
  assert.deepEqual(readLock(transactionLockPath(specDir)), acquired);
  assert.deepEqual(readLock(lockOwnerPath(specDir, acquired)), acquired);
  assert.deepEqual(readLock(lockLeasePath(specDir, acquired)), acquired);
  assert.throws(() => acquireTransactionLock(specDir, acquireOptions),
    /transaction is owned by live process/);
  releaseTransactionLock(specDir, acquired, acquireOptions);
  assert.equal(pendingTransactionPaths(specDir, path.join(specDir, 'content')).length, 0);
}));

test('ownership guards reject replacement and lease expiry, while the lease guard refreshes exact state', () => withTemp((specDir) => {
  const acquireOptions = { ...options(100), processIncarnation: INC_A };
  const acquired = acquireTransactionLock(specDir, acquireOptions);
  assert.doesNotThrow(() => assertTransactionLockOwned(specDir, acquired, 100, acquireOptions));
  const guard = transactionLockGuard(specDir, acquired, acquireOptions);
  acquireOptions.now = 200;
  guard();
  assert.equal(readLock(lockLeasePath(specDir, acquired)).leaseUntil, 200 + TRANSACTION_LOCK_LEASE_MS);
  const replacement = owner({ nonce: NONCE_B, leaseUntil: 10_000 });
  put(transactionLockPath(specDir), replacement);
  throwsMessage(() => transactionLockOwnershipGuard(specDir, acquired, acquireOptions)(),
    'transaction lock ownership changed; refusing to mutate outputs');
  throwsMessage(() => releaseTransactionLock(specDir, acquired, acquireOptions),
    'transaction lock ownership changed; refusing to remove another owner lock');
  fs.writeFileSync(transactionLockPath(specDir), lockJson(acquired));
  releaseTransactionLock(specDir, acquired, acquireOptions);
}));

test('stale acquisition reclaims a mismatched-incarnation owner and its owner-derived artifacts', () => withTemp((specDir) => {
  const stale = owner({ incarnation: INC_B, leaseUntil: 0 });
  put(transactionLockPath(specDir), stale);
  writeLockCandidate(specDir, stale, fs.writeSync);
  fs.renameSync(
    path.join(specDir, `${TRANSACTION_LOCK_FILE}.candidate.${stale.nonce}`),
    lockOwnerPath(specDir, stale));
  const reclaimedOwners = [];
  const acquired = acquireTransactionLock(specDir, { ...options(1000), reclaimedOwners });
  assert.equal(reclaimedOwners.length, 1);
  assert.deepEqual(reclaimedOwners[0], stale);
  assert.deepEqual(readLock(transactionLockPath(specDir)), acquired);
  assert.equal(fs.existsSync(lockOwnerPath(specDir, stale)), false);
  assert.equal(fs.existsSync(lockReleasePath(specDir, stale)), false);
  releaseTransactionLock(specDir, acquired, options(1000));
}));

test('stale candidate, claim, and lease temporaries are removed, but live same-incarnation files are protected', () => withTemp((specDir) => {
  const staleCandidate = path.join(specDir, `${TRANSACTION_LOCK_FILE}.candidate.999999.${INC_B}.${NONCE_A}.tmp`);
  const staleClaim = path.join(specDir, `${TRANSACTION_LOCK_FILE}.claim.999999.${INC_B}.${NONCE_A}.${NONCE_B}.tmp`);
  const staleLease = path.join(specDir, `${TRANSACTION_LOCK_FILE}.lease.999999.${INC_B}.${NONCE_A}.tmp`);
  for (const filePath of [staleCandidate, staleClaim, staleLease]) put(filePath, 'stale');
  cleanStaleCandidateTemps(specDir, 1000, options());
  cleanStaleLockClaimTemps(specDir, options());
  cleanStaleLockLeaseTemps(specDir, 1000, options());
  for (const filePath of [staleCandidate, staleClaim, staleLease]) assert.equal(fs.existsSync(filePath), false);

  const liveCandidate = path.join(specDir, `${TRANSACTION_LOCK_FILE}.candidate.${process.pid}.${INC_A}.${NONCE_A}.tmp`);
  put(liveCandidate, 'in progress');
  throwsMessage(() => cleanStaleCandidateTemps(specDir, 1000, options()),
    `transaction is owned by live process ${process.pid}; refusing concurrent write`);
  assert.equal(fs.existsSync(liveCandidate), true);
}));

test('legacy cleanup removes stale records and rejects fresh claims without touching bytes', () => withTemp((specDir) => {
  const stale = owner({ incarnation: INC_B, leaseUntil: 0 });
  const legacyCandidate = path.join(specDir, `${TRANSACTION_LOCK_FILE}.candidate`);
  const legacyClaim = path.join(specDir, `${TRANSACTION_LOCK_FILE}.claim`);
  const legacyLease = path.join(specDir, `${TRANSACTION_LOCK_FILE}.lease`);
  put(legacyCandidate, stale);
  put(legacyClaim, stale);
  put(legacyLease, stale);
  fs.utimesSync(legacyClaim, 1, 1);
  cleanLegacyFixedArtifacts(specDir, 100_000, options(100_000));
  assert.equal(fs.existsSync(legacyCandidate), false);
  assert.equal(fs.existsSync(legacyClaim), false);
  assert.equal(fs.existsSync(legacyLease), false);

  put(legacyClaim, owner({ incarnation: INC_B, leaseUntil: 2000 }));
  fs.utimesSync(legacyClaim, 99, 99);
  throwsMessage(() => cleanLegacyFixedArtifacts(specDir, 100_000, options(100_000)),
    'transaction lock reclaim is already in progress; refusing concurrent write');
  assert.deepEqual(fs.readFileSync(legacyClaim), Buffer.from(lockJson(owner({ incarnation: INC_B, leaseUntil: 2000 }))));
}));

test('corrupt legacy quarantine uses digest and owner provenance before removal', () => withTemp((specDir) => {
  const source = Buffer.from(`{"pid":${process.pid},"incarnation":"${INC_B}"}`);
  const digest = hashBytes(source).slice(0, 16);
  const quarantinePath = path.join(specDir, `.build-spec.transaction.lock.quarantine.legacy.${NONCE_C}.${digest}`);
  fs.writeFileSync(quarantinePath, source);
  const descriptor = { type: 'legacy', reclaimerNonce: NONCE_C, digest };
  assert.deepEqual(ownerHintFromCorruptSource(source.toString('utf8')),
    { pid: process.pid, incarnation: INC_B });
  cleanMalformedLegacyQuarantine(specDir, quarantinePath, descriptor, options());
  assert.equal(fs.existsSync(quarantinePath), false);

  const liveSource = Buffer.from(`{"pid":${process.pid},"incarnation":"${INC_A}"}`);
  const liveDigest = hashBytes(liveSource).slice(0, 16);
  const livePath = path.join(specDir, `.build-spec.transaction.lock.quarantine.legacy.${NONCE_C}.${liveDigest}`);
  fs.writeFileSync(livePath, liveSource);
  throwsMessage(() => cleanMalformedLegacyQuarantine(specDir, livePath,
    { ...descriptor, digest: liveDigest }, options()),
    `legacy transaction lock quarantine belongs to live process ${process.pid}; refusing concurrent write`);
  assert.deepEqual(fs.readFileSync(livePath), liveSource);
}));

test('claim cleanup quarantines exact stale records and leaves changed targets untouched', () => withTemp((specDir) => {
  const stale = owner({ incarnation: INC_B, leaseUntil: 0 });
  const claimPath = lockClaimPathForTarget(specDir, stale);
  const staleClaim = claim(stale, { incarnation: INC_B, createdAt: 0 });
  put(claimPath, staleClaim);
  cleanExistingClaims(specDir, 1000, options());
  assert.equal(fs.existsSync(claimPath), false);
  assert.equal(fs.readdirSync(specDir).some((name) => name.includes('.quarantine.')), false);

  const changed = owner({ nonce: NONCE_A, incarnation: INC_B, leaseUntil: 0 });
  put(transactionLockPath(specDir), changed);
  const oldClaim = claim(changed, { incarnation: INC_B, createdAt: 0 });
  put(lockClaimPathForTarget(specDir, changed), oldClaim);
  const replacement = owner({ nonce: NONCE_B, incarnation: INC_B, leaseUntil: 0 });
  put(transactionLockPath(specDir), replacement);
  assert.equal(cleanExistingClaims(specDir, 1000, options()), undefined);
  assert.equal(fs.existsSync(lockClaimPathForTarget(specDir, changed)), false);
  assert.deepEqual(readLock(transactionLockPath(specDir)), replacement);
}));

test('stale reclaim claim is discarded when the target disappears or is replaced during the public claim hook', () => withTemp((specDir) => {
  const expected = owner({ incarnation: INC_B, leaseUntil: 0 });
  const lockPath = transactionLockPath(specDir);
  put(lockPath, expected);
  const claimOptions = {
    ...options(1000),
    onLockClaimPublished: () => fs.unlinkSync(lockPath),
  };
  assert.equal(claimExactStaleFile(specDir, lockPath, expected, 1000, claimOptions), false);
  assert.equal(fs.existsSync(lockClaimPathForTarget(specDir, expected)), false);
  assert.equal(fs.existsSync(lockPath), false);

  put(lockPath, expected);
  const replacement = owner({ nonce: NONCE_B, incarnation: INC_B, leaseUntil: 0 });
  assert.equal(claimExactStaleFile(specDir, lockPath, expected, 1000, {
    ...options(1000),
    onLockClaimPublished: () => put(lockPath, replacement),
  }), false);
  assert.deepEqual(readLock(lockPath), replacement);
  assert.equal(fs.existsSync(lockClaimPathForTarget(specDir, expected)), false);
}));

test('record quarantines are cleaned only for an exact stale owner and derived name', () => withTemp((specDir) => {
  const stale = owner({ incarnation: INC_B, leaseUntil: 0 });
  const quarantinePath = lockRecordQuarantinePath(specDir, stale, options(), 'stale-claim');
  put(quarantinePath, stale);
  cleanExistingQuarantines(specDir, 1000, options());
  assert.equal(fs.existsSync(quarantinePath), false);

  const live = owner({ nonce: NONCE_B, incarnation: INC_A, leaseUntil: 10_000 });
  const livePath = lockRecordQuarantinePath(specDir, live, options(), 'stale-claim');
  put(livePath, live);
  throwsMessage(() => cleanExistingQuarantines(specDir, 1000, options()),
    `transaction lock record quarantine belongs to a live process; refusing concurrent write`);
  assert.deepEqual(readLock(livePath), live);
}));

test('journal snapshots are canonical, validate schema/index ordering, and clean temporary artifacts', () => withTemp((specDir, contentDir) => {
  const state = journalState({ allExisted: false });
  writeJournalSnapshot(specDir, state, false);
  assert.equal(fs.existsSync(path.join(specDir, TRANSACTION_JOURNAL_TMP_FILE)), false);
  assert.deepEqual(readTransactionJournal(specDir, contentDir), state);
  assert.equal(fs.readFileSync(path.join(specDir, TRANSACTION_JOURNAL_FILE), 'utf8'), journalStateJson(state));
  const tmpPath = path.join(specDir, TRANSACTION_JOURNAL_TMP_FILE);
  fs.writeFileSync(tmpPath, 'abandoned');
  cleanJournalTmpIfSafe(specDir);
  assert.equal(fs.existsSync(tmpPath), false);

  const invalid = { ...state, outputs: state.outputs.map((item) => ({ ...item })) };
  invalid.outputs[0] = { ...invalid.outputs[0], name: invalid.outputs[1].name };
  assert.throws(() => validateJournalState(invalid, specDir, contentDir),
    /invalid or duplicate output records/);
  fs.writeFileSync(path.join(specDir, TRANSACTION_JOURNAL_FILE), '{bad');
  assert.throws(() => readTransactionJournal(specDir, contentDir), /transaction journal is corrupt:/);
  assert.equal(fs.readFileSync(path.join(specDir, TRANSACTION_JOURNAL_FILE), 'utf8'), '{bad');
}));

test('journal digest verification and derived artifact paths are exact', () => withTemp((specDir, contentDir) => {
  const state = journalState();
  const item = state.outputs[0];
  const next = Buffer.from('new-0');
  const old = Buffer.from('old-0');
  assert.doesNotThrow(() => verifyNew(item, next, 'new output'));
  assert.doesNotThrow(() => verifyOld(item, old, 'old output'));
  throwsMessage(() => verifyNew(item, Buffer.from('tampered'), 'new output'),
    'new output has an unexpected length or digest; ambiguous data was left untouched');
  throwsMessage(() => verifyOld(item, Buffer.from('tampered'), 'old output'),
    'old output has an unexpected length or digest; ambiguous data was left untouched');
  const missing = { ...item, existed: false, oldLength: null, oldSha256: null };
  throwsMessage(() => verifyOld(missing, old, 'old output'),
    'old output exists although the original was missing; ambiguous data was left untouched');
  throwsMessage(() => assertDigest(Buffer.from('abc'), 2, hashBytes(Buffer.from('abc')), 'digest'),
    'digest has an unexpected length or digest; ambiguous data was left untouched');

  const paths = outputPaths(specDir, contentDir, state, 0);
  assert.equal(path.basename(paths.temp), `.spec.md.${NONCE_A}.${item.newSha256}.tmp`);
  assert.equal(path.basename(paths.backup), `.spec.md.${NONCE_A}.bak`);
  assert.deepEqual(transactionOutputArtifactInfo(specDir, contentDir, paths.temp),
    { index: 0, nonce: NONCE_A, digest: item.newSha256, kind: 'tmp' });
  assert.equal(transactionArtifactName(path.basename(paths.temp)), true);
  assert.equal(transactionArtifactName('.spec.md.not-an-artifact.tmp'), false);
}));

test('completeOne promotes a verified temporary and removes only its verified backup', () => withTemp((specDir, contentDir) => {
  const state = journalState();
  const paths = outputPaths(specDir, contentDir, state, 0);
  fs.writeFileSync(paths.temp, Buffer.from('new-0'));
  fs.writeFileSync(paths.backup, Buffer.from('old-0'));
  completeOne(specDir, contentDir, state, 0, () => {});
  assert.deepEqual(fs.readFileSync(paths.destination), Buffer.from('new-0'));
  assert.equal(fs.existsSync(paths.temp), false);
  assert.equal(fs.existsSync(paths.backup), false);
}));

test('rollbackOne restores verified old bytes, removes new-only outputs, and preserves ambiguity', () => withTemp((specDir, contentDir) => {
  const update = journalState();
  const restored = outputPaths(specDir, contentDir, update, 0);
  fs.writeFileSync(restored.destination, Buffer.from('new-0'));
  fs.writeFileSync(restored.backup, Buffer.from('old-0'));
  fs.writeFileSync(restored.temp, Buffer.from('new-0'));
  rollbackOne(specDir, contentDir, update, 0, () => {});
  assert.deepEqual(fs.readFileSync(restored.destination), Buffer.from('old-0'));
  assert.equal(fs.existsSync(restored.backup), false);
  assert.equal(fs.existsSync(restored.temp), false);

  const firstWrite = journalState({ allExisted: false });
  const removed = outputPaths(specDir, contentDir, firstWrite, 0);
  fs.writeFileSync(removed.destination, Buffer.from('new-0'));
  rollbackOne(specDir, contentDir, firstWrite, 0, () => {});
  assert.equal(fs.existsSync(removed.destination), false);

  const ambiguous = journalState();
  const ambiguousPaths = outputPaths(specDir, contentDir, ambiguous, 0);
  fs.writeFileSync(ambiguousPaths.destination, Buffer.from('tampered'));
  fs.writeFileSync(ambiguousPaths.backup, Buffer.from('old-0'));
  throwsMessage(() => rollbackOne(specDir, contentDir, ambiguous, 0, () => {}),
    'installed transaction output has an unexpected length or digest; ambiguous data was left untouched');
  assert.deepEqual(fs.readFileSync(ambiguousPaths.destination), Buffer.from('tampered'));
  assert.deepEqual(fs.readFileSync(ambiguousPaths.backup), Buffer.from('old-0'));

  const missingBackup = journalState();
  const missingPaths = outputPaths(specDir, contentDir, missingBackup, 1);
  throwsMessage(() => rollbackOne(specDir, contentDir, missingBackup, 1, () => {}),
    `missing transaction backup for ${missingPaths.destination}; ambiguous data was left untouched`);
}));

test('release recovery cleans a durable release claim after an injected post-capture failure', () => withTemp((specDir) => {
  const acquired = acquireTransactionLock(specDir, { ...options(100), processIncarnation: INC_A });
  let failOnce = true;
  assert.throws(() => releaseTransactionLock(specDir, acquired, {
    ...options(100),
    onReleaseCaptured: () => {
      if (failOnce) {
        failOnce = false;
        throw new Error('injected release interruption');
      }
    },
  }), /injected release interruption/);
  const releasePath = lockReleasePath(specDir, acquired);
  assert.deepEqual(readLock(releasePath), acquired);
  assert.equal(fs.existsSync(transactionLockPath(specDir)), false);
  releaseTransactionLock(specDir, acquired, options(100));
  assert.equal(pendingTransactionPaths(specDir, path.join(specDir, 'content')).length, 0);
}));
