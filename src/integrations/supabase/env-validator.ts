type ValidatedSupabaseEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

const PREVIEW_HOST_MATCHERS = ["lovableproject.com", "lovable.app"];

function isRunningInPreviewHost() {
  if (typeof window === "undefined") return false;
  return PREVIEW_HOST_MATCHERS.some((host) => window.location.hostname.includes(host));
}

function isValidHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isJwtLike(value: string) {
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value);
}

export function getValidatedSupabaseEnv(): ValidatedSupabaseEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const environmentLabel = isRunningInPreviewHost() ? "preview/published" : "local";

  if (!supabaseUrl) {
    throw new Error(
      `[Supabase config] Missing VITE_SUPABASE_URL in ${environmentLabel} environment.`,
    );
  }

  if (!isValidHttpsUrl(supabaseUrl)) {
    throw new Error(
      `[Supabase config] VITE_SUPABASE_URL must be a valid HTTPS URL in ${environmentLabel} environment.`,
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      `[Supabase config] Missing VITE_SUPABASE_PUBLISHABLE_KEY in ${environmentLabel} environment.`,
    );
  }

  if (!isJwtLike(supabaseAnonKey)) {
    throw new Error(
      `[Supabase config] VITE_SUPABASE_PUBLISHABLE_KEY is not a valid anon key format in ${environmentLabel} environment.`,
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}