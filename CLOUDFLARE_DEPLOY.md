# Cloudflare Workers static assets deployment

This is a static Vite + React application deployed with the repository-pinned Wrangler CLI and the `wrangler.jsonc` static-assets configuration.

- **Build command:** `npm run build` (or `bun run build` locally)
- **Build output directory:** `dist`
- **Deploy command:** `npm run deploy` (builds, then runs the local `wrangler deploy`)
- **Local Cloudflare preview:** `npm run preview:cloudflare`

`wrangler.jsonc` defines `dist` as static assets and uses SPA not-found handling so React Router paths fall back to `index.html`.

In Cloudflare Pages project settings, define these build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The app also accepts the existing `VITE_SUPABASE_PUBLISHABLE_KEY` name for compatibility with the current local and Lovable Supabase configuration. Do not use `process.env` or hardcode Supabase credentials in the frontend.

Client-side routing is handled by `public/_redirects`, which Vite copies into `dist` during the build.