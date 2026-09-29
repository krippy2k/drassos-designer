import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(import.meta.dirname, "..");
const engineRoot = path.join(repoRoot, "drassos-engine");
const engineModules = path.join(engineRoot, "packages/engine/node_modules");
const apiModules = path.join(engineRoot, "packages/api/node_modules");

export default defineConfig({
  resolve: {
    alias: [
      { find: "@drassos/core/errors", replacement: path.join(engineRoot, "packages/core/src/errors-entry.ts") },
      { find: "@drassos/core/types", replacement: path.join(engineRoot, "packages/core/src/types-entry.ts") },
      { find: "@drassos/core", replacement: path.join(engineRoot, "packages/core/src/index.ts") },
      { find: "@drassos/engine", replacement: path.join(engineRoot, "packages/engine/src/index.ts") },
      { find: "@drassos/api", replacement: path.join(engineRoot, "packages/api/src/index.ts") },
      { find: /^hono$/, replacement: path.join(apiModules, "hono/dist/index.js") },
      { find: /^hono\/cors$/, replacement: path.join(apiModules, "hono/dist/middleware/cors/index.js") },
      { find: /^hono\/streaming$/, replacement: path.join(apiModules, "hono/dist/helper/streaming/index.js") },
      { find: "@hono/node-server/serve-static", replacement: path.join(apiModules, "@hono/node-server/dist/serve-static.mjs") },
      { find: "@hono/node-server", replacement: path.join(apiModules, "@hono/node-server/dist/index.mjs") },
      { find: "zod", replacement: path.join(engineModules, "zod") },
      { find: "pino", replacement: path.join(engineModules, "pino") },
      { find: "pg", replacement: path.join(engineModules, "pg") },
      { find: "@electric-sql/pglite", replacement: path.join(engineModules, "@electric-sql/pglite") },
      { find: "ws", replacement: path.join(engineRoot, "packages/engine/node_modules/ws") },
    ],
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
  },
});
