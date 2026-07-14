import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Next.js aliases this to a no-op under its "react-server" build
      // condition; outside of Next's bundler (e.g. under Vitest) it would
      // otherwise throw, so point it at the no-op directly for tests.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
