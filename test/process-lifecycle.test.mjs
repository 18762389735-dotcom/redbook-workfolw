import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { stopChildProcess } from '../desktop/process-lifecycle.cjs';

class FakeChild extends EventEmitter {
  constructor({ exitCode = null, emitExitOnKill = true } = {}) {
    super();
    this.exitCode = exitCode;
    this.signalCode = null;
    this.killed = false;
    this.emitExitOnKill = emitExitOnKill;
  }
  kill() {
    this.killed = true;
    if (this.emitExitOnKill) queueMicrotask(() => { this.exitCode = 0; this.emit('exit', 0, null); });
    return true;
  }
}

test('already-exited server child does not leave shutdown waiting forever', async () => {
  const result = await stopChildProcess(new FakeChild({ exitCode: 0 }), { timeoutMs: 20 });
  assert.deepEqual(result, { alreadyExited: true, timedOut: false });
});

test('running server child is killed and shutdown settles once', async () => {
  const child = new FakeChild();
  const result = await stopChildProcess(child, { timeoutMs: 100 });
  assert.equal(child.killed, true);
  assert.deepEqual(result, { alreadyExited: false, timedOut: false });
});

test('shutdown timeout is bounded when a child never emits exit', async () => {
  const started = Date.now();
  const result = await stopChildProcess(new FakeChild({ emitExitOnKill: false }), { timeoutMs: 20 });
  assert.deepEqual(result, { alreadyExited: false, timedOut: true });
  assert.ok(Date.now() - started < 500);
});
