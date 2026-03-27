import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: [".ngrok-free.dev"],
    proxy: {
      "/api/messages": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
