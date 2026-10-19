import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser only ever talks to Vite; Vite forwards /api to the API
    // server (apps/api, port 8787), so there is no cross-origin request.
    proxy: { "/api": "http://localhost:8787" },
  },
});
