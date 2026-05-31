import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamText, convertToModelMessages, type UIMessage } from "npm:ai@6";
import { google } from "npm:@ai-sdk/google@1";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const responseCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vercel-ai-ui-message-stream",
};

const SAUDI_TZ = "Asia/Riyadh";

const formatSaudi = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const todaySaudiIso = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAUDI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // YYYY-MM-DD
};

type Submission = {
  id: string;
  department_id: string;
  total_beds: number;
  occupied: number;
  closed: number;
  closure_reason: string | null;
  submitted_on: string;
  updated_at: string | null;
  created_at: string;
  custom_fields?: Record<string, unknown> | null;
  calculated_fields?: Record<string, unknown> | null;
};

type Department = { id: string; name: string; is_active: boolean };
type LlmProvider = "lovable_gateway" | "gemini_direct";
type LlmSettings = { provider: LlmProvider; model: string };

const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: "lovable_gateway",
  model: "google/gemini-3-flash-preview",
};

const normalizeLlmSettings = (value: unknown): LlmSettings => {
  if (!value || typeof value !== "object") return DEFAULT_LLM_SETTINGS;
  const source = value as Partial<Record<keyof LlmSettings, unknown>>;
  const provider = source.provider === "gemini_direct" ? "gemini_direct" : "lovable_gateway";
  const modelCandidate = typeof source.model === "string" ? source.model.trim() : "";
  return {
    provider,
    model: modelCandidate.length > 0 ? modelCandidate : DEFAULT_LLM_SETTINGS.model,
  };
};

const fetchAllBedSubmissions = async (supabase: ReturnType<typeof createClient>) => {
  const pageSize = 1000;
  let from = 0;
  const allRows: Submission[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("bed_submissions")
      .select("id,department_id,total_beds,occupied,closed,closure_reason,submitted_on,updated_at,created_at,custom_fields,calculated_fields")
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = (data ?? []) as Submission[];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
};

const buildLatestPerDeptDay = (rows: Submission[]) => {
  const map = new Map<string, Submission>();
  for (const r of rows) {
    const key = `${r.submitted_on}__${r.department_id}`;
    const existing = map.get(key);
    const ts = (s: Submission) => new Date(s.updated_at ?? s.created_at).getTime();
    if (!existing || ts(r) > ts(existing)) map.set(key, r);
  }
  return [...map.values()];
};

const extractWaiting = (row: Submission) => {
  const custom = (row.custom_fields ?? {}) as Record<string, unknown>;
  const direct = custom.waiting_patients ?? custom.waitingPatients;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string") {
    const parsed = Number(direct);
    if (Number.isFinite(parsed)) return parsed;
  }
  const detected = Object.entries(custom).find(([key]) =>
    key.toLowerCase().includes("waiting") && key.toLowerCase().includes("patient"),
  )?.[1];
  if (typeof detected === "number" && Number.isFinite(detected)) return detected;
  if (typeof detected === "string") {
    const parsed = Number(detected);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseCorsHeaders });

  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? (body.messages as UIMessage[]) : null;
    if (!messages) {
      return new Response(JSON.stringify({ error: "Invalid request body: messages array is required." }), {
        status: 400,
        headers: { ...responseCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const [{ data: deptRows, error: deptError }, allSubs, { data: llmSettingsRow, error: llmSettingsError }] = await Promise.all([
      supabase.from("departments").select("id,name,is_active").eq("is_active", true),
      fetchAllBedSubmissions(supabase),
      supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "llm_settings")
        .maybeSingle(),
    ]);

    if (deptError) throw deptError;
    if (llmSettingsError) throw llmSettingsError;

    const departments = (deptRows ?? []) as Department[];
    const latest = buildLatestPerDeptDay(allSubs);
    const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "Unknown";

    const sortedDates = Array.from(new Set(latest.map((r) => r.submitted_on))).sort((a, b) => (a < b ? 1 : -1));
    const latestDate = sortedDates[0] ?? todaySaudiIso();
    const todays = latest.filter((r) => r.submitted_on === latestDate);

    const todayByDept = todays.map((r) => {
      const vacant = Math.max(0, r.total_beds - r.occupied - r.closed);
      const occRate = r.total_beds > 0 ? +((r.occupied / r.total_beds) * 100).toFixed(1) : 0;
      return {
        department: deptName(r.department_id),
        date: r.submitted_on,
        total: r.total_beds,
        occupied: r.occupied,
        closed: r.closed,
        vacant,
        waiting: extractWaiting(r),
        occupancy_pct: occRate,
        closure_reason: r.closure_reason,
        last_updated_saudi: formatSaudi(r.updated_at ?? r.created_at),
      };
    });

    const totals = todayByDept.reduce(
      (acc, r) => {
        acc.total += r.total; acc.occupied += r.occupied; acc.closed += r.closed; acc.vacant += r.vacant;
        return acc;
      },
      { total: 0, occupied: 0, closed: 0, vacant: 0 },
    );
    const overallOcc = totals.total > 0 ? +((totals.occupied / totals.total) * 100).toFixed(1) : 0;

    const recentByDept: Record<string, Array<{ date: string; occupied: number; total: number; closed: number }>> = {};
    for (const r of latest) {
      const name = deptName(r.department_id);
      if (!recentByDept[name]) recentByDept[name] = [];
      recentByDept[name].push({
        date: r.submitted_on, occupied: r.occupied, total: r.total_beds, closed: r.closed,
      });
    }
    for (const k of Object.keys(recentByDept)) {
      recentByDept[k] = recentByDept[k].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
    }

    const context = {
      today_saudi: latestDate,
      generated_at_saudi: formatSaudi(new Date().toISOString()),
      latest_data_date_saudi: latestDate,
      total_records_in_scope: allSubs.length,
      distinct_dates_in_scope: sortedDates.length,
      all_dates_desc: sortedDates,
      thresholds: { low: "<60%", optimal: "60-84%", watch: "85-89%", high: ">=90%" },
      overall_today: { ...totals, occupancy_pct: overallOcc },
      today_by_department: todayByDept,
      last_7_days_by_department: recentByDept,
      latest_per_department_per_date: latest.map((r) => {
        const vacant = Math.max(0, r.total_beds - r.occupied - r.closed);
        const occRate = r.total_beds > 0 ? +((r.occupied / r.total_beds) * 100).toFixed(1) : 0;
        return {
          id: r.id,
          department: deptName(r.department_id),
          date: r.submitted_on,
          total: r.total_beds,
          occupied: r.occupied,
          closed: r.closed,
          vacant,
          waiting: extractWaiting(r),
          occupancy_pct: occRate,
          closure_reason: r.closure_reason,
          custom_fields: r.custom_fields ?? {},
          calculated_fields: r.calculated_fields ?? {},
          last_updated_saudi: formatSaudi(r.updated_at ?? r.created_at),
        };
      }),
    };

    const system = `You are the Bed Management Assistant for Taif Children's Hospital.

SCOPE: Only answer questions about hospital bed management — occupied beds, vacant beds, closed beds, room availability, occupancy rate, closure reasons, and latest bed updates. If asked anything off-topic, politely refuse and remind the user you only handle bed management questions.

DATA RULES:
- Use ONLY the JSON snapshot below. Do not invent numbers.
- Snapshot already deduplicates: per (date, department) only the latest record is included. Never combine older entries.
- All dates and times are in Saudi Arabia local time (Asia/Riyadh). Always present them as Saudi time.
- Vacant = total - occupied - closed.
- Occupancy bands: Low <60%, Optimal 60-84%, Watch 85-89%, High >=90%. Label values using these bands when relevant.

STYLE: Concise, professional, scannable. Prefer short markdown tables or bullet lists for numbers. Always cite the date used.

TABLE-SCOPE RULE:
- Data Table scope is ALL data (all dates). Use latest_per_department_per_date for this.
- Do not say "today" unless the user explicitly asks for today, or unless latest_data_date_saudi is clearly cited.

SNAPSHOT JSON:
${JSON.stringify(context)}`;

    const llmSettings = normalizeLlmSettings(llmSettingsRow?.setting_value);
    const model = (() => {
      if (llmSettings.provider === "gemini_direct") {
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
          throw new Error("GEMINI_API_KEY is missing. Add it in project secrets to use Gemini direct mode.");
        }
        return google(llmSettings.model || "gemini-1.5-flash", {
          apiKey: geminiApiKey,
        });
      }

      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        throw new Error("LOVABLE_API_KEY is missing. Configure project secret or switch provider to Gemini direct.");
      }
      const gateway = createOpenAICompatible({
        name: "lovable-ai-gateway",
        baseURL: "https://ai.gateway.lovable.dev/v1",
        headers: { "Lovable-API-Key": lovableApiKey },
      });
      return gateway(llmSettings.model || "google/gemini-3-flash-preview");
    })();

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({ headers: responseCorsHeaders });
  } catch (err) {
    console.error("bed-chat error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...responseCorsHeaders, "Content-Type": "application/json" } },
    );
  }
});
