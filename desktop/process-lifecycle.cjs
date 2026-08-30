function stopChildProcess(child, { timeoutMs = 5000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ alreadyExited: true, timedOut: false });
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      child.removeListener?.('exit', onExit);
      child.removeListener?.('error', onError);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onExit = () => finish({ alreadyExited: false, timedOut: false });
    const onError = () => finish({ alreadyExited: false, timedOut: false });
    child.once('exit', onExit);
    child.once('error', onError);
    timer = setTimeout(() => finish({ alreadyExited: false, timedOut: true }), timeoutMs);
    try {
      if (!child.killed) child.kill();
    } catch {
      finish({ alreadyExited: false, timedOut: false });
      return;
    }
    // A child can exit between the initial check and listener registration.
    // Re-check scalar process state without waiting for an already-fired event.
    if (child.exitCode !== null || child.signalCode !== null) finish({ alreadyExited: true, timedOut: false });
  });
}

module.exports = { stopChildProcess };
