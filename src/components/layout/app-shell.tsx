import { useEffect, useState } from "react";
import { BarChart3, BedDouble, ChevronDown, ClipboardList, FileBarChart, FileCog, History, LayoutDashboard, LogOut, MessageSquare, Settings2, Table as TableIcon, Users2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import logo from "@/assets/hospital-logo.png";
import { useAuth } from "@/hooks/use-auth";
import { getPrimaryRole, hasAnyRole } from "@/lib/rbac";
import { fetchNavVisibilitySettings } from "@/lib/supabase-api";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { RoleMenuVisibility } from "@/types/hospital";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  settingKey: keyof RoleMenuVisibility;
  roles?: Array<"admin" | "director" | "doctor" | "nurse" | "staff">;
};

const defaultRoleVisibility: RoleMenuVisibility = {
  dashboard: true,
  data_entry: true,
  data_table: true,
  kpi_builder: true,
  categories: true,
  form_builder: true,
  users: true,
  audit_log: true,
  bed_map: true,
  reports_analytics: true,
  chat_assistant: true,
};

const topLevelNavItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, settingKey: "dashboard" },
  { to: "/data-entry", label: "Bed Entry", icon: ClipboardList, settingKey: "data_entry" },
  { to: "/data-table", label: "Data Table", icon: TableIcon, settingKey: "data_table" },
  { to: "/bed-map", label: "Bed Map", icon: BedDouble, settingKey: "bed_map" },
  { to: "/reports-analytics", label: "Reports & Analytics", icon: FileBarChart, settingKey: "reports_analytics" },
  { to: "/chat-assistant", label: "Chat Assistant", icon: MessageSquare, settingKey: "chat_assistant" },
  { to: "/audit-log", label: "Audit Log", icon: History, settingKey: "audit_log", roles: ["admin"] },
  { to: "/users", label: "Users", icon: Users2, settingKey: "users", roles: ["admin"] },
];

const settingsSubNavItems: NavItem[] = [
  { to: "/kpi-builder", label: "KPI Builder", icon: BarChart3, settingKey: "kpi_builder", roles: ["admin", "director"] },
  { to: "/categories", label: "Categories", icon: Settings2, settingKey: "categories", roles: ["admin"] },
  { to: "/form-builder", label: "Form Builder", icon: FileCog, settingKey: "form_builder", roles: ["admin"] },
];

const SIDEBAR_COOKIE_NAME = "sidebar:state";

const readSidebarCookie = (): boolean => {
  if (typeof document === "undefined") return true;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
  if (!match) return true;
  return match.split("=")[1] !== "false";
};

const AppShellInner = () => {
  const { roles, signOut, profile } = useAuth();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { data: navVisibility } = useQuery({ queryKey: ["app_settings", "nav_visibility"], queryFn: fetchNavVisibilitySettings });

  const primaryRole = getPrimaryRole(roles);
  const savedRoleVisibility = primaryRole ? navVisibility?.[primaryRole] : undefined;
  const roleVisibility: RoleMenuVisibility = { ...defaultRoleVisibility, ...(savedRoleVisibility ?? {}) };
  const visibleTopLevelItems = topLevelNavItems
    .filter((item) => !item.roles || hasAnyRole(roles, item.roles))
    .filter((item) => roleVisibility[item.settingKey]);

  const visibleSettingsItems = settingsSubNavItems
    .filter((item) => !item.roles || hasAnyRole(roles, item.roles))
    .filter((item) => roleVisibility[item.settingKey]);

  const canAccessSettings = hasAnyRole(roles, ["admin"]);
  const settingsVisible = canAccessSettings && (visibleSettingsItems.length > 0 || location.pathname === "/settings");
  const settingsActive =
    location.pathname === "/settings" || visibleSettingsItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  useEffect(() => {
    if (settingsActive) {
      setSettingsOpen(true);
    }
  }, [settingsActive]);

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-3 px-1 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 p-1">
              <img src={logo} alt="Taif Children's Hospital logo" className="h-8 w-8 object-contain" loading="lazy" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/80">Taif Children's Hospital</p>
                <h1 className="truncate text-sm font-bold">Bed Management</h1>
              </div>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleTopLevelItems.map((item) => {
                  const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to} onClick={closeMobile}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

                {settingsVisible ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSettingsOpen((prev) => !prev)}
                      isActive={settingsActive}
                      tooltip="Settings"
                      aria-expanded={settingsOpen}
                    >
                      <Settings2 className="h-4 w-4" />
                      <span className="flex-1 text-left">Settings</span>
                      <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", settingsOpen && "rotate-180")} />
                    </SidebarMenuButton>
                    {settingsOpen && !collapsed ? (
                      <SidebarMenuSub>
                        {visibleSettingsItems.map((item) => {
                          const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                          return (
                            <SidebarMenuSubItem key={item.to}>
                              <SidebarMenuSubButton asChild isActive={active}>
                                <NavLink to={item.to} onClick={closeMobile}>
                                  {item.label}
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          {!collapsed ? (
            <div className="px-1 pb-1">
              <p className="text-xs text-sidebar-foreground/70">Signed in as</p>
              <p className="truncate text-sm font-semibold">{profile?.display_name ?? "Hospital User"}</p>
            </div>
          ) : null}
          <Button
            variant="secondary"
            size={collapsed ? "icon" : "default"}
            className="bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
            onClick={() => {
              closeMobile();
              void signOut();
            }}
            aria-label="Logout"
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            {!collapsed ? "Logout" : null}
          </Button>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="h-9 w-9" aria-label="Toggle sidebar" />
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <img src={logo} alt="Hospital logo" className="h-8 w-8 object-contain" loading="lazy" />
            <p className="truncate text-sm font-bold">Taif Bed Management</p>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="flex-1 p-3 sm:p-4 lg:p-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
};

export const AppShell = () => {
  return (
    <SidebarProvider defaultOpen={readSidebarCookie()}>
      <AppShellInner />
    </SidebarProvider>
  );
};
