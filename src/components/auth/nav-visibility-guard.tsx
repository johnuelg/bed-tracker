import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { fetchNavVisibilitySettings } from "@/lib/supabase-api";
import { getPrimaryRole } from "@/lib/rbac";
import type { RoleMenuVisibility } from "@/types/hospital";

const defaultRoleVisibility: RoleMenuVisibility = {
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
  chat_assistant: true,
};

type NavVisibilityGuardProps = {
  settingKey: keyof RoleMenuVisibility;
};

export const NavVisibilityGuard = ({ settingKey }: NavVisibilityGuardProps) => {
  const { loading, roles } = useAuth();
  const { data: navVisibility } = useQuery({
    queryKey: ["app_settings", "nav_visibility"],
    queryFn: fetchNavVisibilitySettings,
  });

  if (loading) {
    return null;
  }

  const primaryRole = getPrimaryRole(roles);

  if (!primaryRole) {
    return <Outlet />;
  }

  const merged: RoleMenuVisibility = {
    ...defaultRoleVisibility,
    ...(navVisibility?.[primaryRole] || {}),
  };
  const canAccess = merged[settingKey];

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};