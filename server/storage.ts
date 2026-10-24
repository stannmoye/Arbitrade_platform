import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads"));

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/\\/g, "/").replace(/^\\/+/, "");
  const parts = key.split("/");
  if (!key || parts.some((part) => !part || part === "." || part === "..") || /[\\x00-\\x1f\\x7f]/.test(key)) {
    throw new Error("Invalid storage key");
  }
  const resolved = path.resolve(STORAGE_ROOT, ...parts);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) throw new Error("Invalid storage key");
  return parts.join("/");
}

function filePath(key: string): string {
  return path.resolve(STORAGE_ROOT, ...normalizeKey(key).split("/"));
}

function withHashSuffix(key: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const slash = key.lastIndexOf("/");
  const dir = slash >= 0 ? key.slice(0, slash + 1) : "";
  const filename = slash >= 0 ? key.slice(slash + 1) : key;
  const dot = filename.lastIndexOf(".");
  return dir + (dot > 0 ? `${filename.slice(0, dot)}_${hash}${filename.slice(dot)}` : `${filename}_${hash}`);
}

export async function writeStorageObject(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const destination = filePath(key);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
  const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  // wx prevents an upload retry from silently replacing an existing object.
  await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o640 });
  await fs.writeFile(`${destination}.meta.json`, JSON.stringify({
    contentType: contentType.slice(0, 200) || "application/octet-stream",
    sizeBytes: bytes.length,
    createdAt: new Date().toISOString(),
  }), { flag: "wx", mode: 0o640 });
  return { key, url: `/storage/${key}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  return writeStorageObject(withHashSuffix(normalizeKey(relKey)), data, contentType);
}

export async function readStorageObject(relKey: string): Promise<{ key: string; buffer: Buffer; contentType: string }> {
  const key = normalizeKey(relKey);
  const destination = filePath(key);
  const [buffer, metadata] = await Promise.all([
    fs.readFile(destination),
    fs.readFile(`${destination}.meta.json`, "utf8").catch(() => ""),
  ]);
  let contentType = "application/octet-stream";
  if (metadata) {
    try {
      const value = JSON.parse(metadata) as { contentType?: unknown };
      if (typeof value.contentType === "string" && value.contentType.length <= 200) contentType = value.contentType;
    } catch {
      // Older objects without valid sidecar metadata use a safe binary content type.
    }
  }
  return { key, buffer, contentType };
}

export async function deleteStorageObject(relKey: string): Promise<void> {
  const destination = filePath(normalizeKey(relKey));
  await Promise.all([
    fs.unlink(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }),
    fs.unlink(`${destination}.meta.json`).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }),
  ]);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

// Kept as a compatibility helper for existing callers. This returns the
// application's stable route, never an external or bearer-signed URL.
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return (await storageGet(relKey)).url;
}
