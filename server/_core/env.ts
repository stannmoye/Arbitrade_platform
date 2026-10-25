import { getRuntimeSecret } from "./runtimeSecrets";
// Runtime configuration belongs to the Arbitrade deployment. Primary data and
// scheduled jobs use the operator's database; uploaded files use private local storage.
export const ENV = {
  get appId() { return "arbitrade-local"; },
  get cookieSecret() { return getRuntimeSecret("SESSION_SECRET"); },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },

  get isProduction() { return process.env.NODE_ENV === "production"; },
  // AI chat and speech transcription are optional integrations, not installation requirements.
  get aiApiBaseUrl() { return ""; },
  get aiApiKey() { return ""; },
  get imageApiBaseUrl() { return ""; },
  get imageApiKey() { return ""; },
  get transcriptionApiBaseUrl() { return ""; },
  get transcriptionApiKey() { return ""; },
  get mapsServerApiKey() { return ""; },
};
