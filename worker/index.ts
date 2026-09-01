import { Hono } from "hono";

type Env = {
  ASSETS: Fetcher;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ORCA_ROUTER_API_KEY?: string;
  ORCA_ROUTER_BASE_URL?: string;
};

const api = new Hono<{ Bindings: Env }>();

api.get("/api/health", (context) =>
  context.json({ ok: true, service: "bed-tracker-api" }),
);

api.post("/api/orca/chat", async (context) => {
  const apiKey = context.env.ORCA_ROUTER_API_KEY?.trim();
  if (!apiKey) return context.json({ error: "OrcaRouter is not configured. Add ORCA_ROUTER_API_KEY as a Worker secret." }, 503);

  const body = await context.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object") return context.json({ error: "A valid chat request is required." }, 400);
  const requestBody = body as Record<string, unknown>;
  if (!Array.isArray(requestBody.messages) || typeof requestBody.model !== "string" || !requestBody.model.trim()) {
    return context.json({ error: "Messages and model are required." }, 400);
  }

  const baseUrl = (context.env.ORCA_ROUTER_BASE_URL || "https://orcarouter.com/api/v1").replace(/\/+$/, "");
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: requestBody.messages,
        model: requestBody.model.trim(),
        max_tokens: typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : 1200,
        temperature: typeof requestBody.temperature === "number" ? requestBody.temperature : 0.2,
        stream: false,
      }),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return context.json({ error: "OrcaRouter is temporarily unavailable. Please retry or switch providers." }, 502);
  }
});

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;