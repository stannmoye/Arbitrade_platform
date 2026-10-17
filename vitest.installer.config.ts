import { defineConfig } from "vitest/config";

/**
 * The main vitest.config.ts intentionally scopes the application suite to
 * server/**/*.test.ts and server/**/*.spec.ts. Keep installer and migration
 * safety tests in a separate explicit suite so pnpm test cannot silently
 * omit them because of that application-specific include pattern.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["installer/**/*.test.mjs", "scripts/**/*.test.mjs"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
