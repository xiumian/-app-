const DEFAULT_SIGNALS = ['SIGTERM', 'SIGINT'];

export function installGracefulShutdown(server, {
  signals = DEFAULT_SIGNALS,
  timeoutMs = 10_000,
  logger = console,
  processLike = process,
  exit = code => {
    processLike.exitCode = code;
    if (code !== 0 && typeof processLike.exit === 'function') processLike.exit(code);
  }
} = {}) {
  let shutdownPromise = null;
  const handlers = new Map();

  function dispose() {
    for (const [signal, handler] of handlers.entries()) {
      if (typeof processLike.off === 'function') processLike.off(signal, handler);
      else if (typeof processLike.removeListener === 'function') processLike.removeListener(signal, handler);
    }
    handlers.clear();
  }

  function shutdown(signal = 'manual') {
    if (shutdownPromise) return shutdownPromise;

    logger.info?.(`宠伴记 API 收到 ${signal}，开始优雅关闭`);
    shutdownPromise = new Promise(resolve => {
      const timer = setTimeout(() => {
        logger.error?.(`宠伴记 API 关闭超时：${timeoutMs}ms`);
        dispose();
        exit(1);
        resolve({ ok: false, signal, timedOut: true });
      }, timeoutMs);
      timer.unref?.();

      server.close(error => {
        clearTimeout(timer);
        dispose();
        if (error) {
          logger.error?.('宠伴记 API 关闭失败', error);
          exit(1);
          resolve({ ok: false, signal, error });
          return;
        }

        logger.info?.('宠伴记 API 已优雅关闭');
        exit(0);
        resolve({ ok: true, signal });
      });
    });

    return shutdownPromise;
  }

  for (const signal of signals) {
    const handler = () => { shutdown(signal); };
    handlers.set(signal, handler);
    if (typeof processLike.once === 'function') processLike.once(signal, handler);
  }

  return { shutdown, dispose };
}
