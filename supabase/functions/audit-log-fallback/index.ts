import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDIT_LOG_FALLBACK_KEY = "audit_logs_fallback";

const AuditEntrySchema = z.object({
  id: z.string().min(1).max(120),
  action: z.enum(["ADD", "EDIT", "DELETE"]),
  table_name: z.literal("bed_submissions"),
  record_id: z.string().uuid().nullable(),
  user_id: z.string().uuid(),
  user_name: z.string().max(255).nullable(),
  department_name: z.string().max(255).nullable(),
  record_date: z.string().max(40).nullable(),
  changes: z.record(z.object({ from: z.unknown().optional(), to: z.unknown().optional() })),
  created_at: z.string().datetime(),
});

const BodySchema = z.object({ entry: AuditEntrySchema });

const getEnv = (primary: string, fallback?: string) => {
  const value = Deno.env.get(primary) ?? (fallback ? Deno.env.get(fallback) : undefined);
  return value?.trim() || null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY");
    const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    const caller = userData.user;

    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body", details: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.data.entry.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: "User mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: existing, error: readError } = await adminClient
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", AUDIT_LOG_FALLBACK_KEY)
      .maybeSingle();

    if (readError) throw readError;

    const current = Array.isArray(existing?.setting_value) ? existing.setting_value : [];
    const next = [parsed.data.entry, ...current]
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
      .slice(0, 500);

    const { error: writeError } = await adminClient.from("app_settings").upsert(
      {
        setting_key: AUDIT_LOG_FALLBACK_KEY,
        setting_value: next,
        updated_by: caller.id,
      },
      { onConflict: "setting_key" },
    );

    if (writeError) throw writeError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
