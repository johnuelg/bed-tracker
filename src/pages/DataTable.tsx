import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Download, FileText, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { hasAnyRole } from "@/lib/rbac";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  calendarDateToIsoDate,
  formatSaudiIsoDateForDisplay,
  isoDateToCalendarDate,
} from "@/lib/date-time";
import { buildRowScope, evaluateNamedFormula, evaluateOccupancyRate } from "@/lib/formula-registry";
import {
  deleteAllBedSubmissions,
  deleteBedSubmission,
  diffBedSubmission,
  fetchDashboardSubmissions,
  fetchDepartments,
  fetchKpiFormulas,
  fetchOccupancyBenchmarkSettings,
  getCurrentUserId,
  writeAuditLog,
} from "@/lib/supabase-api";
import type { BedSubmission, OccupancyBenchmarkLevel } from "@/types/hospital";

type SortKey =
  | "date"
  | "time"
  | "department"
  | "total_beds"
  | "occupied"
  | "closed"
  | "vacant"
  | "waiting"
  | "occupancy";

type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const DEFAULT_BENCHMARK: OccupancyBenchmarkLevel[] = [
  { key: "low", label: "Low", threshold: "< 60%", minPercent: null, maxPercent: 60, minInclusive: false, maxInclusive: false, color: "#16a34a", icon: "thumbs-up" },
  { key: "optimal", label: "Optimal", threshold: "60% – 84%", minPercent: 60, maxPercent: 84, minInclusive: true, maxInclusive: true, color: "#16a34a", icon: "check" },
  { key: "watch", label: "Watch", threshold: "85% – 89%", minPercent: 85, maxPercent: 89, minInclusive: true, maxInclusive: true, color: "#f59e0b", icon: "eye" },
  { key: "high", label: "High", threshold: "≥ 90%", minPercent: 90, maxPercent: null, minInclusive: true, maxInclusive: false, color: "#dc2626", icon: "alert-triangle" },
];

const extractUserInputDateTime = (row: BedSubmission) => {
  const customFields = (row.custom_fields as Record<string, unknown>) ?? {};
  for (const value of Object.values(customFields)) {
    if (typeof value !== "string") continue;
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
    if (match) return { date: match[1], time: match[2] };
  }
  return null;
};

const extractWaiting = (row: BedSubmission) => {
  const customFields = (row.custom_fields as Record<string, unknown>) ?? {};
  const direct = customFields.waiting_patients ?? customFields.waitingPatients;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string") return Number(direct) || 0;
  const detected = Object.entries(customFields).find(([key]) =>
    key.toLowerCase().includes("waiting") && key.toLowerCase().includes("patient"),
  )?.[1];
  if (typeof detected === "number") return detected;
  if (typeof detected === "string") return Number(detected) || 0;
  return 0;
};

const readCustomNumber = (row: BedSubmission, key: string) => {
  const v = (row.custom_fields as Record<string, unknown>)?.[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
};

const readCalculatedNumber = (row: BedSubmission, key: string) => {
  const v = (row.calculated_fields as Record<string, unknown>)?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const readCustomBool = (row: BedSubmission, key: string) => {
  const v = (row.custom_fields as Record<string, unknown>)?.[key];
  return v === true || v === "true";
};

const readCustomString = (row: BedSubmission, key: string) => {
  const v = (row.custom_fields as Record<string, unknown>)?.[key];
  return v === null || v === undefined ? "" : String(v);
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
};

const csvEscape = (value: unknown) => {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const DataTablePage = () => {
  const qc = useQueryClient();
  const { roles, user } = useAuth();
  const { toast } = useToast();
  const canDelete = hasAnyRole(roles, ["admin", "director"]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Defaults: unfiltered (no date range, all times, all depts, all bed types)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [timeFrom, setTimeFrom] = useState("00:00");
  const [timeTo, setTimeTo] = useState("23:59");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const { data: rows = [] } = useQuery({
    queryKey: ["bed_submissions_dashboard"],
    queryFn: fetchDashboardSubmissions,
  });
  const { data: departments = [] } = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });
  const { data: occupancyBenchmark } = useQuery({
    queryKey: ["app_settings", "occupancy_benchmark"],
    queryFn: fetchOccupancyBenchmarkSettings,
  });
  const { data: kpiFormulas = [] } = useQuery({ queryKey: ["kpi_formulas"], queryFn: fetchKpiFormulas });

  const benchmarkLevels = occupancyBenchmark?.levels ?? DEFAULT_BENCHMARK;
  const getOccupancyBenchmark = (value: number) =>
    benchmarkLevels.find((level) => {
      const minPass = level.minPercent === null ? true : level.minInclusive ? value >= level.minPercent : value > level.minPercent;
      const maxPass = level.maxPercent === null ? true : level.maxInclusive ? value <= level.maxPercent : value < level.maxPercent;
      return minPass && maxPass;
    }) ?? benchmarkLevels[benchmarkLevels.length - 1];

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const dateFilteredRows = useMemo(() => {
    const fromMinutes = toMinutes(timeFrom);
    const toMinutesValue = toMinutes(timeTo);
    const wrapsMidnight = fromMinutes > toMinutesValue;
    const dateFromIso = dateRange?.from ? calendarDateToIsoDate(dateRange.from) : null;
    const dateToIso = dateRange?.to
      ? calendarDateToIsoDate(dateRange.to)
      : dateRange?.from
        ? calendarDateToIsoDate(dateRange.from)
        : null;
    const lowerDate = dateFromIso && dateToIso && dateFromIso > dateToIso ? dateToIso : dateFromIso;
    const upperDate = dateFromIso && dateToIso && dateFromIso > dateToIso ? dateFromIso : dateToIso;

    return rows.filter((row) => {
      const userDateTime = extractUserInputDateTime(row);
      if (!userDateTime) return false;
      if (lowerDate && userDateTime.date < lowerDate) return false;
      if (upperDate && userDateTime.date > upperDate) return false;

      const minutes = toMinutes(userDateTime.time);
      if (wrapsMidnight) {
        if (!(minutes >= fromMinutes || minutes <= toMinutesValue)) return false;
      } else {
        if (!(minutes >= fromMinutes && minutes <= toMinutesValue)) return false;
      }
      return true;
    });
  }, [rows, timeFrom, timeTo, dateRange]);

  const departmentOptions = useMemo(() => {
    const ids = new Set(
      dateFilteredRows.map((row) => row.department_id),
    );
    return departments.filter((d) => ids.has(d.id));
  }, [dateFilteredRows, departments]);

  useEffect(() => {
    if (selectedDepartmentId !== "all" && !departmentOptions.some((d) => d.id === selectedDepartmentId)) {
      setSelectedDepartmentId("all");
    }
  }, [departmentOptions, selectedDepartmentId]);

  const filteredRows = useMemo(
    () =>
      dateFilteredRows.filter((row) => {
        if (selectedDepartmentId !== "all" && row.department_id !== selectedDepartmentId) return false;
        return true;
      }),
    [dateFilteredRows, selectedDepartmentId],
  );

  const enrichedRows = useMemo(() => {
    return filteredRows.map((row) => {
      const dt = extractUserInputDateTime(row);
      // Fall back to custom_fields when top-level columns are missing/zero.
      // This protects historical entries where Occupied/Closed/Total were captured
      // via dynamic form fields (custom_fields) instead of the dedicated columns.
      const totalBedsRaw = Number(row.total_beds) || 0;
      const occupiedCalculated = readCalculatedNumber(row, "occupied_auto");
      const occupiedRaw = Number(row.occupied) || 0;
      const closedRaw = Number(row.closed) || 0;
      const totalBeds = totalBedsRaw > 0
        ? totalBedsRaw
        : readCustomNumber(row, "total_beds");
      const occupiedFallback = occupiedRaw > 0
        ? occupiedRaw
        : readCustomNumber(row, "occupied");
      const closed = closedRaw > 0
        ? closedRaw
        : readCustomNumber(row, "closed");
      const baseScope = buildRowScope({
        ...row,
        total_beds: totalBeds,
        occupied: occupiedFallback,
        closed,
      });
      const occupied = occupiedCalculated ?? evaluateNamedFormula(kpiFormulas, "Occupied", baseScope, occupiedFallback);
      const vacant = Math.max(totalBeds - occupied - closed, 0);
      const waiting = extractWaiting(row);
      const scope = buildRowScope({
        ...row,
        total_beds: totalBeds,
        occupied,
        closed,
      });
      const occupancy = evaluateOccupancyRate(kpiFormulas, scope);
      return {
        row,
        date: dt?.date ?? "",
        time: dt?.time ?? "",
        department: departmentMap.get(row.department_id) ?? "-",
        totalBeds,
        occupied,
        closed,
        vacant,
        waiting,
        occupancy,
        medicalPed: readCustomNumber(row, "medical_ped"),
        isoNorPresPed: readCustomNumber(row, "iso_nor_pres_ped"),
        isoVePresPed: readCustomNumber(row, "iso_ve_pres_ped"),
        singleRoom: readCustomBool(row, "single_room"),
        roomNoReason: readCustomString(row, "input_room_no._of_single_room"),
      };
    });
  }, [filteredRows, kpiFormulas, departmentMap]);

  const sortedRows = useMemo(() => {
    const compare = (a: typeof enrichedRows[number], b: typeof enrichedRows[number]) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "date":
          av = `${a.date} ${a.time}`;
          bv = `${b.date} ${b.time}`;
          break;
        case "time":
          av = a.time;
          bv = b.time;
          break;
        case "department":
          av = a.department;
          bv = b.department;
          break;
        case "total_beds":
          av = a.totalBeds;
          bv = b.totalBeds;
          break;
        case "occupied":
          av = a.occupied;
          bv = b.occupied;
          break;
        case "closed":
          av = a.closed;
          bv = b.closed;
          break;
        case "vacant":
          av = a.vacant;
          bv = b.vacant;
          break;
        case "waiting":
          av = a.waiting;
          bv = b.waiting;
          break;
        case "occupancy":
          av = a.occupancy;
          bv = b.occupancy;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    };
    return [...enrichedRows].sort(compare);
  }, [enrichedRows, sortKey, sortDir]);

  const totalRowCount = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRowCount / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize],
  );

  const isFiltersDefault =
    !dateRange &&
    timeFrom === "00:00" &&
    timeTo === "23:59" &&
    selectedDepartmentId === "all";

  const handleConfirmDeleteOne = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const previousRow = rows.find((row) => row.id === deleteTarget.id) ?? null;
      await deleteBedSubmission(roles, deleteTarget.id);
      const currentUserId = await getCurrentUserId();
      if (previousRow && currentUserId) {
        await writeAuditLog({
          action: "DELETE",
          record_id: previousRow.id,
          user_id: currentUserId,
          user_name: user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? null,
          department_name: departmentMap.get(previousRow.department_id) ?? null,
          record_date: previousRow.submitted_on,
          changes: diffBedSubmission(previousRow, {}),
        });
      }
      toast({ title: "Entry deleted", description: deleteTarget.label });
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    } catch (error) {
      toast({
        title: "Failed to delete entry",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const rowsToDelete = rows.slice(0, 500);
      await deleteAllBedSubmissions(roles);
      const currentUserId = await getCurrentUserId();
      if (currentUserId) {
        await Promise.all(rowsToDelete.map((row) => writeAuditLog({
          action: "DELETE",
          record_id: row.id,
          user_id: currentUserId,
          user_name: user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? null,
          department_name: departmentMap.get(row.department_id) ?? null,
          record_date: row.submitted_on,
          changes: diffBedSubmission(row, {}),
        })));
      }
      toast({ title: "All bed entries deleted" });
      setConfirmDeleteAll(false);
      void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    } catch (error) {
      toast({
        title: "Failed to delete entries",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setDateRange(undefined);
    setTimeFrom("00:00");
    setTimeTo("23:59");
    setSelectedDepartmentId("all");
    setPage(1);
    void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const handleExportCsv = () => {
    const headers = [
      "Date",
      "Time",
      "Department",
      "Total Beds",
      "Occupied",
      "Closed",
      "Vacant",
      "Waiting Patients",
      "Medical Ped",
      "Iso Nor Pres Ped",
      "Iso Ve Pres Ped",
      "Single Room",
      "Room No. & Reason",
      "Reason for Closure",
      "Occupancy Rate (%)",
      "Status",
    ];
    const lines = [headers.map(csvEscape).join(",")];
    sortedRows.forEach((entry) => {
      const benchmark = getOccupancyBenchmark(entry.occupancy);
      lines.push(
        [
          entry.date,
          entry.time,
          entry.department,
          entry.totalBeds,
          entry.occupied,
          entry.closed,
          entry.vacant,
          entry.waiting,
          entry.medicalPed,
          entry.isoNorPresPed,
          entry.isoVePresPed,
          entry.singleRoom ? "Yes" : "No",
          entry.roomNoReason,
          entry.row.closure_reason || "",
          entry.occupancy.toFixed(1),
          benchmark?.label ?? "",
        ].map(csvEscape).join(","),
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.download = `bed-management-data-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const headers = [
      "Date",
      "Time",
      "Department",
      "Total",
      "Occupied",
      "Closed",
      "Vacant",
      "Waiting",
      "Med Ped",
      "Iso Nor Pres Ped",
      "Iso Ve Pres Ped",
      "Single Room",
      "Room No. & Reason",
      "Reason",
      "Occupancy %",
      "Status",
    ];
    const body = sortedRows.map((entry) => {
      const benchmark = getOccupancyBenchmark(entry.occupancy);
      return [
        entry.date,
        entry.time,
        entry.department,
        String(entry.totalBeds),
        String(entry.occupied),
        String(entry.closed),
        String(entry.vacant),
        String(entry.waiting),
        String(entry.medicalPed),
        String(entry.isoNorPresPed),
        String(entry.isoVePresPed),
        entry.singleRoom ? "Yes" : "No",
        entry.roomNoReason,
        entry.row.closure_reason || "",
        `${entry.occupancy.toFixed(1)}%`,
        benchmark?.label ?? "",
      ];
    });

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(14);
    doc.text("Bed Management Data", 40, 36);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Range: ${formattedRangeLabel}`, 40, 52);
    doc.text(
      `Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} (Asia/Riyadh)`,
      pageWidth - 40,
      52,
      { align: "right" },
    );

    autoTable(doc, {
      head: [headers],
      body,
      startY: 68,
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
          pageWidth - 40,
          pageHeight - 20,
          { align: "right" },
        );
      },
    });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    doc.save(`bed-management-data-${stamp}.pdf`);
  };

  const formattedRangeLabel = dateRange?.from
    ? `${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.from), { year: "numeric", month: "short", day: "numeric" })}${dateRange.to ? ` - ${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.to), { year: "numeric", month: "short", day: "numeric" })}` : ""}`
    : "All dates";

  useEffect(() => {
    const channel = supabase
      .channel("data-table-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bed_submissions" }, () => {
        const timeout = setTimeout(() => {
          void qc.invalidateQueries({ queryKey: ["bed_submissions_dashboard"] });
        }, 700);
        return () => clearTimeout(timeout);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <section className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Data Table</h1>
          <p className="text-sm text-muted-foreground">
            Sortable, paginated view of all bed management entries. Unfiltered by default.
          </p>
          <Badge variant="secondary" className="mt-2 w-fit">Timezone: Asia/Riyadh</Badge>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px]">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formattedRangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                className="p-3 pointer-events-auto"
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From Time</label>
              <Input type="time" value={timeFrom} onChange={(event) => setTimeFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To Time</label>
              <Input type="time" value={timeTo} onChange={(event) => setTimeTo(event.target.value)} />
            </div>
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

          <div className="flex flex-col gap-2 sm:flex-row">
            {!isFiltersDefault && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="w-full justify-center text-destructive hover:text-destructive sm:flex-1"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleExportCsv}
              disabled={sortedRows.length === 0}
              className="w-full justify-center sm:flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              disabled={sortedRows.length === 0}
              className="w-full justify-center sm:flex-1"
            >
              <FileText className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteAll(true)}
                disabled={rows.length === 0}
                className="w-full justify-center sm:flex-1"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete all
              </Button>
            )}
          </div>
        </div>
      </header>

      <Card className="hospital-glass">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>All Entered Records</CardTitle>
          <span className="text-xs text-muted-foreground">
            {totalRowCount} {totalRowCount === 1 ? "record" : "records"}
          </span>
        </CardHeader>
        <CardContent>
          {/* Mobile (<sm): card list */}
          <div className="space-y-3 sm:hidden">
            {paginatedRows.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                No entries found for the current filters.
              </div>
            ) : (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {paginatedRows.map((entry) => {
                  const benchmark = getOccupancyBenchmark(entry.occupancy);
                  return (
                    <div
                      key={entry.row.id}
                      className="rounded-lg border bg-card p-3 shadow-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{entry.department}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.date || "-"} • {entry.time || "-"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: benchmark?.color }}>
                            {entry.occupancy.toFixed(1)}%
                          </span>
                          {canDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: entry.row.id,
                                  label: `${entry.department} • ${entry.date} ${entry.time}`,
                                })
                              }
                              aria-label="Delete entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <StatusBadge level={benchmark} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-medium">{entry.totalBeds}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Occupied</dt><dd className="font-medium">{entry.occupied}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Closed</dt><dd className="font-medium">{entry.closed}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Vacant</dt><dd className="font-medium">{entry.vacant}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Waiting</dt><dd className="font-medium">{entry.waiting}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Single Room</dt><dd className="font-medium">{entry.singleRoom ? "Yes" : "No"}</dd></div>
                      </dl>
                      {(entry.roomNoReason || entry.row.closure_reason) && (
                        <div className="mt-2 space-y-1 text-xs">
                          {entry.roomNoReason && (
                            <p><span className="text-muted-foreground">Room/Reason:</span> {entry.roomNoReason}</p>
                          )}
                          {entry.row.closure_reason && (
                            <p><span className="text-muted-foreground">Closure:</span> {entry.row.closure_reason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tablet & Desktop (>=sm): adaptive table with independent scroll */}
          <div className="hidden rounded-lg border bg-card sm:block">
            <div className="max-h-[65vh] w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80 [&_th]:border-b">
                  <tr className="[&>th]:h-11 [&>th]:px-3 [&>th]:text-left [&>th]:align-middle [&>th]:font-medium [&>th]:text-muted-foreground">
                    <th className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("date")}>
                      Date {renderSortIcon("date")}
                    </th>
                    <th className="hidden cursor-pointer select-none whitespace-nowrap md:table-cell" onClick={() => handleSort("time")}>
                      Time {renderSortIcon("time")}
                    </th>
                    <th className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("department")}>
                      Department {renderSortIcon("department")}
                    </th>
                    <th className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("total_beds")}>
                      Total {renderSortIcon("total_beds")}
                    </th>
                    <th className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("occupied")}>
                      Occupied {renderSortIcon("occupied")}
                    </th>
                    <th className="hidden cursor-pointer select-none whitespace-nowrap text-right md:table-cell" onClick={() => handleSort("closed")}>
                      Closed {renderSortIcon("closed")}
                    </th>
                    <th className="hidden cursor-pointer select-none whitespace-nowrap text-right md:table-cell" onClick={() => handleSort("vacant")}>
                      Vacant {renderSortIcon("vacant")}
                    </th>
                    <th className="hidden cursor-pointer select-none whitespace-nowrap text-right lg:table-cell" onClick={() => handleSort("waiting")}>
                      Waiting {renderSortIcon("waiting")}
                    </th>
                    <th className="hidden whitespace-nowrap text-right xl:table-cell">Medical Ped</th>
                    <th className="hidden whitespace-nowrap text-right xl:table-cell">Iso Nor Pres Ped</th>
                    <th className="hidden whitespace-nowrap text-right xl:table-cell">Iso Ve Pres Ped</th>
                    <th className="hidden whitespace-nowrap text-center xl:table-cell">Single Room</th>
                    <th className="hidden whitespace-nowrap xl:table-cell">Room No. &amp; Reason</th>
                    <th className="hidden xl:table-cell">Reason for Closure</th>
                    <th className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("occupancy")}>
                      Occupancy {renderSortIcon("occupancy")}
                    </th>
                    <th className="hidden whitespace-nowrap lg:table-cell">Status</th>
                    {canDelete && <th className="w-[60px] text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="[&_td]:p-3 [&_td]:align-middle [&_tr]:border-b [&_tr:last-child]:border-0">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={canDelete ? 17 : 16} className="py-6 text-center text-muted-foreground">
                        No entries found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((entry, idx) => {
                      const benchmark = getOccupancyBenchmark(entry.occupancy);
                      return (
                        <tr
                          key={entry.row.id}
                          className={cn(
                            "transition-colors hover:bg-muted/40",
                            idx % 2 === 1 && "bg-muted/20",
                          )}
                        >
                          <td className="whitespace-nowrap">{entry.date || "-"}</td>
                          <td className="hidden whitespace-nowrap md:table-cell">{entry.time || "-"}</td>
                          <td className="max-w-[220px] truncate">{entry.department}</td>
                          <td className="text-right font-medium">{entry.totalBeds}</td>
                          <td className="text-right">{entry.occupied}</td>
                          <td className="hidden text-right md:table-cell">{entry.closed}</td>
                          <td className="hidden text-right md:table-cell">{entry.vacant}</td>
                          <td className="hidden text-right lg:table-cell">{entry.waiting}</td>
                          <td className="hidden text-right xl:table-cell">{entry.medicalPed}</td>
                          <td className="hidden text-right xl:table-cell">{entry.isoNorPresPed}</td>
                          <td className="hidden text-right xl:table-cell">{entry.isoVePresPed}</td>
                          <td className="hidden text-center xl:table-cell">
                            <div className="flex justify-center">
                              <Checkbox checked={entry.singleRoom} disabled aria-label="Single Room available" />
                            </div>
                          </td>
                          <td className="hidden max-w-[220px] whitespace-normal break-words xl:table-cell">
                            {entry.roomNoReason || "-"}
                          </td>
                          <td className="hidden xl:table-cell">{entry.row.closure_reason || "-"}</td>
                          <td className="whitespace-nowrap text-right font-medium" style={{ color: benchmark?.color }}>
                            {entry.occupancy.toFixed(1)}%
                          </td>
                          <td className="hidden lg:table-cell"><StatusBadge level={benchmark} /></td>
                          {canDelete && (
                            <td className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: entry.row.id,
                                    label: `${entry.department} • ${entry.date} ${entry.time}`,
                                  })
                                }
                                aria-label="Delete entry"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1}>
                « First
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
                Next
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                Last »
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bed entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.label}
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteOne();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ALL bed entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove every bed submission from the database
              ({rows.length} {rows.length === 1 ? "record" : "records"}). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteAll();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default DataTablePage;