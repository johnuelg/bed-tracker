import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { hasAnyRole } from "@/lib/rbac";
import type { AppRole } from "@/types/hospital";
import { Skeleton } from "@/components/ui/skeleton";

export const RoleGuard = ({ allow }: { allow: AppRole[] }) => {
  const { loading, profileLoading, roles } = useAuth();

  if (loading || profileLoading) {
    return (
      <div className="space-y-3 p-3 sm:p-4 lg:p-8">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!hasAnyRole(roles, allow)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
