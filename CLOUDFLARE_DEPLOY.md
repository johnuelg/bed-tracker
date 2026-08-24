# Cloudflare Workers full-stack deployment

This Vite + React application is deployed as one Cloudflare Worker: `worker/index.ts` handles `/api/*`, while Worker assets serve the static application from `dist` for every other route.

- **Build command:** `npm run build` (or `bun run build` locally)
- **Build output directory:** `dist`
- **Deploy command:** `npm run deploy` (builds, then runs the local `wrangler deploy`)
- **Local Cloudflare preview:** `npm run preview`

`wrangler.jsonc` explicitly defines the Worker entry point and static assets, so Wrangler does not need to infer or modify the Vite configuration. `run_worker_first` keeps `/api/*` requests out of the SPA fallback; all other requests are fetched from the `ASSETS` Worker asset binding. SPA not-found handling preserves React Router refreshes.

In Cloudflare Workers build settings, define these public build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

The app accepts either anonymous-key name for compatibility. Do not set service-role keys or other private secrets as Vite variables, and do not hardcode credentials in the frontend.

The current Worker API has only a health endpoint and does not call Supabase. If a future Worker API needs privileged Supabase access, set it only as a Worker secret:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Do not add a service-role key to a `VITE_*` variable. Cloudflare Workers routing is controlled by `wrangler.jsonc`; `public/_redirects` is not used by Wrangler for this deployment.