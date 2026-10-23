import { mkdir, open } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy";

export function getLocalStorageRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.UPLOAD_DIR?.trim() || "private-uploads";
  const root = resolve(process.cwd(), configured);
  const publicRoot = resolve(process.cwd(), "dist", "public");
  const relativeFromPublic = relative(publicRoot, root);
  if (
    relativeFromPublic === "" ||
    (!relativeFromPublic.startsWith("..") && !isAbsolute(relativeFromPublic))
  ) {
    throw new Error("UPLOAD_DIR must be outside the public web directory.");
  }
  return root;
}

export function getLocalStoragePath(storageKey: unknown): string {
  if (!isValidSupportAttachmentStorageKey(storageKey)) {
    throw new Error("Invalid support attachment storage key.");
  }
  const root = getLocalStorageRoot();
  const target = resolve(root, ...storageKey.split("/"));
  const relativeTarget = relative(root, target);
  if (
    relativeTarget === "" ||
    relativeTarget.startsWith("..") ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error("Support attachment path escapes the private storage directory.");
  }
  return target;
}

export async function saveLocalStorageFile(storageKey: unknown, data: Buffer): Promise<void> {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new Error("Support attachment data is empty or invalid.");
  }
  const target = getLocalStoragePath(storageKey);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // Exclusive create prevents accidental replacement if a generated key collides.
    handle = await open(target, "wx", 0o600);
    await handle.writeFile(data);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      const { unlink } = await import("node:fs/promises");
      await unlink(target).catch(() => {});
    }
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
