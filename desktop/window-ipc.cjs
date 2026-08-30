function sendToWindow(target, channel, payload) {
  if (!target || typeof target.isDestroyed !== 'function' || target.isDestroyed()) return false;
  const contents = target.webContents;
  if (!contents || typeof contents.isDestroyed !== 'function' || contents.isDestroyed()) return false;
  contents.send(channel, payload);
  return true;
}

module.exports = { sendToWindow };
