// All runtime configuration belongs to the Arbitrade deployment. No hosted
// builder, identity gateway, storage proxy, or project ID is required.
export const ENV = {
  get appId() { return "arbitrade-local"; },
  get cookieSecret() { return process.env.SESSION_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },

  get isProduction() { return process.env.NODE_ENV === "production"; },
  get aiApiBaseUrl() { return (process.env.AI_API_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, ""); },
  get aiApiKey() { return process.env.AI_API_KEY ?? ""; },
  get imageApiBaseUrl() { return (process.env.IMAGE_API_BASE_URL ?? "").replace(/\/+$/, ""); },
  get imageApiKey() { return process.env.IMAGE_API_KEY ?? ""; },
  get mapsServerApiKey() { return process.env.GOOGLE_MAPS_SERVER_KEY ?? ""; },
};
