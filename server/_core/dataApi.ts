export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

/**
 * Calls a REST API explicitly configured by the deployment operator. This is
 * optional integration glue, not a hosted-platform proxy. Configure
 * DATA_API_BASE_URL and, when required by that API, DATA_API_KEY.
 */
export async function callDataApi(apiId: string, options: DataApiCallOptions = {}): Promise<unknown> {
  const base = process.env.DATA_API_BASE_URL?.trim();
  if (!base) throw new Error("DATA_API_BASE_URL is not configured; external data API integration is optional");
  if (!apiId || apiId.startsWith("/") || apiId.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid data API endpoint identifier");
  }
  const root = new URL(base);
  if (!["http:", "https:"].includes(root.protocol)) throw new Error("DATA_API_BASE_URL must use HTTP or HTTPS");
  const segments = apiId.split("/").map((part) => encodeURIComponent(part));
  let endpoint = new URL(segments.join("/"), root.href.replace(/\/?$/, "/"));
  for (const [key, value] of Object.entries(options.pathParams ?? {})) {
    const encodedKey = encodeURIComponent(key);
    if (endpoint.pathname.includes(`:${encodedKey}`)) {
      endpoint.pathname = endpoint.pathname.replace(`:${encodedKey}`, encodeURIComponent(String(value)));
    } else {
      endpoint.searchParams.set(key, String(value));
    }
  }
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) endpoint.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  const token = process.env.DATA_API_KEY;
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  let method = "GET";
  if (options.formData) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.formData)) {
      if (value !== undefined && value !== null) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    body = form;
    method = "POST";
  } else if (options.body) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
    method = "POST";
  }
  const response = await fetch(endpoint, { method, headers, body, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Configured data API failed (${response.status})`);
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}
