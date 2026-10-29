import type { Server } from "node:http";

const workerIntervals = new Set<NodeJS.Timeout>();

/** Register a lightweight worker interval so shutdown can stop future ticks. */
export function registerWorkerInterval(callback: () => void, intervalMs: number): NodeJS.Timeout {
  const timer = setInterval(callback, intervalMs);
  timer.unref();
  workerIntervals.add(timer);
  return timer;
}

/** Stop all registered worker intervals; in-flight work is drained separately. */
export function stopWorkerIntervals(): number {
  const count = workerIntervals.size;
  for (const timer of workerIntervals) clearInterval(timer);
  workerIntervals.clear();
  return count;
}

/**
 * Stop scheduling first, allow active HTTP requests and monitored worker cycles
 * to finish, then close the shared database pool. A hard deadline prevents a
 * stuck worker from keeping the process alive indefinitely.
 */
export function registerGracefulShutdown(input: {
  server: Server;
  drainWorkers: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  timeoutMs?: number;
}): void {
  let shuttingDown = false;
  const timeoutMs = Math.max(5_000, Math.min(120_000, input.timeoutMs ?? 25_000));

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[Shutdown] Graceful shutdown requested", { signal });
    const stoppedIntervals = stopWorkerIntervals();
    console.info("[Shutdown] Worker scheduling stopped", { stoppedIntervals });

    const deadline = setTimeout(() => {
      console.error("[Shutdown] Grace period expired; closing remaining HTTP connections");
      input.server.closeAllConnections?.();
      process.exit(1);
    }, timeoutMs);

    // Idle keep-alive sockets should not hold the server-close callback open.
    input.server.closeIdleConnections?.();
    const serverClosed = new Promise<void>((resolve) => {
      if (!input.server.listening) {
        resolve();
        return;
      }
      input.server.close(() => resolve());
    });

    void (async () => {
      try {
        await Promise.all([serverClosed, input.drainWorkers()]);
        await input.closeDatabase();
        clearTimeout(deadline);
        console.info("[Shutdown] HTTP server, worker cycles, and database pool closed");
        process.exitCode = 0;
      } catch (error) {
        clearTimeout(deadline);
        console.error("[Shutdown] Graceful shutdown failed", error instanceof Error ? error.name : "UnknownError");
        process.exitCode = 1;
      }
    })();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
