import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
export default defineConfig(async ({ command }) => {
  const local = command === "serve" && process.env.ROOMFORM_LOCAL === "1";
  if (local) {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.APP_URL ??= "http://localhost:3000";
    process.env.DATA_DIR ??= ".data";
  }
  return {
    plugins: [
      !local &&
        (await import("@varlock/vite-integration")).varlockVitePlugin({
          ssrInjectMode: "init-only",
        }),
      tanstackStart(),
      nitro({ preset: "node-server" }),
      react(),
    ],
    server: local ? { allowedHosts: [new URL(process.env.APP_URL!).hostname] } : undefined,
  };
});
