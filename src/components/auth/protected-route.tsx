import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

export const ProtectedRoute = () => {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen w-full">
        <aside className="hidden h-screen w-64 border-r border-border/70 bg-sidebar/30 p-4 md:block">
          <Skeleton className="mb-4 h-10 w-full" />
          <Skeleton className="mb-2 h-8 w-full" />
          <Skeleton className="mb-2 h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-4">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-5 w-40" />
          </header>
          <main className="space-y-3 p-3 sm:p-4 lg:p-8">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-28 w-full" />
          </main>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};
