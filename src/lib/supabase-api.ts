import { supabase } from "@/integrations/supabase/client";
import { requireRole } from "@/lib/api-guard";
import { compressImageIfNeeded, MAX_UPLOAD_SIZE, validateFileType } from "@/lib/file-upload";
import { getSaudiIsoDate } from "@/lib/date-time";
import { evaluateSafeExpression } from "@/lib/math-eval";
import { bedSubmissionSchema, formulaSchema } from "@/lib/validation";
import type {
  AppRole,
  AuditAction,
  AuditLogEntry,
  BedSubmission,
  BedType,
  Department,
  FormField,
  KpiFormula,
  KpiWidget,
  NavVisibilitySettings,
  OccupancyBenchmarkLevel,
  OccupancyBenchmarkSettings,
  RoleMenuVisibility,
  Profile,
  UserEntryPermissions,
} from "@/types/hospital";
import { isValidStatusIconKey, getDefaultIconForLabel } from "@/lib/status-icons";

const db = supabase as any;
const NAV_VISIBILITY_KEY = "nav_visibility";
const ROLE_CATALOG_KEY = "role_catalog";
const OCCUPANCY_BENCHMARK_KEY = "occupancy_benchmark";
const DEPARTMENT_TOTAL_BEDS_KEY = "department_total_beds";
const AUDIT_LOG_FALLBACK_KEY = "audit_logs_fallback";
const DEFAULT_ROLE_CATALOG: AppRole[] = ["admin", "director", "doctor", "nurse", "staff"];
const DEFAULT_ROLE_MENU_VISIBILITY: RoleMenuVisibility = {
  dashboard: true,
  data_entry: true,
  kpi_builder: true,
  categories: true,
  form_builder: true,
  users: true,
  data_table: true,
  audit_log: true,
  bed_map: true,
  reports_analytics: true,
};
const DEFAULT_NAV_VISIBILITY: NavVisibilitySettings = {
  admin: { ...DEFAULT_ROLE_MENU_VISIBILITY },
  director: { ...DEFAULT_ROLE_MENU_VISIBILITY },
  doctor: { ...DEFAULT_ROLE_MENU_VISIBILITY },
  nurse: { ...DEFAULT_ROLE_MENU_VISIBILITY },
  staff: { ...DEFAULT_ROLE_MENU_VISIBILITY },
};
const DEFAULT_OCCUPANCY_BENCHMARK_SETTINGS: OccupancyBenchmarkSettings = {
  levels: [
    {
      key: "low",
      label: "Low",
      threshold: "< 60%",
      minPercent: null,
      maxPercent: 60,
      minInclusive: false,
      maxInclusive: false,
      color: "#16a34a",
      icon: "thumbs-up",
    },
    {
      key: "optimal",
      label: "Optimal",
      threshold: "60% – 84%",
      minPercent: 60,
      maxPercent: 84,
      minInclusive: true,
      maxInclusive: true,
      color: "#16a34a",
      icon: "check",
    },
    {
      key: "watch",
      label: "Watch",
      threshold: "85% – 89%",
      minPercent: 85,
      maxPercent: 89,
      minInclusive: true,
      maxInclusive: true,
      color: "#f59e0b",
      icon: "eye",
    },
    {
      key: "high",
      label: "High",
      threshold: "≥ 90%",
      minPercent: 90,
      maxPercent: null,
      minInclusive: true,
      maxInclusive: false,
      color: "#dc2626",
      icon: "alert-triangle",
    },
  ],
};

const isMissingSchemaTable = (err: unknown) => {
  const msg = (err as { message?: string })?.message ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /schema cache/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
};

const isAuditStorageUnavailable = (err: unknown) => {
  const msg = (err as { message?: string })?.message ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return isMissingSchemaTable(err) || code === "42501" || /row-level security|permission denied/i.test(msg);
};

const normalizeRoleMenuVisibility = (value: unknown): RoleMenuVisibility => {
  if (!value || typeof value !== "object") return { ...DEFAULT_ROLE_MENU_VISIBILITY };
  const source = value as Partial<Record<keyof RoleMenuVisibility, unknown>>;
  return {
    dashboard: typeof source.dashboard === "boolean" ? source.dashboard : true,
    data_entry: typeof source.data_entry === "boolean" ? source.data_entry : true,
    kpi_builder: typeof source.kpi_builder === "boolean" ? source.kpi_builder : true,
    categories: typeof source.categories === "boolean" ? source.categories : true,
    form_builder: typeof source.form_builder === "boolean" ? source.form_builder : true,
    users: typeof source.users === "boolean" ? source.users : true,
    data_table: typeof source.data_table === "boolean" ? source.data_table : true,
    audit_log: typeof source.audit_log === "boolean" ? source.audit_log : true,
    reports_analytics: typeof source.reports_analytics === "boolean" ? source.reports_analytics : true,
  };
};

const normalizeNavVisibility = (value: unknown): NavVisibilitySettings => {
  if (!value || typeof value !== "object") return DEFAULT_NAV_VISIBILITY;
  const source = value as Record<string, unknown>;

  const normalizedEntries = Object.entries(source)
    .filter(([role]) => role.trim().length > 0)
    .map(([role, roleValue]) => [role, normalizeRoleMenuVisibility(roleValue)] as const);

  const base = {
    admin: { ...DEFAULT_ROLE_MENU_VISIBILITY },
    director: { ...DEFAULT_ROLE_MENU_VISIBILITY },
    doctor: { ...DEFAULT_ROLE_MENU_VISIBILITY },
    nurse: { ...DEFAULT_ROLE_MENU_VISIBILITY },
    staff: { ...DEFAULT_ROLE_MENU_VISIBILITY },
  };

  if (normalizedEntries.length === 0) {
    return base;
  }

  return {
    ...base,
    ...Object.fromEntries(normalizedEntries),
  };
};

const isValidColorCode = (value: string) =>
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) || /^hsl\(\s*\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\s*\)$/i.test(value.trim());

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);

const parseThresholdValue = (value: string) => {
  const normalized = value.trim().replace(/–/g, "-");

  const rangeMatch = normalized.match(/^(\d{1,3})\s*%?\s*-\s*(\d{1,3})\s*%?$/);
  if (rangeMatch) {
    const min = clampPercent(Number(rangeMatch[1]));
    const max = clampPercent(Number(rangeMatch[2]));
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
      return {
        threshold: `${min}% – ${max}%`,
        minPercent: min,
        maxPercent: max,
        minInclusive: true,
        maxInclusive: true,
      };
    }
  }

  const lessThanMatch = normalized.match(/^<\s*(\d{1,3})\s*%?$/);
  if (lessThanMatch) {
    const max = clampPercent(Number(lessThanMatch[1]));
    if (Number.isFinite(max)) {
      return {
        threshold: `< ${max}%`,
        minPercent: null,
        maxPercent: max,
        minInclusive: false,
        maxInclusive: false,
      };
    }
  }

  const greaterThanMatch = normalized.match(/^(>=|≥)\s*(\d{1,3})\s*%?$/);
  if (greaterThanMatch) {
    const min = clampPercent(Number(greaterThanMatch[2]));
    if (Number.isFinite(min)) {
      return {
        threshold: `≥ ${min}%`,
        minPercent: min,
        maxPercent: null,
        minInclusive: true,
        maxInclusive: false,
      };
    }
  }

  return null;
};

const normalizeOccupancyLevel = (
  level: unknown,
  fallback: OccupancyBenchmarkLevel,
  index: number,
): OccupancyBenchmarkLevel => {
  if (!level || typeof level !== "object") return { ...fallback };
  const source = level as Partial<Record<keyof OccupancyBenchmarkLevel, unknown>>;
  const fallbackLabel = fallback.label || `Status ${index + 1}`;
  const label = typeof source.label === "string" && source.label.trim().length > 0 ? source.label.trim() : fallbackLabel;
  const keySource = typeof source.key === "string" && source.key.trim().length > 0 ? source.key.trim() : "";
  const fallbackKey = fallback.key || `status_${index + 1}`;
  const key = keySource || fallbackKey;
  const thresholdSource = typeof source.threshold === "string" ? source.threshold : "";
  const parsedThreshold = parseThresholdValue(thresholdSource);

  const minPercentCandidate = source.minPercent === null ? null : Number(source.minPercent);
  const maxPercentCandidate = source.maxPercent === null ? null : Number(source.maxPercent);
  const hasValidBounds =
    (minPercentCandidate === null || Number.isFinite(minPercentCandidate)) &&
    (maxPercentCandidate === null || Number.isFinite(maxPercentCandidate));

  const minPercent = minPercentCandidate === null ? null : clampPercent(minPercentCandidate);
  const maxPercent = maxPercentCandidate === null ? null : clampPercent(maxPercentCandidate);

  const minInclusive = typeof source.minInclusive === "boolean" ? source.minInclusive : fallback.minInclusive ?? true;
  const maxInclusive = typeof source.maxInclusive === "boolean" ? source.maxInclusive : fallback.maxInclusive ?? true;

  const threshold =
    parsedThreshold?.threshold ??
    (typeof source.threshold === "string" && source.threshold.trim().length > 0 ? source.threshold.trim() : fallback.threshold);

  const colorCandidate = typeof source.color === "string" ? source.color.trim() : "";
  const color = isValidColorCode(colorCandidate) ? colorCandidate : fallback.color;

  const derived = parsedThreshold ?? (hasValidBounds ? { minPercent, maxPercent, minInclusive, maxInclusive } : null);

  const iconCandidate = typeof source.icon === "string" ? source.icon.trim() : "";
  const icon = isValidStatusIconKey(iconCandidate)
    ? iconCandidate
    : (fallback.icon && isValidStatusIconKey(fallback.icon) ? fallback.icon : getDefaultIconForLabel(label, key));

  return {
    key,
    label,
    threshold,
    minPercent: derived?.minPercent ?? fallback.minPercent,
    maxPercent: derived?.maxPercent ?? fallback.maxPercent,
    minInclusive: derived?.minInclusive ?? fallback.minInclusive,
    maxInclusive: derived?.maxInclusive ?? fallback.maxInclusive,
    color,
    icon,
  };
};

const normalizeOccupancyBenchmarkSettings = (value: unknown): OccupancyBenchmarkSettings => {
  const source = value && typeof value === "object" ? (value as { levels?: unknown[] }) : {};
  const levels = Array.isArray(source.levels) ? source.levels : [];
  const fallbackLevels = DEFAULT_OCCUPANCY_BENCHMARK_SETTINGS.levels;

  const normalizedLevels = levels
    .map((level, index) => normalizeOccupancyLevel(level, fallbackLevels[index] ?? fallbackLevels[fallbackLevels.length - 1], index))
    .filter((level) => level.label.trim().length > 0);

  const usedKeys = new Set<string>();
  const dedupedLevels = normalizedLevels.map((level, index) => {
    const baseKey = (level.key || `status_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || `status_${index + 1}`;

    let uniqueKey = baseKey;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(uniqueKey);

    return {
      ...level,
      key: uniqueKey,
    };
  });

  if (dedupedLevels.length > 0) {
    return { levels: dedupedLevels };
  }

  return {
    levels: fallbackLevels.map((level) => ({ ...level })),
  };
};

export const getCurrentUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
};

export const fetchProfiles = async (): Promise<Profile[]> => {
  const { data, error } = await db.from("profiles").select("id,user_id,display_name,is_active").order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const fetchUserRoles = async (userId?: string): Promise<Record<string, AppRole[]>> => {
  let query = db.from("user_roles").select("user_id,role");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).reduce((acc: Record<string, AppRole[]>, row: { user_id: string; role: string }) => {
    acc[row.user_id] = [...(acc[row.user_id] ?? []), row.role];
    return acc;
  }, {});
};

export const setUserRole = async (roles: AppRole[], targetUserId: string, role: AppRole) => {
  requireRole(roles, ["admin"], "manage user roles");
  await db.from("user_roles").delete().eq("user_id", targetUserId);
  const { error } = await db.from("user_roles").insert({ user_id: targetUserId, role });
  if (error) throw error;
};

export const createUserByAdmin = async (roles: AppRole[], payload: { email: string; password: string; display_name: string; role: AppRole }) => {
  requireRole(roles, ["admin"], "create users");
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "create_user", ...payload },
  });
  if (error) throw error;
  return data;
};

export const deactivateUserByAdmin = async (roles: AppRole[], user_id: string, is_active: boolean) => {
  requireRole(roles, ["admin"], "update users");
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "set_user_active", user_id, is_active },
  });
  if (error) throw error;
  return data;
};

export const fetchUserEmails = async (roles: AppRole[]): Promise<Record<string, string>> => {
  requireRole(roles, ["admin"], "view user emails");
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "list_users" },
  });
  if (error) throw error;

  // Support multiple response shapes from the edge function:
  //   { emails: { [user_id]: email } }
  //   { users: [{ id, email, ... }] }
  //   [{ id, email, ... }]
  if (data && typeof data === "object" && data.emails && typeof data.emails === "object") {
    return data.emails as Record<string, string>;
  }

  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.users)
      ? data.users
      : [];

  const emails: Record<string, string> = {};
  for (const u of list) {
    const id = u?.id ?? u?.user_id;
    const email = u?.email ?? u?.user?.email;
    if (id && email) emails[id] = email;
  }
  return emails;
};

export const updateUserByAdmin = async (
  roles: AppRole[],
  payload: { user_id: string; email?: string; password?: string; display_name?: string; role?: AppRole },
) => {
  requireRole(roles, ["admin"], "update users");
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "update_user", ...payload },
  });
  if (error) throw error;
  return data;
};

export const fetchNavVisibilitySettings = async (): Promise<NavVisibilitySettings> => {
  const { data, error } = await db
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", NAV_VISIBILITY_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeNavVisibility(data?.setting_value);
};

export const saveNavVisibilitySettings = async (
  roles: AppRole[],
  settings: NavVisibilitySettings,
  userId: string,
) => {
  requireRole(roles, ["admin"], "manage navigation settings");
  const { error } = await db.from("app_settings").upsert(
    {
      setting_key: NAV_VISIBILITY_KEY,
      setting_value: settings,
      updated_by: userId,
    },
    { onConflict: "setting_key" },
  );
  if (error) throw error;
};

export const fetchRoleCatalog = async (): Promise<AppRole[]> => {
  const { data, error } = await db
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", ROLE_CATALOG_KEY)
    .maybeSingle();

  if (error) throw error;

  const values = data?.setting_value;
  if (!Array.isArray(values)) return DEFAULT_ROLE_CATALOG;

  const cleaned = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const deduped = cleaned.length > 0 ? Array.from(new Set(cleaned)) : DEFAULT_ROLE_CATALOG;
  return deduped.includes("admin") ? deduped : ["admin", ...deduped];
};

export const saveRoleCatalog = async (roles: AppRole[], roleCatalog: AppRole[], userId: string) => {
  requireRole(roles, ["admin"], "manage roles catalog");

  const cleaned = Array.from(
    new Set(
      roleCatalog
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  );

  const baseCatalog = cleaned.length > 0 ? cleaned : DEFAULT_ROLE_CATALOG;
  const finalCatalog = baseCatalog.includes("admin") ? baseCatalog : ["admin", ...baseCatalog];

  const { error } = await db.from("app_settings").upsert(
    {
      setting_key: ROLE_CATALOG_KEY,
      setting_value: finalCatalog,
      updated_by: userId,
    },
    { onConflict: "setting_key" },
  );

  if (error) throw error;
};

export const fetchOccupancyBenchmarkSettings = async (): Promise<OccupancyBenchmarkSettings> => {
  const { data, error } = await db
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", OCCUPANCY_BENCHMARK_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeOccupancyBenchmarkSettings(data?.setting_value);
};

export const saveOccupancyBenchmarkSettings = async (
  roles: AppRole[],
  settings: OccupancyBenchmarkSettings,
  userId: string,
) => {
  requireRole(roles, ["admin"], "manage occupancy benchmark settings");

  const normalized = normalizeOccupancyBenchmarkSettings(settings);

  const { error } = await db.from("app_settings").upsert(
    {
      setting_key: OCCUPANCY_BENCHMARK_KEY,
      setting_value: normalized,
      updated_by: userId,
    },
    { onConflict: "setting_key" },
  );

  if (error) throw error;
};

export type DepartmentTotalBedsMap = Record<string, number>;

const normalizeDepartmentTotalBeds = (value: unknown): DepartmentTotalBedsMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: DepartmentTotalBedsMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) result[k] = Math.floor(n);
  }
  return result;
};

export const fetchDepartmentTotalBeds = async (): Promise<DepartmentTotalBedsMap> => {
  const { data, error } = await db
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", DEPARTMENT_TOTAL_BEDS_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeDepartmentTotalBeds(data?.setting_value);
};

export const saveDepartmentTotalBeds = async (
  roles: AppRole[],
  map: DepartmentTotalBedsMap,
  userId: string,
) => {
  requireRole(roles, ["admin"], "manage department total beds");
  const normalized = normalizeDepartmentTotalBeds(map);
  const { error } = await db.from("app_settings").upsert(
    {
      setting_key: DEPARTMENT_TOTAL_BEDS_KEY,
      setting_value: normalized,
      updated_by: userId,
    },
    { onConflict: "setting_key" },
  );
  if (error) throw error;
};

export const fetchDepartments = async (): Promise<Department[]> => {
  const { data, error } = await db.from("departments").select("id,name,code,sort_order,is_active").order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const saveDepartment = async (roles: AppRole[], input: Partial<Department> & { name: string; code: string }) => {
  requireRole(roles, ["admin"], "manage departments");
  const { error } = await db.from("departments").upsert(input, { onConflict: "code" });
  if (error) throw error;
};

export const updateDepartment = async (
  roles: AppRole[],
  id: string,
  input: { name: string; code: string },
) => {
  requireRole(roles, ["admin"], "manage departments");
  const { error } = await db.from("departments").update(input).eq("id", id);
  if (error) throw error;
};

export const deleteDepartment = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin"], "manage departments");
  const { error } = await db.from("departments").delete().eq("id", id);
  if (error) throw error;
};

export const toggleDepartmentActive = async (roles: AppRole[], id: string, is_active: boolean) => {
  requireRole(roles, ["admin"], "manage departments");
  const { error } = await db.from("departments").update({ is_active }).eq("id", id);
  if (error) throw error;
};

export const fetchBedTypes = async (): Promise<BedType[]> => {
  const { data, error } = await db.from("bed_types").select("id,name,sort_order,is_active").order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const saveBedType = async (roles: AppRole[], input: Partial<BedType> & { name: string }) => {
  requireRole(roles, ["admin"], "manage bed types");
  const { error } = await db.from("bed_types").upsert(input, { onConflict: "name" });
  if (error) throw error;
};

export const updateBedType = async (
  roles: AppRole[],
  id: string,
  input: { name: string },
) => {
  requireRole(roles, ["admin"], "manage bed types");
  const { error } = await db.from("bed_types").update(input).eq("id", id);
  if (error) throw error;
};

export const deleteBedType = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin"], "manage bed types");
  const { error } = await db.from("bed_types").delete().eq("id", id);
  if (error) throw error;
};

export const toggleBedTypeActive = async (roles: AppRole[], id: string, is_active: boolean) => {
  requireRole(roles, ["admin"], "manage bed types");
  const { error } = await db.from("bed_types").update({ is_active }).eq("id", id);
  if (error) throw error;
};

export const fetchFormFields = async (): Promise<FormField[]> => {
  const { data, error } = await db.from("form_fields").select("*").order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const saveFormField = async (roles: AppRole[], field: Partial<FormField> & { field_key: string; label: string; field_type: FormField["field_type"] }) => {
  requireRole(roles, ["admin"], "manage form builder");
  const { error } = await db.from("form_fields").upsert(field, { onConflict: "field_key" });
  if (error) throw error;
};

export const updateFormField = async (
  roles: AppRole[],
  id: string,
  field: Partial<FormField> & { field_key: string; label: string; field_type: FormField["field_type"] },
) => {
  requireRole(roles, ["admin"], "manage form builder");
  const { error } = await db.from("form_fields").update(field).eq("id", id);
  if (error) throw error;
};

export const deleteFormField = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin"], "manage form builder");
  const { error } = await db.from("form_fields").delete().eq("id", id);
  if (error) throw error;
};

export const replaceFormFieldOrder = async (roles: AppRole[], orderedIds: string[]) => {
  requireRole(roles, ["admin"], "reorder form fields");
  await Promise.all(
    orderedIds.map((id, index) =>
      db.from("form_fields").update({ display_order: index + 1 }).eq("id", id),
    ),
  );
};

export const fetchTodaySubmissions = async (): Promise<BedSubmission[]> => {
  const today = getSaudiIsoDate();
  const { data, error } = await db
    .from("bed_submissions")
    .select("*")
    .eq("submitted_on", today)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};

export const fetchSubmissionsByDateRange = async (startDate: string, endDate: string): Promise<BedSubmission[]> => {
  const from = startDate <= endDate ? startDate : endDate;
  const to = startDate <= endDate ? endDate : startDate;

  const { data, error } = await db
    .from("bed_submissions")
    .select("*")
    .gte("submitted_on", from)
    .lte("submitted_on", to)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const fetchDashboardSubmissions = async (): Promise<BedSubmission[]> => {
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;
  const allRows: BedSubmission[] = [];

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from("bed_submissions")
      .select("*")
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = (data ?? []) as BedSubmission[];
    allRows.push(...chunk);
    hasMore = chunk.length === pageSize;
    from += pageSize;
  }

  return allRows;
};

export const saveBedSubmission = async (
  roles: AppRole[],
  input: Omit<BedSubmission, "id" | "created_at"> & { id?: string },
) => {
  const normalized = {
    ...input,
    total_beds: Number(input.total_beds),
    occupied: Number(input.occupied),
    closed: Number(input.closed),
  };

  bedSubmissionSchema.parse(normalized);

  if (!roles.some((role) => ["admin", "director", "doctor", "nurse", "staff"].includes(role))) {
    throw new Error("Unauthorized: cannot submit bed records.");
  }

  const { data, error } = await db.from("bed_submissions").upsert(normalized).select("*").single();
  if (error) throw error;
  return data as BedSubmission;
};

export const deleteBedSubmission = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin", "director"], "delete bed submissions");
  const { error } = await db.from("bed_submissions").delete().eq("id", id);
  if (error) throw error;
};

export const deleteAllBedSubmissions = async (roles: AppRole[]) => {
  requireRole(roles, ["admin", "director"], "delete all bed submissions");
  const { error } = await db
    .from("bed_submissions")
    .delete()
    .not("id", "is", null);
  if (error) throw error;
};

export const fetchKpiFormulas = async (): Promise<KpiFormula[]> => {
  const { data, error } = await db.from("kpi_formulas").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const saveKpiFormula = async (roles: AppRole[], formula: Omit<KpiFormula, "id" | "is_system"> & { id?: string }) => {
  requireRole(roles, ["admin", "director"], "manage KPI formulas");
  formulaSchema.parse(formula);
  const { error } = await db.from("kpi_formulas").upsert(formula, { onConflict: "name" });
  if (error) throw error;
};

export const updateKpiFormula = async (
  roles: AppRole[],
  id: string,
  formula: Omit<KpiFormula, "id" | "is_system">,
) => {
  requireRole(roles, ["admin", "director"], "manage KPI formulas");
  formulaSchema.parse(formula);
  const { error } = await db.from("kpi_formulas").update(formula).eq("id", id);
  if (error) throw error;
};

export const deleteKpiFormula = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin", "director"], "manage KPI formulas");
  const { error } = await db.from("kpi_formulas").delete().eq("id", id).eq("is_system", false);
  if (error) throw error;
};

export const fetchKpiWidgets = async (): Promise<KpiWidget[]> => {
  const { data, error } = await db.from("kpi_widgets").select("*").order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const saveKpiWidget = async (roles: AppRole[], widget: Omit<KpiWidget, "id"> & { id?: string }) => {
  requireRole(roles, ["admin", "director"], "manage KPI widgets");
  const { error } = await db.from("kpi_widgets").upsert(widget, { onConflict: "name" });
  if (error) throw error;
};

export const deleteKpiWidget = async (roles: AppRole[], id: string) => {
  requireRole(roles, ["admin", "director"], "manage KPI widgets");
  const { error } = await db.from("kpi_widgets").delete().eq("id", id);
  if (error) throw error;
};

export const evaluateFormulaFromRow = (expression: string, row: Record<string, number>) => evaluateSafeExpression(expression, row);

export const aggregateSubmissionSums = (rows: Array<Pick<BedSubmission, "total_beds" | "occupied" | "closed">>) =>
  rows.reduce<{ total_beds: number; occupied: number; closed: number; vacant: number }>(
    (acc, row) => ({
      total_beds: acc.total_beds + (Number(row.total_beds) || 0),
      occupied: acc.occupied + (Number(row.occupied) || 0),
      closed: acc.closed + (Number(row.closed) || 0),
      vacant: acc.vacant + Math.max((Number(row.total_beds) || 0) - (Number(row.occupied) || 0) - (Number(row.closed) || 0), 0),
    }),
    { total_beds: 0, occupied: 0, closed: 0, vacant: 0 },
  );

export const uploadDocument = async (userId: string, file: File) => {
  if (!validateFileType(file)) {
    throw new Error("Unsupported file type. Allowed: .csv, .xlsx, .pdf, .doc, .png, .jpg");
  }

  let finalFile = file;
  if (file.type.startsWith("image/")) {
    finalFile = await compressImageIfNeeded(file);
  }

  if (finalFile.size > MAX_UPLOAD_SIZE) {
    throw new Error("File must be 2MB or less after compression.");
  }

  const path = `${userId}/${Date.now()}-${finalFile.name}`;
  const { error } = await supabase.storage.from("documents").upload(path, finalFile, {
    upsert: false,
    contentType: finalFile.type,
  });
  if (error) throw error;
  return path;
};

// ====== User Entry Permissions ======

const DEFAULT_PERMISSIONS = { can_add: true, can_edit: true, can_delete: false };

export const fetchAllUserEntryPermissions = async (): Promise<Record<string, UserEntryPermissions>> => {
  const { data, error } = await db
    .from("user_entry_permissions")
    .select("user_id,can_add,can_edit,can_delete");
  if (error) throw error;
  const map: Record<string, UserEntryPermissions> = {};
  (data ?? []).forEach((row: UserEntryPermissions) => {
    map[row.user_id] = row;
  });
  return map;
};

export const fetchUserEntryPermissions = async (userId: string): Promise<UserEntryPermissions> => {
  const { data, error } = await db
    .from("user_entry_permissions")
    .select("user_id,can_add,can_edit,can_delete")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && isMissingSchemaTable(error)) return { user_id: userId, ...DEFAULT_PERMISSIONS };
  if (error) throw error;
  if (!data) return { user_id: userId, ...DEFAULT_PERMISSIONS };
  return data as UserEntryPermissions;
};

export const saveUserEntryPermissions = async (
  roles: AppRole[],
  payload: UserEntryPermissions,
  actingUserId: string,
) => {
  requireRole(roles, ["admin"], "manage user permissions");
  const { error } = await db.from("user_entry_permissions").upsert(
    {
      user_id: payload.user_id,
      can_add: payload.can_add,
      can_edit: payload.can_edit,
      can_delete: payload.can_delete,
      updated_at: new Date().toISOString(),
      updated_by: actingUserId,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
};

// ====== Audit Logs ======

export const writeAuditLog = async (entry: {
  action: AuditAction;
  record_id?: string | null;
  user_id: string;
  user_name: string | null;
  department_name?: string | null;
  record_date?: string | null;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
}) => {
  const payload: AuditLogEntry = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    action: entry.action,
    table_name: "bed_submissions",
    record_id: entry.record_id ?? null,
    user_id: entry.user_id,
    user_name: entry.user_name,
    department_name: entry.department_name ?? null,
    record_date: entry.record_date ?? null,
    changes: entry.changes ?? {},
    created_at: new Date().toISOString(),
  };

  const storeFallbackLog = async () => {
    try {
      const { error } = await supabase.functions.invoke("audit-log-fallback", {
        body: { entry: payload },
      });
      if (!error) return;
      console.warn("[audit] Persistent fallback unavailable, using local fallback:", error.message);
    } catch (functionError) {
      console.warn("[audit] Persistent fallback unavailable, using local fallback:", functionError);
    }

    try {
      if (typeof localStorage === "undefined") return;
      const existing = JSON.parse(localStorage.getItem(AUDIT_LOG_FALLBACK_KEY) ?? "[]") as AuditLogEntry[];
      const next = [payload, ...existing]
        .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
        .slice(0, 500);
      localStorage.setItem(AUDIT_LOG_FALLBACK_KEY, JSON.stringify(next));
    } catch (storageError) {
      console.warn("[audit] Unable to store local fallback log:", storageError);
    }
  };

  // Audit logging must never block the underlying user action. If the live
  // audit_logs table is missing/unavailable, keep a browser-local fallback so
  // EDIT and DELETE actions still appear on the Audit Log page immediately.
  try {
    if (entry.record_id) {
      const recentWindow = new Date(Date.now() - 15_000).toISOString();
      const changesJson = JSON.stringify(entry.changes ?? {});
      const { data: existing, error: lookupError } = await db
        .from("audit_logs")
        .select("id,changes")
        .eq("action", entry.action)
        .eq("record_id", entry.record_id)
        .gte("created_at", recentWindow)
        .limit(1);

      if (lookupError) {
        if (isAuditStorageUnavailable(lookupError)) {
          await storeFallbackLog();
          console.warn("[audit] audit_logs unavailable, stored fallback log:", lookupError.message);
          return;
        }
        throw lookupError;
      }
      if ((existing ?? []).some((row: { changes?: unknown }) => JSON.stringify(row.changes ?? {}) === changesJson)) return;
    }

    const insertPayload = {
      action: payload.action,
      table_name: payload.table_name,
      record_id: payload.record_id,
      user_id: payload.user_id,
      user_name: payload.user_name,
      department_name: payload.department_name,
      record_date: payload.record_date,
      changes: payload.changes,
    };
    const { error } = await db.from("audit_logs").insert(insertPayload);
    if (error) {
      if (isAuditStorageUnavailable(error)) {
        await storeFallbackLog();
        console.warn("[audit] audit_logs unavailable, stored fallback log:", error.message);
        return;
      }
      throw error;
    }
  } catch (err) {
    if (isAuditStorageUnavailable(err)) {
      await storeFallbackLog();
      console.warn("[audit] audit_logs unavailable, stored fallback log");
      return;
    }
    throw err;
  }
};

const fetchGeneratedAuditLogsFromSubmissions = async (limit: number): Promise<AuditLogEntry[]> => {
  const [{ data: submissions, error: submissionsError }, { data: departments }, { data: profiles }] = await Promise.all([
    db.from("bed_submissions").select("*").order("updated_at", { ascending: false }).limit(limit),
    db.from("departments").select("id,name"),
    db.from("profiles").select("user_id,display_name"),
  ]);

  if (submissionsError) throw submissionsError;

  const departmentMap = new Map<string, string>((departments ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));
  const profileMap = new Map<string, string | null>((profiles ?? []).map((p: { user_id: string; display_name: string | null }) => [p.user_id, p.display_name]));

  return ((submissions ?? []) as BedSubmission[]).map((row) => ({
    id: `generated-${row.id}`,
    action: "ADD",
    table_name: "bed_submissions",
    record_id: row.id,
    user_id: row.updated_by ?? row.submitted_by ?? null,
    user_name: profileMap.get(row.updated_by ?? row.submitted_by) ?? "Unknown",
    department_name: departmentMap.get(row.department_id) ?? null,
    record_date: row.submitted_on,
    changes: diffBedSubmission(null, row),
    created_at: row.updated_at ?? row.created_at,
  }));
};

const fetchPersistentFallbackAuditLogs = async (limit: number): Promise<AuditLogEntry[]> => {
  const { data, error } = await db
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", AUDIT_LOG_FALLBACK_KEY)
    .maybeSingle();
  if (error) {
    console.warn("[audit] Unable to read persistent fallback logs:", error.message);
    return [];
  }
  const logs = Array.isArray(data?.setting_value) ? data.setting_value as AuditLogEntry[] : [];
  return logs.slice(0, limit);
};

const fetchFallbackAuditLogs = (): AuditLogEntry[] => {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(AUDIT_LOG_FALLBACK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as AuditLogEntry[] : [];
  } catch {
    return [];
  }
};

export const fetchAuditLogs = async (limit = 500): Promise<AuditLogEntry[]> => {
  const mergeWithFallback = async (logs: AuditLogEntry[], includeGeneratedAdds: boolean) => {
    const persistentFallback = await fetchPersistentFallbackAuditLogs(limit);
    const generated = includeGeneratedAdds ? await fetchGeneratedAuditLogsFromSubmissions(limit) : [];
    const merged = [...fetchFallbackAuditLogs(), ...persistentFallback, ...logs, ...generated]
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged.slice(0, limit);
  };

  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error && isMissingSchemaTable(error)) return mergeWithFallback([], true);
  if (error) throw error;
  const logs = (data ?? []) as AuditLogEntry[];
  return mergeWithFallback(logs, logs.length === 0);
};

/**
 * Compute a diff of changed fields between two bed_submission shapes.
 * Only includes keys whose values differ.
 */
export const diffBedSubmission = (
  before: Partial<BedSubmission> | null,
  after: Partial<BedSubmission>,
): Record<string, { from?: unknown; to?: unknown }> => {
  const trackedKeys: Array<keyof BedSubmission> = [
    "department_id",
    "bed_type_id",
    "total_beds",
    "occupied",
    "closed",
    "closure_reason",
    "submitted_on",
  ];
  const diff: Record<string, { from?: unknown; to?: unknown }> = {};
  trackedKeys.forEach((key) => {
    const a = before ? (before as Record<string, unknown>)[key as string] : undefined;
    const b = (after as Record<string, unknown>)[key as string];
    if (a !== b) diff[key as string] = { from: a, to: b };
  });
  // Custom fields shallow diff
  const beforeCustom = (before?.custom_fields ?? {}) as Record<string, unknown>;
  const afterCustom = (after.custom_fields ?? {}) as Record<string, unknown>;
  const allCustomKeys = new Set([...Object.keys(beforeCustom), ...Object.keys(afterCustom)]);
  allCustomKeys.forEach((key) => {
    if (beforeCustom[key] !== afterCustom[key]) {
      diff[`custom.${key}`] = { from: beforeCustom[key], to: afterCustom[key] };
    }
  });
  return diff;
};

export const fetchBedSubmissionById = async (id: string): Promise<BedSubmission | null> => {
  const { data, error } = await db.from("bed_submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as BedSubmission) ?? null;
};
