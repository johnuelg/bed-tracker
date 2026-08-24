import { Hono } from "hono";

type Env = {
  ASSETS: Fetcher;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const api = new Hono<{ Bindings: Env }>();

api.get("/api/health", (context) =>
  context.json({ ok: true, service: "bed-tracker-api" }),
);

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;