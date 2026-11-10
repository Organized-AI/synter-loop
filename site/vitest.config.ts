import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./site/wrangler.jsonc" },
      miniflare: {
        // Stand-in for agent-capture: echoes what the site forwarded.
        serviceBindings: {
          CAPTURE: async (req: Request) =>
            new Response(
              JSON.stringify({
                url: req.url,
                auth: req.headers.get("authorization"),
                cookie: req.headers.get("cookie"),
                lastEventId: req.headers.get("last-event-id"),
              }),
              { headers: { "content-type": "application/json" } },
            ),
        },
      },
    }),
  ],
  test: { name: "site", include: ["site/test/**/*.test.ts"] },
});
