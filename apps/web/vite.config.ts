import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser only ever talks to Vite; Vite forwards /api to the API
    // server (apps/api, port 8787), so there is no cross-origin request.
    // API_URL points it elsewhere, e.g. at a second API run with
    // DEMO_MODE=false to try the full game beside the demo.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8787" },
  },
});
