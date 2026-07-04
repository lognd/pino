import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/mockServiceWorker.js is only needed for `npm run dev:mock` (MSW's
// dev-server-serves-it-statically requirement) -- Vite's publicDir copies
// EVERYTHING in public/ into dist/ on every build regardless of mode, which
// would otherwise leave a dead-but-present mock worker script in every
// production deploy. Strip it back out after a real (non-mock) build so
// "mocks never ship in production" is actually true of the build output,
// not just of the JS bundle. Cribbed from logand.app/frontend/vite.config.ts.
function stripMockWorkerFromBuild() {
  return {
    name: "strip-mock-worker-from-production-build",
    apply: "build" as const,
    closeBundle() {
      if (process.env.VITE_USE_MOCKS === "true") return;
      const target = resolve(__dirname, "dist/mockServiceWorker.js");
      if (existsSync(target)) rmSync(target);
    },
  };
}

export default defineConfig({
  plugins: [react(), stripMockWorkerFromBuild()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5173,
    // api/client.ts only ever fetches relative paths ("/api/...") -- fine
    // for a real deployment (frontend and backend behind the same Caddy
    // origin, see docs/design/11), but `vite dev` has nothing to forward
    // those to on its own. Proxy to the backend's real port, overridable
    // via VITE_API_PROXY_TARGET for CI's docker-compose.test.yml stack.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // mocks/ only exists to be loaded BY tests/the mockup build, same
      // reasoning as logand.app excluding its own mocks/ from coverage.
      exclude: ["src/mocks/**", "**/*.d.ts"],
    },
  },
});
