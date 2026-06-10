import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // During `vite` dev, proxy API calls to `wrangler pages dev` (port 8788)
      "/api": "http://127.0.0.1:8788",
    },
  },
});
