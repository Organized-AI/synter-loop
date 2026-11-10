import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./capture/migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./capture/wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, CAPTURE_TOKEN: "test-capture-token", SGTM_FORWARD: "off" },
        },
      }),
    ],
    test: { name: "capture", include: ["capture/test/**/*.test.ts"], setupFiles: ["./capture/test/setup.ts"] },
  };
});
