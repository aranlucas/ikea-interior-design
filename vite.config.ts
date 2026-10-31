import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import { varlockVitePlugin } from "@varlock/vite-integration";
import { ENV } from "varlock/env";
export default defineConfig(({ command }) => {
  const local = command === "serve" && ENV.ROOMFORM_LOCAL;
  return {
    plugins: [
      varlockVitePlugin({ ssrInjectMode: "init-only" }),
      tanstackStart(),
      nitro({ preset: "node-server" }),
      react(),
    ],
    server: local ? { allowedHosts: [new URL(ENV.APP_URL).hostname] } : undefined,
  };
});
