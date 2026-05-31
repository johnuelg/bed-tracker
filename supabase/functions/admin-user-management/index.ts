import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getEnv = (primary: string, fallback?: string) => {
  const value = Deno.env.get(primary) ?? (fallback ? Deno.env.get(fallback) : undefined);
  return value?.trim() || null;
};

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_user"),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    display_name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal("set_user_active"),
    user_id: z.string().uuid(),
    is_active: z.boolean(),
  }),
  z.object({
    action: z.literal("list_users"),
  }),
  z.object({
    action: z.literal("update_user"),
    user_id: z.string().uuid(),
    email: z.string().trim().email().max(255).optional(),
    password: z.string().min(8).max(128).optional().or(z.literal("")),
    display_name: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(64).optional(),
  }),
]);

type Action = z.infer<typeof ActionSchema>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY");
    const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables", {
        hasUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(supabaseAnonKey),
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
      });

      return new Response(JSON.stringify({ error: "Server configuration error: missing Supabase credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (adminCheckError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedBody = ActionSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body: Action = parsedBody.data;
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    if (body.action === "create_user") {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });

      if (createError || !created.user) {
        throw new Error(createError?.message ?? "Failed to create auth user");
      }

      const userId = created.user.id;

      const { error: profileError } = await adminClient.from("profiles").upsert({
        user_id: userId,
        display_name: body.display_name,
        is_active: true,
      });

      if (profileError) throw profileError;

      const { error: roleDeleteError } = await adminClient.from("user_roles").delete().eq("user_id", userId);
      if (roleDeleteError) throw roleDeleteError;

      const { error: roleInsertError } = await adminClient.from("user_roles").insert({
        user_id: userId,
        role: body.role,
      });
      if (roleInsertError) throw roleInsertError;

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "set_user_active") {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ is_active: body.is_active })
        .eq("user_id", body.user_id);
      if (profileError) throw profileError;

      const { error: authError } = await adminClient.auth.admin.updateUserById(body.user_id, {
        ban_duration: body.is_active ? "none" : "876000h",
      });
      if (authError) throw authError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "list_users") {
      const emails: Record<string, string> = {};
      const userList: Array<{ id: string; email: string | null; created_at?: string }> = [];
      let page = 1;
      const perPage = 200;
      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const pageUsers = data?.users ?? [];
        for (const u of pageUsers) {
          if (u.email) emails[u.id] = u.email;
          userList.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
        }
        if (pageUsers.length < perPage) break;
        page += 1;
        if (page > 50) break;
      }
      return new Response(JSON.stringify({ success: true, emails, users: userList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "update_user") {
      const authUpdate: { email?: string; password?: string; email_confirm?: boolean } = {};
      if (body.email) {
        authUpdate.email = body.email;
        authUpdate.email_confirm = true;
      }
      if (body.password) authUpdate.password = body.password;

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await adminClient.auth.admin.updateUserById(body.user_id, authUpdate);
        if (authError) throw authError;
      }

      if (typeof body.display_name === "string" && body.display_name.length > 0) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update({ display_name: body.display_name })
          .eq("user_id", body.user_id);
        if (profileError) throw profileError;
      }

      if (body.role) {
        const { error: roleDeleteError } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", body.user_id);
        if (roleDeleteError) throw roleDeleteError;
        const { error: roleInsertError } = await adminClient
          .from("user_roles")
          .insert({ user_id: body.user_id, role: body.role });
        if (roleInsertError) throw roleInsertError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
