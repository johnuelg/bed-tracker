import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  createUserByAdmin,
  deactivateUserByAdmin,
  fetchNavVisibilitySettings,
  fetchProfiles,
  fetchRoleCatalog,
  fetchUserEmails,
  fetchUserRoles,
  saveNavVisibilitySettings,
  saveRoleCatalog,
  setUserRole,
  updateUserByAdmin,
} from "@/lib/supabase-api";
import { NavVisibilitySettingsEditor } from "@/components/settings/nav-visibility-settings";
import type { AppRole, NavVisibilitySettings } from "@/types/hospital";

const defaultNavSettings: NavVisibilitySettings = {
  admin: { dashboard: true, data_entry: true, kpi_builder: true, categories: true, form_builder: true, users: true },
  director: { dashboard: true, data_entry: true, kpi_builder: true, categories: true, form_builder: true, users: true },
  doctor: { dashboard: true, data_entry: true, kpi_builder: true, categories: true, form_builder: true, users: true },
  nurse: { dashboard: true, data_entry: true, kpi_builder: true, categories: true, form_builder: true, users: true },
  staff: { dashboard: true, data_entry: true, kpi_builder: true, categories: true, form_builder: true, users: true },
};

const UsersPage = () => {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "admin" as AppRole });
  const [newRoleName, setNewRoleName] = useState("");
  const [editTarget, setEditTarget] = useState<null | {
    user_id: string;
    email: string;
    display_name: string;
    role: AppRole;
  }>(null);
  const [editForm, setEditForm] = useState({ email: "", display_name: "", password: "", role: "" as AppRole });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);

  const isAdmin = roles.includes("admin");

  const { data: profiles = [] } = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const { data: roleMap = {} } = useQuery({ queryKey: ["user_roles"], queryFn: () => fetchUserRoles() });
  const { data: roleCatalog = ["admin"] } = useQuery({
    queryKey: ["app_settings", "role_catalog"],
    queryFn: fetchRoleCatalog,
  });
  const { data: navVisibility = defaultNavSettings } = useQuery({
    queryKey: ["app_settings", "nav_visibility"],
    queryFn: fetchNavVisibilitySettings,
  });
  const { data: emailMap = {} } = useQuery({
    queryKey: ["user_emails"],
    queryFn: () => fetchUserEmails(roles),
    enabled: isAdmin,
  });
  useEffect(() => {
    if (!roleCatalog.length) return;
    if (!roleCatalog.includes(form.role)) {
      setForm((prev) => ({ ...prev, role: roleCatalog[0] }));
    }
  }, [roleCatalog, form.role]);

  const users = useMemo(
    () =>
      profiles.map((profile) => ({
        ...profile,
        role: roleMap[profile.user_id]?.[0] ?? "staff",
        email: emailMap[profile.user_id] ?? "",
      })),
    [profiles, roleMap, emailMap],
  );

  const roleOptions = useMemo(
    () => Array.from(new Set([...(roleCatalog ?? []), ...users.map((u) => u.role)])),
    [roleCatalog, users],
  );

  const createMutation = useMutation({
    mutationFn: () => createUserByAdmin(roles, form),
    onSuccess: async () => {
      toast({ title: "User created" });
      setForm({ email: "", password: "", display_name: "", role: roleCatalog[0] ?? "admin" });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["user_roles"] });
    },
    onError: (error) => toast({ title: "Create failed", description: (error as Error).message, variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) => setUserRole(roles, userId, role),
    onSuccess: async () => {
      toast({ title: "Role updated" });
      await queryClient.invalidateQueries({ queryKey: ["user_roles"] });
    },
    onError: (error) => toast({ title: "Role update failed", description: (error as Error).message, variant: "destructive" }),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => deactivateUserByAdmin(roles, userId, active),
    onSuccess: async () => {
      toast({ title: "User status updated" });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (error) => toast({ title: "Status update failed", description: (error as Error).message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { user_id: string; email?: string; password?: string; display_name?: string; role?: AppRole }) =>
      updateUserByAdmin(roles, payload),
    onSuccess: async () => {
      toast({ title: "User updated" });
      setEditTarget(null);
      setConfirmEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      await queryClient.invalidateQueries({ queryKey: ["user_emails"] });
    },
    onError: (error) => toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" }),
  });

  const settingsMutation = useMutation({
    mutationFn: (settings: NavVisibilitySettings) => {
      if (!user?.id) throw new Error("You must be signed in to save settings.");
      return saveNavVisibilitySettings(roles, settings, user.id);
    },
    onSuccess: async () => {
      toast({ title: "Menu settings saved" });
      await queryClient.invalidateQueries({ queryKey: ["app_settings", "nav_visibility"] });
    },
    onError: (error) => toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" }),
  });

  const roleCatalogMutation = useMutation({
    mutationFn: (nextCatalog: AppRole[]) => {
      if (!user?.id) throw new Error("You must be signed in to save roles.");
      return saveRoleCatalog(roles, nextCatalog, user.id);
    },
    onSuccess: async () => {
      toast({ title: "Roles updated" });
      await queryClient.invalidateQueries({ queryKey: ["app_settings", "role_catalog"] });
    },
    onError: (error) => toast({ title: "Roles save failed", description: (error as Error).message, variant: "destructive" }),
  });

  const addRole = () => {
    const normalized = newRoleName.trim();
    if (!normalized) return;
    if (roleCatalog.includes(normalized)) {
      toast({ title: "Role already exists", variant: "destructive" });
      return;
    }
    void roleCatalogMutation.mutate([...roleCatalog, normalized]);
    setNewRoleName("");
  };

  const moveRole = (role: AppRole, direction: "up" | "down") => {
    const index = roleCatalog.findIndex((entry) => entry === role);
    if (index === -1) return;

    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= roleCatalog.length) return;

    const nextCatalog = [...roleCatalog];
    [nextCatalog[index], nextCatalog[nextIndex]] = [nextCatalog[nextIndex], nextCatalog[index]];
    void roleCatalogMutation.mutate(nextCatalog);
  };

  const removeRole = (roleToRemove: AppRole) => {
    if (roleToRemove === "admin") {
      toast({ title: "Admin role cannot be removed", variant: "destructive" });
      return;
    }
    const next = roleCatalog.filter((role) => role !== roleToRemove);
    void roleCatalogMutation.mutate(next);
  };

  return (
    <section className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">User Management</h1>
        <p className="text-sm text-muted-foreground">Admin-only user CRUD and secure role assignment.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Roles Management</CardTitle>
          <CardDescription>Add custom roles that become selectable in Create User.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <Input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Data Collector"
              disabled={roleCatalogMutation.isPending}
            />
            <Button type="button" onClick={addRole} disabled={roleCatalogMutation.isPending || !newRoleName.trim()}>
              Add Role
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {roleCatalog.map((role, index) => (
              <div key={role} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <span>{role}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => moveRole(role, "up")}
                  disabled={roleCatalogMutation.isPending || index === 0}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => moveRole(role, "down")}
                  disabled={roleCatalogMutation.isPending || index === roleCatalog.length - 1}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => removeRole(role)}
                  disabled={roleCatalogMutation.isPending || role === "admin"}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create User</CardTitle>
          <CardDescription>No public signup is enabled; create users here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Temporary Password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(value) => setForm((p) => ({ ...p, role: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Create User
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menu Visibility Settings</CardTitle>
          <CardDescription>Control all dashboard sidebar menus by role from here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NavVisibilitySettingsEditor
            settings={navVisibility}
            roles={roleOptions}
            showHeader={false}
            disabled={settingsMutation.isPending}
            onChange={(next) => {
              queryClient.setQueryData(["app_settings", "nav_visibility"], next);
            }}
          />
          <Button onClick={() => settingsMutation.mutate(navVisibility)} disabled={settingsMutation.isPending}>
            Save Menu Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((row) => {
                const isSelf = row.user_id === user?.id;
                return (
                <TableRow key={row.id}>
                  <TableCell>{row.display_name ?? "Unnamed"}{isSelf ? " (You)" : ""}</TableCell>
                  <TableCell className="font-mono text-xs sm:text-sm break-all">
                    {row.email || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.role}
                      onValueChange={(value) => roleMutation.mutate({ userId: row.user_id, role: value })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditTarget({
                            user_id: row.user_id,
                            email: row.email,
                            display_name: row.display_name ?? "",
                            role: row.role,
                          });
                          setEditForm({
                            email: row.email,
                            display_name: row.display_name ?? "",
                            password: "",
                            role: row.role,
                          });
                          setEditErrors({});
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={row.is_active ? "destructive" : "secondary"}
                        disabled={isSelf}
                        title={isSelf ? "You cannot deactivate your own account" : undefined}
                        onClick={() => {
                          if (isSelf) {
                            toast({
                              title: "Action blocked",
                              description: "You cannot deactivate or delete your own account.",
                              variant: "destructive",
                            });
                            return;
                          }
                          activeMutation.mutate({ userId: row.user_id, active: !row.is_active });
                        }}
                      >
                        {row.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); setEditErrors({}); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update this user's account details. Leave password blank to keep it unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                aria-invalid={!!editErrors.email}
              />
              {editErrors.email && <p className="text-xs text-destructive">{editErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={editForm.display_name}
                onChange={(e) => setEditForm((p) => ({ ...p, display_name: e.target.value }))}
                aria-invalid={!!editErrors.display_name}
              />
              {editErrors.display_name && <p className="text-xs text-destructive">{editErrors.display_name}</p>}
            </div>
            <div className="space-y-2">
              <Label>New Password <span className="text-xs text-muted-foreground">(optional, min 8 chars)</span></Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                aria-invalid={!!editErrors.password}
                autoComplete="new-password"
              />
              {editErrors.password && <p className="text-xs text-destructive">{editErrors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(value) => setEditForm((p) => ({ ...p, role: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditErrors({}); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const schema = z.object({
                  email: z.string().trim().email("Enter a valid email").max(255),
                  display_name: z.string().trim().min(1, "Display name is required").max(100),
                  password: z.union([z.literal(""), z.string().min(8, "Password must be at least 8 characters").max(128)]),
                  role: z.string().trim().min(1, "Role is required"),
                });
                const result = schema.safeParse(editForm);
                if (!result.success) {
                  const errs: Record<string, string> = {};
                  for (const issue of result.error.issues) {
                    const k = issue.path[0] as string;
                    if (k && !errs[k]) errs[k] = issue.message;
                  }
                  setEditErrors(errs);
                  return;
                }
                setEditErrors({});
                setConfirmEditOpen(true);
              }}
              disabled={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm changes</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to update <strong>{editTarget?.display_name || editTarget?.email}</strong>.
              {editForm.password ? " The user's password will be reset." : ""}
              {editForm.email && editTarget && editForm.email !== editTarget.email
                ? " The user's sign-in email will change."
                : ""}
              {" "}Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!editTarget) return;
                const payload: { user_id: string; email?: string; password?: string; display_name?: string; role?: AppRole } = {
                  user_id: editTarget.user_id,
                };
                if (editForm.email && editForm.email !== editTarget.email) payload.email = editForm.email.trim();
                if (editForm.display_name && editForm.display_name !== editTarget.display_name) {
                  payload.display_name = editForm.display_name.trim();
                }
                if (editForm.password) payload.password = editForm.password;
                if (editForm.role && editForm.role !== editTarget.role) payload.role = editForm.role;
                updateMutation.mutate(payload);
              }}
            >
              Yes, save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default UsersPage;
