import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { publicPlatformScript } from "./server/_core/publicConfig";

// Static development and static publishing use the same public-value whitelist
// as Express. Runtime-only secrets never enter the browser bundle. Express keeps
// serving this path dynamically when the application server is selected.
function vitePluginPublicPlatformConfig(): Plugin {
  return {
    name: "arbitrade-public-platform-config",
    configureServer(server) {
      server.middlewares.use("/api/platform/config.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(publicPlatformScript());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "api/platform/config.js", source: publicPlatformScript() });
    },
  };
}

const STAGE4_NOTIFICATION_SOUND_FILES = [
  "notification-bright-bell.wav",
  "notification-double-ping.wav",
  "notification-soft-chime.wav",
  "notification-urgent-pulse.wav",
  "notification-warm-tone.wav",
] as const;

// Stage 4 sound assets live in the repository-level public/sounds directory,
// while Vite's regular publicDir is client/public. Serve them in dev and emit
// them into the production bundle explicitly so /sounds/*.wav never falls back
// to the SPA index.html with a misleading 200 response.
function vitePluginNotificationSoundAssets(): Plugin {
  const soundDirectory = path.resolve(import.meta.dirname, "public", "sounds");
  return {
    name: "arbitrade-notification-sound-assets",
    configureServer(server) {
      server.middlewares.use("/sounds", (req, res, next) => {
        const requestPath = (req.url || "/").split("?")[0];
        const filename = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
        if (!STAGE4_NOTIFICATION_SOUND_FILES.includes(filename as (typeof STAGE4_NOTIFICATION_SOUND_FILES)[number])) return next();
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        try {
          const bytes = fs.readFileSync(path.join(soundDirectory, filename));
          res.statusCode = 200;
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("Content-Length", String(bytes.length));
          res.setHeader("Cache-Control", "public, max-age=86400");
          if (req.method === "HEAD") return res.end();
          return res.end(bytes);
        } catch {
          return next();
        }
      });
    },
    generateBundle() {
      for (const filename of STAGE4_NOTIFICATION_SOUND_FILES) {
        const sourcePath = path.join(soundDirectory, filename);
        if (!fs.existsSync(sourcePath)) throw new Error(`Missing Stage 4 notification sound asset: ${filename}`);
        this.emitFile({ type: "asset", fileName: `sounds/${filename}`, source: fs.readFileSync(sourcePath) });
      }
    },
  };
}

const plugins = [vitePluginPublicPlatformConfig(), vitePluginNotificationSoundAssets(), react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep large optional libraries in separate cacheable files rather than
        // shipping every vendor dependency in the initial application bundle.
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) {
            return "vendor-charts";
          }
          if (/[\\/]node_modules[\\/](framer-motion|motion-[^\\/]+)[\\/]/.test(id)) {
            return "vendor-motion";
          }
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return "vendor-icons";
          }
          if (/[\\/]node_modules[\\/](@tanstack|@trpc|superjson)[\\/]/.test(id)) {
            return "vendor-api";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
