import { defineConfig } from "vitest/config";

export default defineConfig({
  // Rutas relativas para que el build funcione bajo file:// (Electron / Steam).
  base: "./",
  build: { target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts", "scripts/**/*.test.ts"] },
});
