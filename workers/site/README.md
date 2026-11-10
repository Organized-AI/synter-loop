# Static Workers site

The site Worker serves the landing page, `/live`, `/harness`, and an optional demo video from R2. `/api/live` proxies the sanitized capture index and does not expose raw events. `CAPTURE_FEED_URL` must be HTTPS outside local Wrangler development.

Drop an approved demo at R2 key `synter-loop-demo.mp4` in the `synter-loop-media` bucket to make the landing-page video available. No video or production URL is bundled. Worker deployment is a separate release action.
