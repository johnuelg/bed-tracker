import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { RoleGuard } from "@/components/auth/role-guard";
import { NavVisibilityGuard } from "@/components/auth/nav-visibility-guard";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/ResetPassword";
import DashboardPage from "./pages/Dashboard";
import DataEntryPage from "./pages/DataEntry";
import DataTablePage from "./pages/DataTable";
import BedMapPage from "./pages/BedMap";
import CategoriesPage from "./pages/Categories";
import FormBuilderPage from "./pages/FormBuilder";
import KpiBuilderPage from "./pages/KpiBuilder";
import UsersPage from "./pages/Users";
import SettingsPage from "./pages/Settings";
import AuditLogPage from "./pages/AuditLog";
import ReportsAnalyticsPage from "./pages/ReportsAnalytics";
import ChatAssistantPage from "./pages/ChatAssistant";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route element={<NavVisibilityGuard settingKey="dashboard" />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                </Route>
                <Route element={<NavVisibilityGuard settingKey="data_entry" />}>
                  <Route path="/data-entry" element={<DataEntryPage />} />
                </Route>
                <Route element={<NavVisibilityGuard settingKey="data_table" />}>
                  <Route path="/data-table" element={<DataTablePage />} />
                </Route>
                <Route element={<NavVisibilityGuard settingKey="bed_map" />}>
                  <Route path="/bed-map" element={<BedMapPage />} />
                </Route>
                <Route element={<NavVisibilityGuard settingKey="reports_analytics" />}>
                  <Route path="/reports-analytics" element={<ReportsAnalyticsPage />} />
                </Route>
                <Route element={<NavVisibilityGuard settingKey="chat_assistant" />}>
                  <Route path="/chat-assistant" element={<ChatAssistantPage />} />
                  <Route path="/chat-assistant/:threadId" element={<ChatAssistantPage />} />
                </Route>

                <Route element={<RoleGuard allow={["admin"]} />}>
                  <Route element={<NavVisibilityGuard settingKey="users" />}>
                    <Route path="/users" element={<UsersPage />} />
                  </Route>
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/audit-log" element={<AuditLogPage />} />
                  <Route element={<NavVisibilityGuard settingKey="categories" />}>
                    <Route path="/categories" element={<CategoriesPage />} />
                  </Route>
                  <Route element={<NavVisibilityGuard settingKey="form_builder" />}>
                    <Route path="/form-builder" element={<FormBuilderPage />} />
                  </Route>
                </Route>

                <Route element={<RoleGuard allow={["admin", "director"]} />}>
                  <Route element={<NavVisibilityGuard settingKey="kpi_builder" />}>
                    <Route path="/kpi-builder" element={<KpiBuilderPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
