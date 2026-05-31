import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { hasAnyRole } from "@/lib/rbac";
import type { AppRole } from "@/types/hospital";

export const RoleGuard = ({ allow }: { allow: AppRole[] }) => {
  const { loading, roles } = useAuth();

  if (loading) {
    return null;
  }

  if (!hasAnyRole(roles, allow)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
