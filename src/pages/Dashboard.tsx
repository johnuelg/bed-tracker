import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarIcon, RotateCcw, LayoutGrid, Table as TableIcon, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  calendarDateToIsoDate,
  formatSaudiIsoDateForDisplay,
  getSaudiIsoDate,
  getSaudiWeekdayShortFromIsoDate,
  isoDateToCalendarDate,
  formatSaudiDateTime,
  SAUDI_TIMEZONE,
} from "@/lib/date-time";
import { LAST_REFRESH_STORAGE_KEY, markDataRefreshed, readLastRefreshAt } from "@/lib/last-refresh";
import {
  aggregateSubmissionSums,
  fetchDashboardSubmissions,
  fetchDepartments,
  fetchDepartmentTotalBeds,
  fetchKpiFormulas,
  fetchOccupancyBenchmarkSettings,
} from "@/lib/supabase-api";
import { supabase } from "@/integrations/supabase/client";

import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { getStatusIconComponent, getDefaultIconForLabel } from "@/lib/status-icons";
import {
  buildAggregateScope,
  buildRowScope,
  evaluateNamedFormula,
  evaluateOccupancyRate,
} from "@/lib/formula-registry";

const SAUDI_HOLIDAYS: Record<string, string> = {
  "2025-02-22": "Founding Day",
  "2025-09-23": "National Day",
  "2026-02-22": "Founding Day",
  "2026-09-23": "National Day",
  "2027-02-22": "Founding Day",
  "2027-09-23": "National Day",
};

const DashboardPage = () => {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const today = useMemo(() => isoDateToCalendarDate(getSaudiIsoDate()), []);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(today);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");
  const rangeStart = selectedDate ?? today;
  const rangeEnd = selectedDate ?? today;

  const rangeStartIso = useMemo(() => calendarDateToIsoDate(rangeStart), [rangeStart]);
  const rangeEndIso = useMemo(() => calendarDateToIsoDate(rangeEnd), [rangeEnd]);

  const { data: rows = [], dataUpdatedAt } = useQuery({
    queryKey: ["bed_submissions_dashboard"],
    queryFn: fetchDashboardSubmissions,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments,
  });

  const { data: occupancyBenchmark } = useQuery({
    queryKey: ["app_settings", "occupancy_benchmark"],
    queryFn: fetchOccupancyBenchmarkSettings,
  });

  const { data: kpiFormulas = [] } = useQuery({
    queryKey: ["kpi_formulas"],
    queryFn: fetchKpiFormulas,
  });

  const { data: departmentTotalBeds = {} } = useQuery({
    queryKey: ["app_settings", "department_total_beds"],
    queryFn: fetchDepartmentTotalBeds,
  });

  const extractUserInputDateTime = (row: (typeof rows)[number]) => {
    const customFields = (row.custom_fields as Record<string, unknown>) ?? {};

    for (const value of Object.values(customFields)) {
      if (typeof value !== "string") continue;
      const normalized = value.trim();
      const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
      if (match) {
        return { date: match[1], time: match[2] };
      }
    }

    return null;
  };

  const dateFilteredRows = useMemo(() => {
    const dateFrom = rangeStartIso <= rangeEndIso ? rangeStartIso : rangeEndIso;
    const dateTo = rangeStartIso <= rangeEndIso ? rangeEndIso : rangeStartIso;
    return rows.filter((row) => {
      const userDateTime = extractUserInputDateTime(row);
      if (!userDateTime) return false;
      return userDateTime.date >= dateFrom && userDateTime.date <= dateTo;
    });
  }, [rows, rangeStartIso, rangeEndIso]);

  const availableTimes = useMemo(() => {
    const set = new Set<string>();
    dateFilteredRows.forEach((row) => {
      const dt = extractUserInputDateTime(row);
      if (dt?.time) set.add(dt.time);
    });
    return Array.from(set).sort();
  }, [dateFilteredRows]);

  const dateTimeFilteredRows = useMemo(() => {
    if (!selectedTime) return dateFilteredRows;
    return dateFilteredRows.filter((row) => {
      const userDateTime = extractUserInputDateTime(row);
      return userDateTime?.time === selectedTime;
    });
  }, [dateFilteredRows, selectedTime]);

  // Auto-select a valid time when the current selection isn't available
  useEffect(() => {
    if (availableTimes.length === 0) {
      if (selectedTime !== "") setSelectedTime("");
      return;
    }
    if (!availableTimes.includes(selectedTime)) {
      setSelectedTime(availableTimes[availableTimes.length - 1]);
    }
  }, [availableTimes, selectedTime]);

  const departmentOptions = useMemo(() => {
    const availableDepartmentIds = new Set(
      dateTimeFilteredRows.map((row) => row.department_id),
    );

    return departments.filter((department) => availableDepartmentIds.has(department.id));
  }, [dateTimeFilteredRows, departments]);

  useEffect(() => {
    if (selectedDepartmentId !== "all" && !departmentOptions.some((department) => department.id === selectedDepartmentId)) {
      setSelectedDepartmentId("all");
    }
  }, [departmentOptions, selectedDepartmentId]);

  const filteredRows = useMemo(
    () =>
      dateTimeFilteredRows.filter((row) => {
        if (selectedDepartmentId !== "all" && row.department_id !== selectedDepartmentId) return false;
        return true;
      }),
    [dateTimeFilteredRows, selectedDepartmentId],
  );

  const availableDateSet = useMemo(() => {
    const dates = new Set<string>();
    rows.forEach((row) => {
      const value = extractUserInputDateTime(row)?.date;
      if (value) dates.add(value);
    });
    return dates;
  }, [rows]);

  const isSaudiFriday = (value: Date) => {
    const iso = calendarDateToIsoDate(value);
    return getSaudiWeekdayShortFromIsoDate(iso) === "Fri";
  };

  const isSaudiSaturday = (value: Date) => {
    const iso = calendarDateToIsoDate(value);
    return getSaudiWeekdayShortFromIsoDate(iso) === "Sat";
  };

  const hasSaudiHoliday = (value: Date) => {
    const iso = calendarDateToIsoDate(value);
    return Boolean(SAUDI_HOLIDAYS[iso]);
  };

  const isDateDisabled = (value: Date) => {
    if (availableDateSet.size === 0) return true;
    return !availableDateSet.has(calendarDateToIsoDate(value));
  };

  const formattedRangeLabel = formatSaudiIsoDateForDisplay(rangeStartIso, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Within a single (department, submitted_on) bucket, only the latest
  // submission is the source of truth. Older rows for the same date +
  // department are fully discarded — values for fields like medical_ped,
  // iso_nor_pres_ped, iso_ve_pres_ped (and all others) must REPLACE, not
  // accumulate. Rows arrive pre-sorted DESC by updated_at, so the first
  // row we encounter per (department_id, submitted_on) wins.
  const latestPerDeptDateRows = useMemo(() => {
    const seen = new Set<string>();
    const result: typeof filteredRows = [];
    for (const row of filteredRows) {
      const key = `${row.department_id}__${row.submitted_on}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
    return result;
  }, [filteredRows]);

  const sums = aggregateSubmissionSums(latestPerDeptDateRows);
  const readNumberField = (source: Record<string, unknown> | null | undefined, key: string): number => {
    if (!source) return 0;
    const v = (source as Record<string, unknown>)[key];
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  const bedTypeTotals = useMemo(() => {
    const totals = { medical_ped: 0, iso_nor_pres_ped: 0, iso_ve_pres_ped: 0 };
    latestPerDeptDateRows.forEach((row) => {
      const cf = (row.custom_fields as Record<string, unknown>) ?? {};
      totals.medical_ped += readNumberField(cf, "medical_ped");
      totals.iso_nor_pres_ped += readNumberField(cf, "iso_nor_pres_ped");
      totals.iso_ve_pres_ped += readNumberField(cf, "iso_ve_pres_ped");
    });
    return totals;
  }, [latestPerDeptDateRows]);
  const waitingPatients = latestPerDeptDateRows.reduce((total, row) => {
    const customFields = (row.custom_fields as Record<string, unknown>) ?? {};

    const directValue = customFields.waiting_patients ?? customFields.waitingPatients;
    if (typeof directValue === "number") return total + directValue;
    if (typeof directValue === "string") return total + (Number(directValue) || 0);

    const discoveredValue = Object.entries(customFields).find(([key]) =>
      key.toLowerCase().includes("waiting") && key.toLowerCase().includes("patient"),
    )?.[1];

    if (typeof discoveredValue === "number") return total + discoveredValue;
    if (typeof discoveredValue === "string") return total + (Number(discoveredValue) || 0);

    return total;
  }, 0);

  // Assigned total beds come from admin-managed Categories settings, not from
  // submissions. When filtered to a single department, only that department's
  // assigned count contributes; "All departments" sums every active assignment.
  const assignedTotalBeds = useMemo(() => {
    if (selectedDepartmentId !== "all") {
      return Number(departmentTotalBeds[selectedDepartmentId] ?? 0) || 0;
    }
    return departments.reduce(
      (sum, dept) => sum + (Number(departmentTotalBeds[dept.id] ?? 0) || 0),
      0,
    );
  }, [departmentTotalBeds, departments, selectedDepartmentId]);

  const aggregateScope = useMemo(
    () => ({ ...buildAggregateScope(latestPerDeptDateRows), total_beds: assignedTotalBeds }),
    [latestPerDeptDateRows, assignedTotalBeds],
  );
  const occupancyRate = useMemo(
    () => evaluateOccupancyRate(kpiFormulas, aggregateScope),
    [kpiFormulas, aggregateScope],
  );
  // Resolve KPI Builder formulas (when defined) for the headline cards.
  // These fall back to the raw aggregated sums when no matching formula exists.
  const kpiCardValues = useMemo(
    () => ({
      total_beds: assignedTotalBeds,
      occupied: evaluateNamedFormula(kpiFormulas, "Occupied", aggregateScope, sums.occupied),
      closed: evaluateNamedFormula(kpiFormulas, "Closed", aggregateScope, sums.closed),
      vacant: evaluateNamedFormula(kpiFormulas, "Vacant", aggregateScope, sums.vacant),
      waiting_patients: evaluateNamedFormula(kpiFormulas, "Waiting Patients", aggregateScope, waitingPatients),
    }),
    [kpiFormulas, aggregateScope, assignedTotalBeds, sums.occupied, sums.closed, sums.vacant, waitingPatients],
  );
  const benchmarkLevels = occupancyBenchmark?.levels ?? [
    {
      key: "low",
      label: "Low",
      threshold: "< 60%",
      minPercent: null,
      maxPercent: 60,
      minInclusive: false,
      maxInclusive: false,
      color: "#16a34a",
      icon: "thumbs-up",
    },
    {
      key: "optimal",
      label: "Optimal",
      threshold: "60% – 84%",
      minPercent: 60,
      maxPercent: 84,
      minInclusive: true,
      maxInclusive: true,
      color: "#16a34a",
      icon: "check",
    },
    {
      key: "watch",
      label: "Watch",
      threshold: "85% – 89%",
      minPercent: 85,
      maxPercent: 89,
      minInclusive: true,
      maxInclusive: true,
      color: "#f59e0b",
      icon: "eye",
    },
    {
      key: "high",
      label: "High",
      threshold: "≥ 90%",
      minPercent: 90,
      maxPercent: null,
      minInclusive: true,
      maxInclusive: false,
      color: "#dc2626",
      icon: "alert-triangle",
    },
  ];

  const getOccupancyBenchmark = (value: number) =>
    benchmarkLevels.find((level) => {
      const minPass = level.minPercent === null ? true : level.minInclusive ? value >= level.minPercent : value > level.minPercent;
      const maxPass = level.maxPercent === null ? true : level.maxInclusive ? value <= level.maxPercent : value < level.maxPercent;
      return minPass && maxPass;
    }) ?? benchmarkLevels[benchmarkLevels.length - 1];

  const occupancyBenchmarkMatch = getOccupancyBenchmark(occupancyRate);

  // Track the previously selected date+time so we can show a day-over-day
  // (selection-over-selection) delta on the Occupancy Rate KPI card.
  type PrevSelection = { date: string; time: string; rate: number };
  const [previousSelection, setPreviousSelection] = useState<PrevSelection | null>(null);
  const lastAppliedRef = useRef<PrevSelection | null>(null);

  useEffect(() => {
    if (filteredRows.length === 0) return;
    const current: PrevSelection = {
      date: rangeStartIso,
      time: selectedTime || "",
      rate: occupancyRate,
    };
    const last = lastAppliedRef.current;
    if (!last) {
      lastAppliedRef.current = current;
      return;
    }
    if (last.date !== current.date || last.time !== current.time) {
      setPreviousSelection(last);
      lastAppliedRef.current = current;
    } else {
      // same selection, just refresh stored rate
      lastAppliedRef.current = current;
    }
  }, [rangeStartIso, selectedTime, occupancyRate, filteredRows.length]);

  const occupancyDelta = useMemo(() => {
    if (!previousSelection) return null;
    const diff = occupancyRate - previousSelection.rate;
    const base = Math.abs(previousSelection.rate);
    const percentChange = base > 0.0001 ? (diff / base) * 100 : null;
    return { diff, percentChange, previous: previousSelection };
  }, [occupancyRate, previousSelection]);

  const [departmentView, setDepartmentView] = useState<"cards" | "table">("cards");

  const departmentStatusCards = useMemo(() => {
    const latestByDept = new Map<
      string,
      { row: (typeof filteredRows)[number]; date: string; time: string }
    >();

    for (const row of filteredRows) {
      const dt = extractUserInputDateTime(row);
      if (!dt) continue;
      const key = row.department_id;
      if (!key) continue;
      const existing = latestByDept.get(key);
      if (!existing || `${dt.date}T${dt.time}` > `${existing.date}T${existing.time}`) {
        latestByDept.set(key, { row, date: dt.date, time: dt.time });
      }
    }

    return Array.from(latestByDept.entries())
      .map(([deptId, entry]) => {
        const department = departments.find((d) => d.id === deptId);
        // Per-department total beds come from the admin-managed assignment in
        // Categories, not from the submission row. Submission row is still
        // used for occupied/closed/vacant + occupancy rate calculation.
        const assignedTotal = Number(departmentTotalBeds[deptId] ?? 0) || 0;
        const scope = { ...buildRowScope(entry.row), total_beds: assignedTotal };
        const occupiedRaw = Number(entry.row.occupied) || 0;
        const closedRaw = Number(entry.row.closed) || 0;
        const vacantFallback = Math.max(assignedTotal - occupiedRaw - closedRaw, 0);
        const occupied = evaluateNamedFormula(kpiFormulas, "Occupied", scope, occupiedRaw);
        const closed = evaluateNamedFormula(kpiFormulas, "Closed", scope, closedRaw);
        const vacant = evaluateNamedFormula(kpiFormulas, "Vacant", scope, vacantFallback);
        const rate = evaluateOccupancyRate(kpiFormulas, scope);
        const benchmark = getOccupancyBenchmark(rate);
        return {
          id: deptId,
          name: department?.name ?? "Unknown department",
          total: assignedTotal,
          occupied: Math.round(occupied),
          vacant: Math.round(vacant),
          closed: Math.round(closed),
          rate,
          benchmark,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, departments, departmentTotalBeds, kpiFormulas, benchmarkLevels]);

  const isFiltersDefault =
    calendarDateToIsoDate(rangeStart) === calendarDateToIsoDate(today) &&
    calendarDateToIsoDate(rangeEnd) === calendarDateToIsoDate(today) &&
    selectedDepartmentId === "all";

  const handleResetFilters = () => {
    const freshToday = isoDateToCalendarDate(getSaudiIsoDate());
    setSelectedDate(freshToday);
    setSelectedDepartmentId("all");
    void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
  };

  const renderStatusBadge = (level: { key: string; label: string; color: string; icon?: string }) => (
    <StatusBadge level={level} />
  );

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "offline">("connecting");

  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(() => readLastRefreshAt());

  useEffect(() => {
    if (!dataUpdatedAt) return;
    markDataRefreshed(dataUpdatedAt);
    setLastRefreshAt((prev) => (prev && prev >= dataUpdatedAt ? prev : dataUpdatedAt));
  }, [dataUpdatedAt]);

  // Track real-time refreshes of live data queries (Bed Map + Bed Entry Forms + Dashboard).
  // Whenever any of these queries successfully fetches new data, the indicator resets.
  useEffect(() => {
    const LIVE_QUERY_KEYS = new Set([
      "bed_submissions_dashboard",
      "bed_submissions_range",
      "bed_submissions",
      "bed_submissions_today",
    ]);

    const cache = qc.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as { action?: { type?: string } }).action;
      if (!action || action.type !== "success") return;
      const rootKey = event.query.queryKey?.[0];
      if (typeof rootKey !== "string" || !LIVE_QUERY_KEYS.has(rootKey)) return;
      const ts = event.query.state.dataUpdatedAt || Date.now();
      markDataRefreshed(ts);
      setLastRefreshAt((prev) => (prev && prev >= ts ? prev : ts));
    });
    return () => unsubscribe();
  }, [qc]);

  // Sync from other pages/tabs: when Bed Entry forms submit (or other tabs
  // update data), they call markDataRefreshed() which writes to localStorage
  // and dispatches `app:data-refreshed`. We listen here so the "Updated X ago"
  // indicator on the Dashboard resets immediately when the user returns.
  useEffect(() => {
    const applyFromStorage = () => {
      const ts = readLastRefreshAt();
      if (!ts) return;
      setLastRefreshAt((prev) => (prev && prev >= ts ? prev : ts));
    };
    const onAppEvent = (e: Event) => {
      const ts = (e as CustomEvent<{ timestamp: number }>).detail?.timestamp;
      if (!ts) return applyFromStorage();
      setLastRefreshAt((prev) => (prev && prev >= ts ? prev : ts));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAST_REFRESH_STORAGE_KEY) return;
      applyFromStorage();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") applyFromStorage();
    };
    window.addEventListener("app:data-refreshed", onAppEvent as EventListener);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", applyFromStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("app:data-refreshed", onAppEvent as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", applyFromStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const debouncedRefresh = () => {
      const timeout = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
        void qc.invalidateQueries({ queryKey: ["bed_submissions_range"] });
      }, 700);

      return () => clearTimeout(timeout);
    };

    const channel = supabase
      .channel("bed-submissions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bed_submissions" }, () => {
        debouncedRefresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnectionStatus("offline");
        else setConnectionStatus("connecting");
      });

    return () => {
      setConnectionStatus("offline");
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const liveClock = useMemo(
    () =>
      formatSaudiDateTime(new Date(nowTick), {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [nowTick],
  );

  // Match Bed Map's "Last refreshed" source: the latest bed-entry database
  // timestamp (`updated_at`, falling back to `created_at`) and compare it to
  // the live Saudi clock for the Dashboard's elapsed duration.
  const latestBedEntryTimestamp = useMemo<number | null>(() => {
    let latest: string | null = null;
    for (const row of rows) {
      const raw =
        (row as { updated_at?: string | null; created_at?: string | null }).updated_at ??
        (row as { created_at?: string | null }).created_at ??
        null;
      if (raw && (!latest || raw > latest)) latest = raw;
    }
    if (!latest) return null;
    const ts = Date.parse(latest);
    return Number.isFinite(ts) ? ts : null;
  }, [rows]);

  const elapsedAnchor = latestBedEntryTimestamp ?? lastRefreshAt;

  // Compute elapsed time anchored to Asia/Riyadh. Since elapsed time is a
  // duration (delta of two absolute instants), it is timezone-invariant — but
  // we derive both anchors from the same UTC instants converted via the Saudi
  // formatter to guarantee no drift from the browser clock skew.
  const refreshStaleness = useMemo(() => {
    if (!elapsedAnchor) {
      return { label: "—", tone: "muted" as const };
    }
    const diffSec = Math.max(0, Math.floor((nowTick - elapsedAnchor) / 1000));
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

    let label: string;
    if (diffSec <= 5) {
      label = "just now";
    } else if (diffSec < 60) {
      label = `${plural(diffSec, "second")} ago`;
    } else if (diffSec < 3600) {
      // 1..59 minutes — switch to hours only at exactly 60 minutes
      const mins = Math.floor(diffSec / 60);
      label = `${plural(mins, "minute")} ago`;
    } else if (diffSec < 86400) {
      // 1..23 hours — switch to days only at exactly 24 hours
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      label = mins > 0
        ? `${plural(hours, "hour")} and ${plural(mins, "minute")} ago`
        : `${plural(hours, "hour")} ago`;
    } else {
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const parts = [plural(days, "day")];
      if (hours > 0) parts.push(plural(hours, "hour"));
      if (mins > 0 && days < 2) parts.push(plural(mins, "minute"));
      label = `${parts.join(" and ")} ago`;
    }

    let tone: "muted" | "amber" | "critical" = "muted";
    if (diffSec >= 86400) tone = "critical";
    else if (diffSec >= 3600) tone = "amber";

    return { label, tone };
  }, [elapsedAnchor, nowTick]);

  const lastRefreshLabel = refreshStaleness.label;
  const isCriticalStale = refreshStaleness.tone === "critical";
  const isAmberStale = refreshStaleness.tone === "amber";
  const stalenessTextClass =
    refreshStaleness.tone === "critical"
      ? "text-destructive"
      : refreshStaleness.tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  const stalenessHoursAgo = elapsedAnchor
    ? Math.floor(Math.max(0, nowTick - elapsedAnchor) / 3600000)
    : 0;

  const lastRefreshAbsoluteLabel = useMemo(() => {
    if (!elapsedAnchor) return `Last refreshed: — (${SAUDI_TIMEZONE})`;
    const d = new Date(elapsedAnchor);
    const datePart = new Intl.DateTimeFormat("en-US", {
      timeZone: SAUDI_TIMEZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("en-US", {
      timeZone: SAUDI_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return `Last refreshed: ${datePart} – ${timePart} (${SAUDI_TIMEZONE})`;
  }, [elapsedAnchor]);

  const statusMeta =
    connectionStatus === "live"
      ? { label: "Live", dot: "bg-emerald-500", ring: "bg-emerald-500/40", text: "text-emerald-600 dark:text-emerald-400" }
      : connectionStatus === "connecting"
        ? { label: "Connecting", dot: "bg-amber-500", ring: "bg-amber-500/40", text: "text-amber-600 dark:text-amber-400" }
        : { label: "Offline", dot: "bg-destructive", ring: "bg-destructive/40", text: "text-destructive" };

  return (
    <section className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{(() => {
            const hourStr = formatSaudiDateTime(new Date(nowTick), { hour: "2-digit", hour12: false });
            const h = parseInt(hourStr, 10);
            const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
            const name = profile?.display_name?.trim() || user?.email?.split("@")[0] || "there";
            return `${greeting}, ${name}`;
          })()}</h1>
          <p className="text-sm text-muted-foreground">Real-time snapshot of bed availability and patient capacity across all departments</p>
          <div
            className="mt-2 inline-flex w-fit items-center gap-3 rounded-full border bg-card/60 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
            role="status"
            aria-live="polite"
            title={`Connection: ${statusMeta.label} • Last refresh: ${lastRefreshLabel} • ${SAUDI_TIMEZONE}`}
          >
            <span className={`flex items-center gap-1.5 font-semibold ${statusMeta.text}`}>
              <span className="relative flex h-2 w-2">
                {connectionStatus === "live" && (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusMeta.ring}`} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${statusMeta.dot}`} />
              </span>
              {statusMeta.label}
            </span>
            <span className="h-3 w-px bg-border" aria-hidden />
            <span className="text-muted-foreground cursor-help" title={lastRefreshAbsoluteLabel}>
              Updated <span className={`font-medium ${stalenessTextClass}`}>{lastRefreshLabel}</span>
            </span>
            {isCriticalStale && (
              <span
                className="ml-1 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive"
                title={`Data has not refreshed in ${stalenessHoursAgo}h`}
              >
                Stale
              </span>
            )}
            <span className="h-3 w-px bg-border" aria-hidden />
            <span className="font-mono tabular-nums text-foreground">{liveClock}</span>
            <span className="text-muted-foreground">KSA</span>
          </div>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px]">
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formattedRangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setDatePickerOpen(false);
                  }
                }}
                today={today}
                numberOfMonths={1}
                className="p-3 pointer-events-auto"
                disabled={isDateDisabled}
                modifiers={{
                  saudiFriday: isSaudiFriday,
                  saudiSaturday: isSaudiSaturday,
                  saHoliday: hasSaudiHoliday,
                }}
                modifiersClassNames={{
                  saudiFriday: "text-primary",
                  saudiSaturday: "text-muted-foreground font-semibold",
                  saHoliday: "relative after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary",
                }}
                classNames={{
                  day_selected:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today:
                    "bg-transparent text-foreground ring-2 ring-primary ring-offset-2 ring-offset-background hover:bg-accent",
                  day_disabled: "text-muted-foreground opacity-40",
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Time</label>
            <Select
              value={selectedTime || undefined}
              onValueChange={setSelectedTime}
              disabled={availableTimes.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {availableTimes.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTimes.length === 0 && (
              <p className="text-xs text-muted-foreground">No bed entry times available for the selected date range.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Department</label>
              <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departmentOptions.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isFiltersDefault && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="w-full justify-center text-destructive hover:text-destructive"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset filters
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-6">
        {(() => {
          const hasEntries =
            filteredRows.length > 0 &&
            (sums.total_beds > 0 ||
              sums.occupied > 0 ||
              sums.closed > 0 ||
              sums.vacant > 0 ||
              waitingPatients > 0 ||
              bedTypeTotals.medical_ped > 0 ||
              bedTypeTotals.iso_nor_pres_ped > 0 ||
              bedTypeTotals.iso_ve_pres_ped > 0);
          return [
          { name: "Total Beds", value: Math.round(kpiCardValues.total_beds) },
          { name: "Occupied", value: Math.round(kpiCardValues.occupied) },
          { name: "Closed", value: Math.round(kpiCardValues.closed) },
          { name: "Vacant", value: Math.round(kpiCardValues.vacant) },
          { name: "Waiting Patients", value: Math.round(kpiCardValues.waiting_patients) },
            {
              name: "Occupancy Rate",
              value: `${occupancyRate.toFixed(1)}%`,
              accentColor: occupancyBenchmarkMatch?.color,
              subtitle: occupancyBenchmarkMatch?.label,
            },
          { name: "MEDICAL PED", value: Math.round(bedTypeTotals.medical_ped) },
          { name: "ISO NOR PRES PED", value: Math.round(bedTypeTotals.iso_nor_pres_ped) },
          { name: "ISO VE PRES PED", value: Math.round(bedTypeTotals.iso_ve_pres_ped) },
        ].map((metric, index) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.25 }}
            className="h-full"
          >
            <Card className="hospital-glass h-full">
              {!hasEntries ? (
                <>
                  <CardHeader className="p-3 pb-1 sm:p-6 sm:pb-2">
                    <CardTitle className="text-xs text-muted-foreground sm:text-sm">{metric.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <p className="text-xs italic text-muted-foreground sm:text-sm">No entries found</p>
                  </CardContent>
                </>
              ) : metric.name === "Occupancy Rate" ? (
                (() => {
                  const level = occupancyBenchmarkMatch;
                  const iconKey = level?.icon ?? (level ? getDefaultIconForLabel(level.label, level.key) : undefined);
                  const StatusIcon = getStatusIconComponent(iconKey);
                  const accent = metric.accentColor ?? "hsl(var(--primary))";
                  const clamped = Math.max(0, Math.min(100, occupancyRate));
                  const progressId = `occupancy-progress-${index}`;
                  return (
                    <div
                      className="group relative h-full w-full overflow-hidden rounded-lg p-3 sm:p-5"
                    >
                      <style>{`
                        @keyframes occupancy-shimmer-${index} {
                          0% { transform: translateX(-100%); }
                          100% { transform: translateX(200%); }
                        }
                        .${progressId}-track {
                          position: relative;
                          width: 100%;
                          height: 10px;
                          border-radius: 9999px;
                          background-color: color-mix(in srgb, ${accent} 12%, hsl(var(--muted)));
                          overflow: hidden;
                          box-shadow: inset 0 1px 2px color-mix(in srgb, ${accent} 18%, transparent);
                        }
                        .${progressId}-fill {
                          position: relative;
                          height: 100%;
                          border-radius: 9999px;
                          background-image: linear-gradient(90deg,
                            color-mix(in srgb, ${accent} 55%, white) 0%,
                            ${accent} 100%);
                          box-shadow: 0 0 12px color-mix(in srgb, ${accent} 40%, transparent);
                          transition: width 0.5s ease;
                          overflow: hidden;
                        }
                        .${progressId}-fill::after {
                          content: "";
                          position: absolute;
                          inset: 0;
                          background-image: linear-gradient(90deg,
                            transparent 0%,
                            rgba(255,255,255,0.45) 50%,
                            transparent 100%);
                          transform: translateX(-100%);
                          animation: occupancy-shimmer-${index} 2s linear infinite;
                        }
                      `}</style>

                      {StatusIcon ? (
                        <StatusIcon
                          size={64}
                          aria-hidden
                          className="pointer-events-none absolute right-2 top-2 h-10 w-10 transition-all duration-300 group-hover:rotate-[-4deg] sm:right-3 sm:top-3 sm:h-16 sm:w-16"
                          style={{
                            color: accent,
                            opacity: 0.13,
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as SVGSVGElement).style.opacity = "0.22";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as SVGSVGElement).style.opacity = "0.13";
                          }}
                        />
                      ) : null}

                      <div className="relative flex h-full min-w-0 flex-col gap-2 pr-12 sm:gap-3 sm:pr-20">
                        <p className="text-xs text-muted-foreground sm:text-sm">{metric.name}</p>
                        <p
                          className="text-2xl font-bold leading-tight sm:text-4xl"
                          style={{ color: accent }}
                        >
                          {metric.value}
                        </p>
                        <div className="w-full">
                          <div className={`${progressId}-track`}>
                            <div
                              className={`${progressId}-fill`}
                              style={{ width: `${clamped}%` }}
                            />
                          </div>
                        </div>
                        {metric.subtitle ? (
                          <div
                            className="flex items-center gap-1.5 text-xs font-medium"
                            style={{ color: accent }}
                          >
                            {StatusIcon ? <StatusIcon size={14} aria-hidden /> : null}
                            <span>{metric.subtitle}</span>
                          </div>
                        ) : null}
                        {occupancyDelta ? (() => {
                          const { diff, percentChange, previous } = occupancyDelta;
                          const isUp = diff > 0.05;
                          const isDown = diff < -0.05;
                          const trendColor = isUp
                            ? "hsl(var(--destructive))"
                            : isDown
                            ? "#16a34a"
                            : "hsl(var(--muted-foreground))";
                          const TrendIcon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
                          const pctLabel =
                            percentChange === null
                              ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pts`
                              : `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(1)}%`;
                          const prevLabel = previous.time
                            ? `${previous.date} ${previous.time}`
                            : previous.date;
                          return (
                            <div
                              className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium"
                              title={`Compared to previous selection (${prevLabel}, ${previous.rate.toFixed(1)}%)`}
                            >
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                                style={{
                                  color: trendColor,
                                  backgroundColor: `color-mix(in srgb, ${trendColor} 12%, transparent)`,
                                }}
                              >
                                <TrendIcon className="h-3 w-3" aria-hidden />
                                <span>{pctLabel}</span>
                              </span>
                              <span className="text-muted-foreground">
                                vs {prevLabel} ({previous.rate.toFixed(1)}%)
                              </span>
                            </div>
                          );
                        })() : null}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  <CardHeader className="p-3 pb-1 sm:p-6 sm:pb-2">
                    <CardTitle className="text-xs text-muted-foreground sm:text-sm">{metric.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <p className="text-xl font-bold sm:text-3xl">{metric.value}</p>
                  </CardContent>
                </>
              )}
            </Card>
          </motion.div>
        ));
        })()}
      </div>

      <Card className="hospital-glass">
        <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <CardTitle className="text-base sm:text-lg">
              {departmentView === "cards" ? "Department Status" : "Department Occupancy"}
            </CardTitle>
            <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 sm:px-3 sm:py-1 sm:text-xs">
              {departmentStatusCards.length} Active {departmentStatusCards.length === 1 ? "Department" : "Departments"}
            </span>
          </div>
          <div className="inline-flex w-full items-center rounded-md border bg-muted p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setDepartmentView("cards")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                departmentView === "cards"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={departmentView === "cards"}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setDepartmentView("table")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                departmentView === "table"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={departmentView === "table"}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {departmentView === "cards" ? (
            departmentStatusCards.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No department entries found for the selected filters.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {departmentStatusCards.map((dept) => {
                  const clamped = Math.max(0, Math.min(100, dept.rate));
                  return (
                    <div
                      key={dept.id}
                      className="rounded-xl border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-foreground sm:text-base">
                          {dept.name}
                        </h3>
                        <StatusBadge level={dept.benchmark} size="sm" />
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-xl font-bold text-foreground sm:text-2xl">
                            {dept.total}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Total</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold sm:text-2xl" style={{ color: "#b91c1c" }}>
                            {dept.occupied}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Occupied</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold sm:text-2xl" style={{ color: "#16a34a" }}>
                            {dept.vacant}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Vacant</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-muted-foreground sm:text-2xl">
                            {dept.closed}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Closed</p>
                        </div>
                      </div>

                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${clamped}%`,
                            backgroundColor: dept.benchmark?.color ?? "#b91c1c",
                          }}
                        />
                      </div>

                      <p className="mt-2 text-right text-xs text-muted-foreground">
                        {dept.rate.toFixed(0)}% occupied
                      </p>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Occupied</TableHead>
                  <TableHead className="text-right">Vacant</TableHead>
                  <TableHead>Occupancy</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departmentStatusCards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No entries found for the selected date/time filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {departmentStatusCards.map((dept) => {
                      const clamped = Math.min(Math.max(dept.rate, 0), 100);
                      const barColor = dept.benchmark?.color ?? "#b91c1c";
                      return (
                        <TableRow key={dept.id}>
                          <TableCell className="font-semibold">{dept.name}</TableCell>
                          <TableCell className="text-right font-medium">{dept.total}</TableCell>
                          <TableCell className="text-right" style={{ color: "#b91c1c" }}>{dept.occupied}</TableCell>
                          <TableCell className="text-right" style={{ color: "#16a34a" }}>{dept.vacant}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[160px]">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${clamped}%`, backgroundColor: barColor }}
                                />
                              </div>
                              <span className="text-sm font-semibold tabular-nums" style={{ color: barColor }}>
                                {dept.rate.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{renderStatusBadge(dept.benchmark)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default DashboardPage;
