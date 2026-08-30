import assert from 'node:assert/strict';
import test from 'node:test';
import { sendToWindow } from '../desktop/window-ipc.cjs';

function fakeWindow({ windowDestroyed = false, contentsDestroyed = false } = {}) {
  const sent = [];
  return {
    sent,
    isDestroyed: () => windowDestroyed,
    webContents: { isDestroyed: () => contentsDestroyed, send: (...args) => sent.push(args) },
  };
}

test('renderer event helper sends only to live webContents', () => {
  const live = fakeWindow();
  assert.equal(sendToWindow(live, 'desktop:test', { ok: true }), true);
  assert.deepEqual(live.sent, [['desktop:test', { ok: true }]]);
  assert.equal(sendToWindow(fakeWindow({ windowDestroyed: true }), 'desktop:test', {}), false);
  assert.equal(sendToWindow(fakeWindow({ contentsDestroyed: true }), 'desktop:test', {}), false);
  assert.equal(sendToWindow(null, 'desktop:test', {}), false);
});
