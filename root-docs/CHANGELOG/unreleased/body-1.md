>>>>> lang=en
## Unreleased

### Fixed

- Transaction-lock recovery now treats a live PID with an observed process
  incarnation that differs from the lock's recorded incarnation as a reused
  PID, even before the lease expires.

>>>>> lang=ru
## Не выпущено

### Исправлено

- При восстановлении блокировки транзакции живой PID с наблюдаемым
  идентификатором экземпляра процесса, отличающимся от записанного в
  блокировке, теперь считается повторно использованным PID, даже если срок
  аренды ещё не истёк.

>>>>> lang=zh
## 尚未发布

### 修复

- 事务锁恢复现在会将观测到的进程实例标识与锁中记录的标识不一致的
  存活 PID 视为已被重新分配的 PID，即使租约尚未到期。

