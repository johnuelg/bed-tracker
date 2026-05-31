import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, History, Search, X, CalendarIcon, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { fetchAuditLogs, fetchDepartments } from "@/lib/supabase-api";
import { useAuth } from "@/hooks/use-auth";
import {
  formatSaudiDateTime,
  formatSaudiIsoDateForDisplay,
  calendarDateToIsoDate,
  getSaudiIsoDate,
} from "@/lib/date-time";
import type { AuditAction, AuditLogEntry } from "@/types/hospital";
import { cn } from "@/lib/utils";

const actionMeta: Record<AuditAction, { label: string; Icon: typeof Plus; className: string; badge: string }> = {
  ADD: {
    label: "ADD",
    Icon: Plus,
    className: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  EDIT: {
    label: "EDIT",
    Icon: Pencil,
    className: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  DELETE: {
    label: "DELETE",
    Icon: Trash2,
    className: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
};

const formatChange = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const friendlyKey = (key: string) =>
  key
    .replace(/^custom\./, "")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const renderChanges = (entry: AuditLogEntry, departmentMap: Map<string, string>) => {
  const keys = Object.keys(entry.changes ?? {});
  if (keys.length === 0) return "—";
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {keys.map((key) => {
        const change = entry.changes[key] ?? {};
        const isDeptId = key === "department_id";
        const fromVal = isDeptId ? departmentMap.get(String(change.from)) ?? change.from : change.from;
        const toVal = isDeptId ? departmentMap.get(String(change.to)) ?? change.to : change.to;
        return (
          <span key={key} className="rounded bg-muted px-2 py-0.5">
            <span className="font-medium">{friendlyKey(key)}:</span>{" "}
            <span className="text-muted-foreground">{formatChange(key, fromVal)}</span>
            <span className="mx-1">→</span>
            <span>{formatChange(key, toVal)}</span>
          </span>
        );
      })}
    </div>
  );
};

const AuditLogPage = () => {
  const { loading: authLoading, user } = useAuth();
  const { data: logs = [], isLoading, isError, error } = useQuery({
    queryKey: ["audit_logs", user?.id ?? "anon"],
    queryFn: () => fetchAuditLogs(500),
    enabled: !authLoading && Boolean(user?.id),
    retry: 1,
  });
  const { data: departments = [] } = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const filteredLogs = useMemo(() => {
    const fromIso = dateRange?.from ? calendarDateToIsoDate(dateRange.from) : null;
    const toIso = dateRange?.to
      ? calendarDateToIsoDate(dateRange.to)
      : dateRange?.from
        ? calendarDateToIsoDate(dateRange.from)
        : null;
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (actionFilter !== "all" && entry.action !== actionFilter) return false;
      if (deptFilter !== "all" && entry.department_name !== deptFilter) return false;
      if (fromIso || toIso) {
        const entryIso = entry.created_at ? getSaudiIsoDate(new Date(entry.created_at)) : null;
        if (!entryIso) return false;
        if (fromIso && entryIso < fromIso) return false;
        if (toIso && entryIso > toIso) return false;
      }
      if (q) {
        const hay = [
          entry.user_name,
          entry.department_name,
          entry.action,
          entry.record_date,
          JSON.stringify(entry.changes ?? {}),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, deptFilter, dateRange]);

  const hasActiveFilters =
    Boolean(search) || actionFilter !== "all" || deptFilter !== "all" || Boolean(dateRange?.from);
  const clearFilters = () => {
    setSearch("");
    setActionFilter("all");
    setDeptFilter("all");
    setDateRange(undefined);
  };

  const departmentNames = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.department_name && set.add(l.department_name));
    return Array.from(set).sort();
  }, [logs]);

  const formattedRangeLabel = dateRange?.from
    ? `${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.from), { year: "numeric", month: "short", day: "numeric" })}${dateRange.to ? ` – ${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.to), { year: "numeric", month: "short", day: "numeric" })}` : ""}`
    : "Pick date range";

  const exportToCsv = () => {
    const escape = (val: unknown) => {
      const s = val === null || val === undefined ? "" : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const formatChangesForCsv = (entry: AuditLogEntry) => {
      const keys = Object.keys(entry.changes ?? {});
      return keys
        .map((key) => {
          const change = entry.changes[key] ?? {};
          const isDeptId = key === "department_id";
          const fromVal = isDeptId ? departmentMap.get(String(change.from)) ?? change.from : change.from;
          const toVal = isDeptId ? departmentMap.get(String(change.to)) ?? change.to : change.to;
          return `${friendlyKey(key)}: ${formatChange(key, fromVal)} -> ${formatChange(key, toVal)}`;
        })
        .join(" | ");
    };
    const header = ["Timestamp (Asia/Riyadh)", "User Name", "Action", "Department", "Date of Record", "Changes"];
    const rows = filteredLogs.map((entry) => {
      const timestampLabel = entry.created_at
        ? `${formatSaudiDateTime(new Date(entry.created_at), { year: "numeric", month: "short", day: "numeric" })}, ${formatSaudiDateTime(new Date(entry.created_at), { hour: "2-digit", minute: "2-digit", hour12: true })}`
        : "";
      const recordDateLabel = entry.record_date
        ? formatSaudiIsoDateForDisplay(entry.record_date, { year: "numeric", month: "short", day: "numeric" })
        : "";
      return [
        timestampLabel,
        entry.user_name ?? "Unknown",
        entry.action,
        entry.department_name ?? "",
        recordDateLabel,
        formatChangesForCsv(entry),
      ]
        .map(escape)
        .join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${getSaudiIsoDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Full history of every Add, Edit, and Delete action on bed entries.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Timezone: Asia/Riyadh</Badge>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              Tamper-proof
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            {filteredLogs.length} of {logs.length} {logs.length === 1 ? "entry" : "entries"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={filteredLogs.length === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
          <CardDescription>Most recent actions appear first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user, department, changes…"
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as typeof actionFilter)}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="ADD">Add</SelectItem>
                <SelectItem value="EDIT">Edit</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departmentNames.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateRange?.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formattedRangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          {hasActiveFilters && (
            <div className="mb-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear filters
              </Button>
            </div>
          )}

          {authLoading || isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Audit log table is not available yet.</p>
              <p className="mt-1 text-muted-foreground">
                The live database returned: {error instanceof Error ? error.message : "Unable to load audit logs."}
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {logs.length === 0 ? "No audit entries yet." : "No entries match the current filters."}
            </p>
          ) : (
            <>
              {/* Mobile card list (<640px) */}
              <div className="sm:hidden max-h-[70vh] overflow-auto space-y-3 pr-1">
                {filteredLogs.map((entry) => {
                  const meta = actionMeta[entry.action];
                  const timestampLabel = entry.created_at
                    ? `${formatSaudiDateTime(new Date(entry.created_at), { year: "numeric", month: "short", day: "numeric" })}, ${formatSaudiDateTime(new Date(entry.created_at), { hour: "2-digit", minute: "2-digit", hour12: true })}`
                    : "—";
                  const recordDateLabel = entry.record_date
                    ? formatSaudiIsoDateForDisplay(entry.record_date, { year: "numeric", month: "short", day: "numeric" })
                    : "—";
                  return (
                    <div key={entry.id} className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{entry.department_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">{timestampLabel}</div>
                        </div>
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0", meta.badge)}>
                          <meta.Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">User</div>
                          <div className="font-medium truncate">{entry.user_name ?? "Unknown"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Record date</div>
                          <div className="font-medium">{recordDateLabel}</div>
                        </div>
                      </div>
                      <div className="mt-2 border-t pt-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Changes</div>
                        {renderChanges(entry, departmentMap)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet/Desktop table (≥640px) with independent vertical scroll */}
              <div className="hidden sm:block rounded-lg border bg-card">
                <div className="max-h-[65vh] w-full overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                      <tr className="[&>th]:h-11 [&>th]:px-3 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground">
                        <th className="whitespace-nowrap">Timestamp</th>
                        <th className="hidden md:table-cell">User</th>
                        <th>Action</th>
                        <th className="hidden lg:table-cell">Department</th>
                        <th className="hidden xl:table-cell whitespace-nowrap">Date of Record</th>
                        <th>Changes</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr]:border-b [&>tr:last-child]:border-0">
                      {filteredLogs.map((entry, idx) => {
                        const meta = actionMeta[entry.action];
                        const timestampLabel = entry.created_at
                          ? `${formatSaudiDateTime(new Date(entry.created_at), { year: "numeric", month: "short", day: "numeric" })}, ${formatSaudiDateTime(new Date(entry.created_at), { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "—";
                        const recordDateLabel = entry.record_date
                          ? formatSaudiIsoDateForDisplay(entry.record_date, { year: "numeric", month: "short", day: "numeric" })
                          : "—";
                        return (
                          <tr
                            key={entry.id}
                            className={cn(
                              "transition-colors hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2.5 [&>td]:align-top",
                              idx % 2 === 1 && "bg-muted/20",
                            )}
                          >
                            <td className="whitespace-nowrap">
                              {timestampLabel}
                              <div className="md:hidden text-xs text-muted-foreground">{entry.user_name ?? "Unknown"}</div>
                            </td>
                            <td className="hidden md:table-cell">{entry.user_name ?? "Unknown"}</td>
                            <td>
                              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold", meta.badge)}>
                                <meta.Icon className="h-3.5 w-3.5" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="hidden lg:table-cell">{entry.department_name ?? "—"}</td>
                            <td className="hidden xl:table-cell whitespace-nowrap">{recordDateLabel}</td>
                            <td className="min-w-[200px]">{renderChanges(entry, departmentMap)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default AuditLogPage;