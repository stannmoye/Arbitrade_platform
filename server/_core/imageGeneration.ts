import crypto from "node:crypto";
import { storagePut } from "../storage";
import { ENV } from "./env";

const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const DEFAULT_IMAGE_QUALITY = "medium";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  model?: string;
  quality?: string;
};

export type GenerateImageResponse = { url?: string };
export type ImageModelInfo = { model?: string; id?: string };
export type ListImageModelsResponse = { models: ImageModelInfo[] };

function apiBase(): string {
  const base = ENV.imageApiBaseUrl;
  if (!base) throw new Error("Image generation is optional; configure IMAGE_API_BASE_URL for a self-hosted or operator-controlled OpenAI-compatible image API");
  const host = new URL(base).hostname;
  if (!ENV.imageApiKey && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("IMAGE_API_KEY is required for a remote image provider");
  }
  return base;
}

function authHeaders(): Record<string, string> {
  return ENV.imageApiKey ? { authorization: `Bearer ${ENV.imageApiKey}` } : {};
}

async function imageBytes(source: { url?: string; b64Json?: string; mimeType?: string }): Promise<{ buffer: Buffer; mimeType: string }> {
  const mimeType = source.mimeType || "image/png";
  if (!mimeType.startsWith("image/")) throw new Error("Original image must use an image MIME type");
  if (source.b64Json) {
    const buffer = Buffer.from(source.b64Json, "base64");
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error("Original image is empty or exceeds 20 MB");
    return { buffer, mimeType };
  }
  if (!source.url) throw new Error("Original image requires a URL or base64 content");
  const url = new URL(source.url, process.env.PUBLIC_APP_URL || "http://127.0.0.1");
  if (url.pathname.startsWith("/storage/") && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.origin === process.env.PUBLIC_APP_URL)) {
    const { readStorageObject } = await import("../storage");
    const stored = await readStorageObject(decodeURIComponent(url.pathname.slice("/storage/".length)));
    if (!stored.contentType.startsWith("image/")) throw new Error("Original storage object is not an image");
    return { buffer: stored.buffer, mimeType: stored.contentType };
  }
  if (url.protocol !== "https:") throw new Error("Remote original image URLs must use HTTPS");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error(`Original image download failed (${response.status})`);
  const actualType = response.headers.get("content-type")?.split(";")[0] || mimeType;
  if (!actualType.startsWith("image/")) throw new Error("Original URL did not return an image");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Original image is empty or exceeds 20 MB");
  return { buffer: bytes, mimeType: actualType };
}

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  const base = apiBase();
  if (!options.prompt?.trim()) throw new Error("Image prompt is required");
  const model = options.model || DEFAULT_IMAGE_MODEL;
  const quality = options.quality || DEFAULT_IMAGE_QUALITY;
  let response: Response;
  if (options.originalImages?.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", options.prompt);
    form.append("quality", quality);
    for (const source of options.originalImages.slice(0, 4)) {
      const { buffer, mimeType } = await imageBytes(source);
      const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      form.append("image", new Blob([new Uint8Array(buffer)], { type: mimeType }), `source.${extension}`);
    }
    response = await fetch(`${base}/images/edits`, { method: "POST", headers: authHeaders(), body: form, signal: AbortSignal.timeout(120_000) });
  } else {
    response = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ model, prompt: options.prompt, size: "1024x1024", quality, n: 1 }),
      signal: AbortSignal.timeout(120_000),
    });
  }
  if (!response.ok) throw new Error(`Configured image provider failed (${response.status})`);
  const result = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: unknown };
  const image = result.data?.[0];
  if (result.error || !image) throw new Error("Image provider returned no image");
  let buffer: Buffer;
  if (image.b64_json) buffer = Buffer.from(image.b64_json, "base64");
  else if (image.url) {
    const url = new URL(image.url);
    if (url.protocol !== "https:") throw new Error("Image provider returned an unsafe image URL");
    const downloaded = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (!downloaded.ok) throw new Error(`Generated image download failed (${downloaded.status})`);
    buffer = Buffer.from(await downloaded.arrayBuffer());
  } else throw new Error("Image provider returned no downloadable image");
  if (!buffer.length || buffer.length > 30 * 1024 * 1024) throw new Error("Generated image is empty or exceeds 30 MB");
  const { url } = await storagePut(`generated/${Date.now()}-${crypto.randomUUID()}.png`, buffer, "image/png");
  return { url };
}

export async function listImageModels(): Promise<ListImageModelsResponse> {
  const response = await fetch(`${apiBase()}/models`, {
    headers: { accept: "application/json", ...authHeaders() },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Configured image provider model list failed (${response.status})`);
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  const models = (payload.data || []).filter((item) => typeof item.id === "string" && /image|dall-e/i.test(item.id)).map((item) => ({ id: item.id, model: item.id }));
  return { models };
}
