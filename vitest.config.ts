import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/contexts/theme-policy.test.ts",
      "client/src/notification-sound-*.test.ts",
      "client/src/lib/**/*.test.ts",
      "client/src/admin-navigation.test.ts",
      "client/src/opportunity-*.test.ts",
      "client/src/customer-opportunity-countdown.test.ts",
      "client/src/customer-opportunity-review-panel.test.tsx",
      "client/src/popup-delivery-*.test.ts",
      "client/src/trading-policy-patches.test.ts",
      "client/src/trade-settings-*.test.ts",
      "client/src/trade-admin-guide.contract.test.ts",
      "client/src/trading-delivery-policy-*.test.ts",
    ],
  },
});
