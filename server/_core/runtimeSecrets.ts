import crypto from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

type RuntimeSecretName = "SESSION_SECRET" | "PASSWORD_PEPPER" | "TOTP_ENCRYPTION_KEY";
type SecretStore = Partial<Record<RuntimeSecretName, string>>;

const storePath = path.resolve(process.cwd(), ".arbitrade-runtime-secrets.json");
let cached: SecretStore | null = null;

function readStore(): SecretStore {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    cached = parsed && typeof parsed === "object" ? parsed as SecretStore : {};
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw new Error("The private Arbitrade secret store could not be read. Check file permissions and restore the persistent secret file.");
    cached = {};
  }
  return cached;
}

function persistStore(store: SecretStore): void {
  const tempPath = storePath + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  try {
    writeFileSync(tempPath, JSON.stringify(store, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    chmodSync(tempPath, 0o600);
    try {
      renameSync(tempPath, storePath);
    } catch (error: any) {
      // Another worker may have initialized the same store concurrently.
      if (!existsSync(storePath)) throw error;
    }
    chmodSync(storePath, 0o600);
  } catch {
    throw new Error("Arbitrade could not persist its generated security secrets. Ensure the application root is writable and stored on a persistent disk.");
  }
}

export function getRuntimeSecret(name: RuntimeSecretName): string {
  const environmentValue = process.env[name]?.trim();
  if (environmentValue) return environmentValue;
  if (process.env.NODE_ENV !== "production") {
    return crypto.createHash("sha256").update("arbitrade-development-secret:" + name).digest("hex");
  }
  const store = readStore();
  if (store[name] && store[name]!.length >= 32) return store[name]!;
  store[name] = crypto.randomBytes(32).toString("hex");
  persistStore(store);
  return store[name]!;
}
