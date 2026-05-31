import { Label } from "@/components/ui/label";
import type { NavVisibilitySettings, RoleMenuVisibility } from "@/types/hospital";
import { Check } from "lucide-react";

type Props = {
  settings: NavVisibilitySettings;
  roles: string[];
  disabled?: boolean;
  showHeader?: boolean;
  onChange: (next: NavVisibilitySettings) => void;
};

const defaultRoleVisibility: RoleMenuVisibility = {
  dashboard: false,
  data_entry: false,
  kpi_builder: false,
  categories: false,
  form_builder: false,
  users: false,
  data_table: false,
  audit_log: false,
  bed_map: false,
  reports_analytics: false,
};

const settingRows: Array<{ key: keyof RoleMenuVisibility; label: string; description: string }> = [
  { key: "dashboard", label: "Dashboard", description: "Show or hide Dashboard in the sidebar menu." },
  { key: "data_entry", label: "Bed Entry", description: "Show or hide Bed Entry in the sidebar menu." },
  { key: "data_table", label: "Data Table", description: "Show or hide Data Table in the sidebar menu." },
  { key: "bed_map", label: "Bed Map", description: "Show or hide Bed Map in the sidebar menu." },
  { key: "reports_analytics", label: "Reports & Analytics", description: "Show or hide Reports & Analytics in the sidebar menu." },
  { key: "kpi_builder", label: "KPI Builder", description: "Show or hide KPI Builder in the sidebar menu." },
  { key: "categories", label: "Categories", description: "Show or hide Categories in the sidebar menu." },
  { key: "form_builder", label: "Form Builder", description: "Show or hide Form Builder in the sidebar menu." },
  { key: "users", label: "Users", description: "Show or hide Users in the sidebar menu." },
  { key: "audit_log", label: "Audit Log", description: "Show or hide Audit Log in the sidebar menu (admin only)." },
];

export const NavVisibilitySettingsEditor = ({ settings, roles, disabled, onChange, showHeader = true }: Props) => {
  const roleRows = Array.from(
    new Set(roles.map((role) => role.trim()).filter(Boolean)),
  );

  const columns = roleRows.length > 0 ? roleRows : ["admin"];

  return (
    <div className="space-y-4">
    {showHeader ? (
      <div>
        <h3 className="text-2xl font-bold">Navigation Permissions</h3>
        <p className="text-sm text-muted-foreground">Control which navigation menu items each role can access</p>
      </div>
    ) : null}

    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[720px] border-collapse text-sm sm:min-w-[980px]">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-3 text-left text-sm font-semibold text-muted-foreground sm:px-4 sm:py-4 sm:text-base">Navigation Item</th>
            {columns.map((role) => (
              <th key={role} className="px-3 py-3 text-left text-sm font-semibold capitalize sm:px-4 sm:py-4 sm:text-base">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settingRows.map((row) => (
            <tr key={row.key} className="border-b last:border-b-0">
              <td className="px-3 py-4 align-middle sm:px-4 sm:py-5">
                <div className="space-y-1">
                  <Label className="text-base font-semibold text-foreground sm:text-xl">{row.label}</Label>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
              </td>
              {columns.map((role) => (
                <td key={`${row.key}-${role}`} className="px-3 py-4 align-middle sm:px-4 sm:py-5">
                  <div className="flex items-center justify-start">
                    {(() => {
                      const roleSettings = settings[role] ?? defaultRoleVisibility;
                      return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={roleSettings[row.key]}
                      aria-label={`Toggle ${row.label} menu for ${role}`}
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...settings,
                          [role]: {
                            ...roleSettings,
                            [row.key]: !roleSettings[row.key],
                          },
                        })
                      }
                      className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                        roleSettings[row.key]
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground/40"
                      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/70"}`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                      );
                    })()}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
};