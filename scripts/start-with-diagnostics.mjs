import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const timestamp = () => new Date().toISOString();
const log = (level, event, details = {}) => {
  const safe = { timestamp: timestamp(), level, event, ...details };
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    "[StartupDiagnostics] " + JSON.stringify(safe),
  );
};
const redact = (value) =>
  String(value).replace(/\b(?:mysql|mariadb):\/\/[^\s"'<>]+/gi, "[database-url-redacted]");

let activeChild;
let shuttingDown = false;

process.on("uncaughtException", (error) => {
  log("error", "startup-wrapper-uncaught-exception", {
    name: error?.name || "Error",
    code: error?.code,
    message: redact(error?.message || "No error message"),
    stack: redact(error?.stack || "").slice(0, 12000),
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  log("error", "startup-wrapper-unhandled-rejection", {
    name: error.name,
    code: error.code,
    message: redact(error.message),
    stack: redact(error.stack || "").slice(0, 12000),
  });
  process.exit(1);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("warn", "shutdown-signal-received", { signal });
    if (activeChild && !activeChild.killed) activeChild.kill(signal);
    else process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

function runPhase(name, args, extraEnv = {}, requirePersistent = false) {
  return new Promise((resolve, reject) => {
    log("info", "phase-start", { phase: name, command: args[0], args: args.slice(1) });
    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production", ...extraEnv },
        stdio: ["inherit", "pipe", "pipe"],
      });
    } catch (error) {
      log("error", "phase-spawn-failed", {
        phase: name,
        name: error?.name || "Error",
        code: error?.code,
        message: redact(error?.message || "Unable to spawn child process"),
        stack: redact(error?.stack || "").slice(0, 12000),
      });
      reject(error);
      return;
    }

    activeChild = child;
    for (const [streamName, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
      const lines = createInterface({ input: stream });
      lines.on("line", (line) => {
        const output = redact(line);
        (streamName === "stderr" ? process.stderr : process.stdout).write(output + "\n");
      });
    }

    child.on("error", (error) => {
      log("error", "phase-process-error", {
        phase: name,
        name: error?.name || "Error",
        code: error?.code,
        message: redact(error?.message || "Child process error"),
        stack: redact(error?.stack || "").slice(0, 12000),
      });
      activeChild = undefined;
      reject(error);
    });

    child.on("exit", (code, signal) => {
      activeChild = undefined;
      if (requirePersistent && !shuttingDown) {
        log("error", "persistent-process-exited-unexpectedly", { phase: name, exitCode: code, signal: signal || undefined });
        const error = new Error(`Persistent startup phase "${name}" exited before a shutdown signal was received (exit code ${code ?? "null"}).`);
        error.code = "PERSISTENT_PROCESS_EXITED";
        reject(error);
        return;
      }
      if (code === 0 || (requirePersistent && shuttingDown)) {
        log("info", "phase-complete", { phase: name, exitCode: code, shutdownRequested: shuttingDown });
        resolve();
        return;
      }
      const details = { phase: name, exitCode: code, signal: signal || undefined };
      log("error", "phase-failed", details);
      const error = new Error(`Startup phase "${name}" failed (exit code ${code ?? "null"}, signal ${signal || "none"}).`);
      error.code = code === null ? "CHILD_SIGNAL_EXIT" : "CHILD_EXIT_NONZERO";
      reject(error);
    });
  });
}

async function main() {
  log("info", "startup-begin", {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    workingDirectory: process.cwd(),
    portConfigured: Boolean(process.env.PORT),
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
  });

  await runPhase("main-database-migrations", ["scripts/guarded-main-migrate.mjs"]);
  await runPhase("worker-runtime-schema-preflight", ["scripts/ensure-worker-runtime-schema.mjs"]);
  await runPhase("application-server", ["--trace-uncaught", "--unhandled-rejections=strict", "dist/index.js"], {}, true);

  log("info", "all-startup-phases-complete", {
    note: "The server process exited normally. A separate listening-ready message should be emitted by the application.",
  });
}

main().catch((error) => {
  log("error", "startup-aborted", {
    name: error?.name || "Error",
    code: error?.code,
    message: redact(error?.message || "Startup failed without an error message"),
    stack: redact(error?.stack || "").slice(0, 12000),
  });
  process.exitCode = 1;
});
