// Runtime configuration belongs to the Arbitrade deployment. Primary data and
// scheduled jobs use the operator's database; uploaded files use private local storage.
export const ENV = {
  get appId() { return "arbitrade-local"; },
  get cookieSecret() { return process.env.SESSION_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },

  get isProduction() { return process.env.NODE_ENV === "production"; },
  // AI chat and speech transcription are optional integrations, not installation requirements.
  get aiApiBaseUrl() { return ""; },
  get aiApiKey() { return ""; },
  get imageApiBaseUrl() { return (process.env.IMAGE_API_BASE_URL ?? "").replace(/\/+$/, ""); },
  get imageApiKey() { return process.env.IMAGE_API_KEY ?? ""; },
  get transcriptionApiBaseUrl() { return ""; },
  get transcriptionApiKey() { return ""; },
  get mapsServerApiKey() { return process.env.GOOGLE_MAPS_SERVER_KEY ?? ""; },
};
