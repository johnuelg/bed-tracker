import type { AppRole, NavRole, SystemRole } from "@/types/hospital";

export const roleRank: Record<SystemRole, number> = {
  admin: 5,
  director: 4,
  doctor: 3,
  nurse: 2,
  staff: 1,
};

export const hasAnyRole = (roles: AppRole[], allowed: AppRole[]) =>
  roles.some((role) => allowed.includes(role));

export const canManageSystem = (roles: AppRole[]) => hasAnyRole(roles, ["admin", "director"]);

export const canManageUsers = (roles: AppRole[]) => hasAnyRole(roles, ["admin"]);

export const getPrimaryNavRole = (roles: AppRole[]): NavRole | null => {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("director")) return "director";
  if (roles.includes("doctor")) return "doctor";
  if (roles.includes("nurse")) return "nurse";
  if (roles.includes("staff")) return "staff";
  return null;
};

export const getPrimaryRole = (roles: AppRole[]): AppRole | null => {
  if (roles.length === 0) return null;
  if (roles.includes("admin")) return "admin";
  if (roles.includes("director")) return "director";
  if (roles.includes("doctor")) return "doctor";
  if (roles.includes("nurse")) return "nurse";
  if (roles.includes("staff")) return "staff";
  return roles[0] ?? null;
};
