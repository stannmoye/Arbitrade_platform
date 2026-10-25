import { randomBytes } from "node:crypto";
import { chmod, lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";

/**
 * Ensure a stable production session-signing secret exists.
 * Existing non-empty host-provided values are respected. When absent, a valid
 * value already stored in the private .env is reused; otherwise a fresh secret
 * is written without changing any other environment setting.
 */
export async function ensureSessionSecret({ root = process.cwd(), env = process.env } = {}) {
  const supplied = typeof env.SESSION_SECRET === "string" ? env.SESSION_SECRET.trim() : "";
  if (supplied) return { generated: false, source: "environment" };

  const envPath = resolve(root, ".env");
  let contents = "";
  try {
    const info = await lstat(envPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error("The private .env path is not a regular file.");
    }
    contents = await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error("Could not safely read the private .env file.");
    }
  }

  let fileSecret = "";
  try {
    fileSecret = String(parseDotenv(contents).SESSION_SECRET || "").trim();
  } catch {
    throw new Error("Could not parse the private .env file safely.");
  }
  if (fileSecret) {
    env.SESSION_SECRET = fileSecret;
    return { generated: false, source: "env-file" };
  }

  const secret = randomBytes(48).toString("hex");
  const preservedLines = contents
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?SESSION_SECRET\s*=/.test(line));
  const preserved = preservedLines.join("\n").replace(/\n+$/, "");
  const updated = (preserved ? preserved + "\n" : "") + 'SESSION_SECRET="' + secret + '"\n';
  const tempPath = resolve(root, ".env.session-secret." + randomBytes(6).toString("hex") + ".tmp");

  try {
    await writeFile(tempPath, updated, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, envPath);
    await chmod(envPath, 0o600);
  } catch {
    await unlink(tempPath).catch(() => {});
    throw new Error("Could not securely persist the generated session secret. Check private application-root permissions.");
  }

  env.SESSION_SECRET = secret;
  return { generated: true, source: "generated" };
}
