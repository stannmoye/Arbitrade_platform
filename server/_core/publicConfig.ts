// Only browser-safe configuration is exposed. Restrict the Maps browser key
// by HTTP referrer in the provider console; no server secret is serialized.
export function publicPlatformConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    googleMapsBrowserKey: env.GOOGLE_MAPS_BROWSER_KEY ?? "",
  };
}

export function publicPlatformScript(env: NodeJS.ProcessEnv = process.env): string {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll("<", "\\u003c");
  return `window.__ARBITRADE_CONFIG__=${json};`;
}
