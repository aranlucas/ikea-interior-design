import { varlockVitePlugin } from "@varlock/vite-integration";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "init-only" }),
    tanstackStart(),
    nitro({ preset: "node-server" }),
    react(),
  ],
});
