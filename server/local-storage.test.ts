import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLocalStoragePath, getLocalStorageRoot, saveLocalStorageFile } from "./local-storage";

const priorUploadDir = process.env.UPLOAD_DIR;
afterEach(() => {
  if (priorUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = priorUploadDir;
});

describe("private local support attachment storage", () => {
  it("rejects a storage root inside the public build directory", () => {
    expect(() => getLocalStorageRoot({ UPLOAD_DIR: "dist/public/private" }))
      .toThrow("outside the public web directory");
    expect(() => getLocalStorageRoot({ UPLOAD_DIR: "dist/public" }))
      .toThrow("outside the public web directory");
  });

  it("rejects malformed keys before resolving file paths", () => {
    expect(() => getLocalStoragePath("../outside.pdf")).toThrow("Invalid support attachment storage key");
    expect(() => getLocalStoragePath("support/1/../../outside.pdf")).toThrow("Invalid support attachment storage key");
    expect(() => getLocalStoragePath("support/2/" + "a".repeat(48) + "-file.pdf"))
      .not.toThrow();
  });

  it("writes private bytes exclusively and does not overwrite an existing upload", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbitrade-private-uploads-"));
    process.env.UPLOAD_DIR = root;
    const key = "support/1/" + "a".repeat(48) + "-evidence.pdf";
    const bytes = Buffer.from("%PDF-1.4 test attachment");
    try {
      expect(getLocalStoragePath(key)).toBe(resolve(root, key));
      await saveLocalStorageFile(key, bytes);
      await expect(readFile(getLocalStoragePath(key))).resolves.toEqual(bytes);
      await expect(saveLocalStorageFile(key, Buffer.from("replacement")))
        .rejects.toMatchObject({ code: "EEXIST" });
      await expect(readFile(getLocalStoragePath(key))).resolves.toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects empty and non-buffer file payloads", async () => {
    const root = await mkdtemp(join(tmpdir(), "arbitrade-private-uploads-"));
    process.env.UPLOAD_DIR = root;
    const key = "support/1/" + "b".repeat(48) + "-empty.pdf";
    try {
      await expect(saveLocalStorageFile(key, Buffer.alloc(0))).rejects.toThrow("empty or invalid");
      await expect(saveLocalStorageFile(key, "not a buffer" as never)).rejects.toThrow("empty or invalid");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
