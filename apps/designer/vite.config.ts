import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.DRASSOS_DESIGNER_BASE ?? "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        cloud: "cloud.html",
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:3300",
    },
  },
});
