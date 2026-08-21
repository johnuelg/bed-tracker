# Cloudflare Workers static-assets deployment

This is a static Vite + React application deployed with the repository-pinned Wrangler CLI and the `wrangler.jsonc` static-assets configuration.

- **Build command:** `npm run build` (or `bun run build` locally)
- **Build output directory:** `dist`
- **Deploy command:** `npm run deploy` (builds, then runs the local `wrangler deploy`)
- **Local Cloudflare preview:** `npm run cf:dev`

`wrangler.jsonc` defines `dist` as static assets and uses SPA not-found handling so React Router's `BrowserRouter` routes fall back to `index.html` on refresh. The project intentionally does not use the Cloudflare Vite plugin because no Worker runtime code is required.

In Cloudflare Workers build settings, define these public build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

The app accepts either anonymous-key name for compatibility. Do not set service-role keys or other private secrets as Vite variables, and do not hardcode credentials in the frontend.

Cloudflare Workers static-assets routing is controlled by `wrangler.jsonc`; `public/_redirects` is not used by Wrangler for this deployment.