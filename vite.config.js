import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // library.json is imported directly; Vite handles JSON imports natively.
  server: {
    proxy: {
      // Run Scope posts here; the Node proxy (npm run server) holds the API key.
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
