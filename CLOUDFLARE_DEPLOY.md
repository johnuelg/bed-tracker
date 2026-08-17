# Cloudflare Pages deployment

This is a static Vite + React application. Configure it as a **Cloudflare Pages** project, not a Worker.

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Deploy command:** leave empty so Pages publishes `dist`, or use `npx wrangler pages deploy dist`

In Cloudflare Pages project settings, define these build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The app also accepts the existing `VITE_SUPABASE_PUBLISHABLE_KEY` name for compatibility with the current local and Lovable Supabase configuration. Do not use `process.env` or hardcode Supabase credentials in the frontend.

Client-side routing is handled by `public/_redirects`, which Vite copies into `dist` during the build.