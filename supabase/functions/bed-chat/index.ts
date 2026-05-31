import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamText, convertToModelMessages, type UIMessage } from "npm:ai@6";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
};

type Department = { id: string; name: string; is_active: boolean };

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages }: { messages: UIMessage[] } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const today = todaySaudiIso();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const startDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: SAUDI_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(sevenDaysAgo);

    const [{ data: deptRows }, { data: subRows }] = await Promise.all([
      supabase.from("departments").select("id,name,is_active").eq("is_active", true),
      supabase
        .from("bed_submissions")
        .select("id,department_id,total_beds,occupied,closed,closure_reason,submitted_on,updated_at,created_at")
        .gte("submitted_on", startDate)
        .order("updated_at", { ascending: false }),
    ]);

    const departments = (deptRows ?? []) as Department[];
    const allSubs = (subRows ?? []) as Submission[];
    const latest = buildLatestPerDeptDay(allSubs);
    const todays = latest.filter((r) => r.submitted_on === today);
    const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "Unknown";

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
      today_saudi: today,
      generated_at_saudi: formatSaudi(new Date().toISOString()),
      thresholds: { low: "<60%", optimal: "60-84%", watch: "85-89%", high: ">=90%" },
      overall_today: { ...totals, occupancy_pct: overallOcc },
      today_by_department: todayByDept,
      last_7_days_by_department: recentByDept,
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

SNAPSHOT JSON:
${JSON.stringify(context)}`;

    const gateway = createOpenAICompatible({
      name: "lovable-ai-gateway",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": apiKey },
    });

    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (err) {
    console.error("bed-chat error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
