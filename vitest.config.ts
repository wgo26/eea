import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
            // Unit tests run in plain Node, not inside React Server Components,
            // so the `server-only` import guard must resolve to a no-op.
            // Production builds are unaffected (Next resolves the real package).
            "server-only": path.resolve(__dirname, "lib/test-helpers/server-only-mock.ts"),
        },
    },
    test: {
        environment: "node",
        // Phase 2: integration RLS regression net (tests/integration) runs in
        // the same unit gate — suites self-skip without a live backend, so CI
        // with dummy keys stays green while staging/prod runs prove the policies.
        include: [
            "lib/**/*.test.ts",
            "scripts/**/*.test.mjs",
            "tests/unit/**/*.test.ts",
            "tests/integration/**/*.test.ts",
        ],
    },
});
