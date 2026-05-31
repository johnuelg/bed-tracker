import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Ban, CheckCircle2, CalendarIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchDepartments,
  fetchDepartmentTotalBeds,
  fetchSubmissionsByDateRange,
  fetchOccupancyBenchmarkSettings,
} from "@/lib/supabase-api";
import type { BedSubmission, OccupancyBenchmarkSettings } from "@/types/hospital";
import {
  formatSaudiDateTime,
  getSaudiIsoDate,
  isoDateToCalendarDate,
  calendarDateToIsoDate,
  SAUDI_TIMEZONE,
} from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortMode = "default" | "recent";

// Custom icon: bed with a patient lying on it (used for occupied beds)
const BedPatientIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Patient head */}
    <circle cx="7.5" cy="7" r="2" />
    {/* Patient body */}
    <path d="M9.5 11h6" />
    {/* Bed frame */}
    <path d="M2 4v16" />
    <path d="M2 13h18a2 2 0 0 1 2 2v5" />
    <path d="M2 17h20" />
  </svg>
);

// Bed-type breakdown stored in custom_fields keys → display label
const BED_TYPE_FIELD_LABELS: Array<{ key: string; label: string }> = [
  { key: "medical_ped", label: "MEDICAL PED" },
  { key: "iso_nor_pres_ped", label: "ISO NOR PRES PED" },
  { key: "iso_ve_pres_ped", label: "ISO VE PRES PED" },
];

type BedStatus = "occupied" | "closed" | "vacant";

type BedCell = {
  index: number;
  label: string;
  status: BedStatus;
  bedTypeName?: string;
};

type DepartmentBeds = {
  id: string;
  name: string;
  code: string;
  totalBeds: number;
  occupied: number;
  closed: number;
  vacant: number;
  bedTypeCounts: Array<{ label: string; count: number }>;
  beds: BedCell[];
  lastUpdatedAt?: string;
};

const statusStyles: Record<
  BedStatus,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; card: string; iconColor: string; badge: string }
> = {
  occupied: {
    label: "Occupied",
    icon: BedPatientIcon,
    card: "border-destructive/40 bg-destructive/5 hover:border-destructive",
    iconColor: "text-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
  },
  closed: {
    label: "Closed",
    icon: Ban,
    card: "border-slate-300 bg-slate-100 opacity-70 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/50",
    iconColor: "text-slate-500 dark:text-slate-400",
    badge: "bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
  vacant: {
    label: "Vacant",
    icon: CheckCircle2,
    card: "border-green-300 bg-green-50 hover:border-green-500 dark:border-green-800 dark:bg-green-950/30",
    iconColor: "text-green-600 dark:text-green-400",
    badge: "bg-green-100 text-green-700 border-green-300 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800",
  },
};

// Sum today's submissions per department across all bed types.
// For duplicate rows (same department + bed_type), keep only the most recent
// (rows are pre-sorted DESC by updated_at in fetchTodaySubmissions).
const readNumberField = (source: Record<string, unknown> | null | undefined, key: string) => {
  const value = source?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getEffectiveOccupied = (row: BedSubmission) => {
  const calculatedOccupied = readNumberField(row.calculated_fields, "occupied_auto");
  if (calculatedOccupied !== undefined) return calculatedOccupied;

  const rawOccupied = Number(row.occupied) || 0;
  return rawOccupied > 0 ? rawOccupied : readNumberField(row.custom_fields, "occupied") ?? 0;
};

const getEffectiveClosed = (row: BedSubmission) => {
  const rawClosed = Number(row.closed) || 0;
  return rawClosed > 0 ? rawClosed : readNumberField(row.custom_fields, "closed") ?? 0;
};

// For each department on a given date, the LATEST submission is the source of
// truth and fully REPLACES any prior submission's values (occupied, closed,
// and the bed-type breakdown in custom_fields). We do not sum or merge across
// older rows for the same department + date.
//
// Rows arrive pre-sorted DESC by updated_at, so the first row we see per
// department is the most recent.
const aggregateByDepartment = (rows: BedSubmission[]) => {
  const map = new Map<
    string,
    {
      occupied: number;
      closed: number;
      perType: Array<{ label: string; occupied: number }>;
      lastUpdatedAt?: string;
    }
  >();
  for (const row of rows) {
    if (map.has(row.department_id)) continue; // keep only the latest row per department
    const perType: Array<{ label: string; occupied: number }> = [];
    for (const { key, label } of BED_TYPE_FIELD_LABELS) {
      const n = readNumberField(row.custom_fields, key) ?? 0;
      if (n > 0) perType.push({ label, occupied: n });
    }
    map.set(row.department_id, {
      occupied: getEffectiveOccupied(row),
      closed: getEffectiveClosed(row),
      perType,
      lastUpdatedAt: row.updated_at,
    });
  }
  return map;
};

const BedMapPage = () => {
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>(() => getSaudiIsoDate());
  const todayIso = getSaudiIsoDate();
  const isToday = selectedIsoDate === todayIso;

  const { data: departments, isLoading: loadingDepartments } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments,
  });

  const { data: totalBedsMap, isLoading: loadingTotals } = useQuery({
    queryKey: ["app_settings", "department_total_beds"],
    queryFn: fetchDepartmentTotalBeds,
  });

  const { data: daySubmissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ["bed_submissions", "by-date", selectedIsoDate],
    queryFn: () => fetchSubmissionsByDateRange(selectedIsoDate, selectedIsoDate),
  });

  const { data: benchmarkSettings } = useQuery({
    queryKey: ["app_settings", "occupancy_benchmark"],
    queryFn: fetchOccupancyBenchmarkSettings,
  });

  const isLoading = loadingDepartments || loadingTotals || loadingSubmissions;

  const grouped: DepartmentBeds[] = useMemo(() => {
    if (!departments) return [];
    const aggMap = aggregateByDepartment(daySubmissions ?? []);

    return departments
      .filter((d) => d.is_active)
      .map((dept) => {
        const total = Math.max(0, Number(totalBedsMap?.[dept.id] ?? 0) | 0);
        const agg = aggMap.get(dept.id);
        const rawOccupied = Math.max(0, Number(agg?.occupied ?? 0) | 0);
        const rawClosed = Math.max(0, Number(agg?.closed ?? 0) | 0);
        // Cap to avoid overflow if submission exceeds configured total
        const occupied = Math.min(rawOccupied, total);
        const closed = Math.min(rawClosed, Math.max(0, total - occupied));
        const vacant = Math.max(0, total - occupied - closed);

        // Sort per-type breakdown by the canonical field order
        const orderIndex = new Map(BED_TYPE_FIELD_LABELS.map((b, i) => [b.label, i]));
        const perType = [...(agg?.perType ?? [])].sort(
          (a, b) => (orderIndex.get(a.label) ?? 999) - (orderIndex.get(b.label) ?? 999),
        );
        const bedTypeCounts = BED_TYPE_FIELD_LABELS.map(({ label }) => ({
          label,
          count: perType.find((entry) => entry.label === label)?.occupied ?? 0,
        }));

        // Walk through occupied bed indices and assign bed-type labels sequentially
        const occupiedTypeByIndex = new Map<number, string>();
        let cursor = 1;
        let remaining = occupied;
        for (const seg of perType) {
          if (remaining <= 0) break;
          const take = Math.min(seg.occupied, remaining);
          for (let k = 0; k < take; k++) {
            occupiedTypeByIndex.set(cursor + k, seg.label);
          }
          cursor += take;
          remaining -= take;
        }

        const beds: BedCell[] = Array.from({ length: total }, (_, i) => {
          const index = i + 1;
          let status: BedStatus;
          if (index <= occupied) status = "occupied";
          else if (index <= occupied + closed) status = "closed";
          else status = "vacant";
          return {
            index,
            label: `${dept.code || dept.name} ${index}`,
            status,
            bedTypeName: status === "occupied" ? occupiedTypeByIndex.get(index) : undefined,
          };
        });

        return {
          id: dept.id,
          name: dept.name,
          code: dept.code,
          totalBeds: total,
          occupied,
          closed,
          vacant,
          bedTypeCounts,
          beds,
          lastUpdatedAt: agg?.lastUpdatedAt,
        };
      });
  }, [departments, totalBedsMap, daySubmissions]);

  const totals = grouped.reduce(
    (acc, g) => ({
      total: acc.total + g.totalBeds,
      occupied: acc.occupied + g.occupied,
      closed: acc.closed + g.closed,
      vacant: acc.vacant + g.vacant,
    }),
    { total: 0, occupied: 0, closed: 0, vacant: 0 },
  );

  // Most recent updated_at across all departments
  const lastRefreshedAt = grouped.reduce<string | undefined>((latest, g) => {
    if (!g.lastUpdatedAt) return latest;
    return !latest || g.lastUpdatedAt > latest ? g.lastUpdatedAt : latest;
  }, undefined);

  const getOccupancyRate = (occupied: number, total: number, closed: number) => {
    const denom = Math.max(0, total - closed);
    return denom > 0 ? (occupied / denom) * 100 : 0;
  };

  const formatOccupancy = (occupied: number, total: number, closed: number) => {
    const denom = Math.max(0, total - closed);
    const rate = denom > 0 ? (occupied / denom) * 100 : 0;
    return `${occupied}/${denom} beds · ${rate.toFixed(1)}%`;
  };

  // Resolve the matching KPI Benchmark level for an occupancy rate
  const benchmarkLevels = benchmarkSettings?.levels ?? [];
  const matchBenchmark = (rate: number) =>
    benchmarkLevels.find((level) => {
      const minPass =
        level.minPercent === null || level.minPercent === undefined
          ? true
          : level.minInclusive
            ? rate >= level.minPercent
            : rate > level.minPercent;
      const maxPass =
        level.maxPercent === null || level.maxPercent === undefined
          ? true
          : level.maxInclusive
            ? rate <= level.maxPercent
            : rate < level.maxPercent;
      return minPass && maxPass;
    });

  const benchmarkBadgeStyle = (rate: number): React.CSSProperties => {
    const level = matchBenchmark(rate);
    if (!level?.color) return {};
    return {
      backgroundColor: `${level.color}1a`,
      borderColor: `${level.color}66`,
      color: level.color,
    };
  };

  const benchmarkLabel = (rate: number) => matchBenchmark(rate)?.label;

  const [sortMode, setSortMode] = useState<SortMode>("default");

  const sortedDepartments = useMemo(() => {
    if (sortMode !== "recent") return grouped;
    return [...grouped].sort((a, b) => {
      if (!a.lastUpdatedAt && !b.lastUpdatedAt) return 0;
      if (!a.lastUpdatedAt) return 1;
      if (!b.lastUpdatedAt) return -1;
      return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt);
    });
  }, [grouped, sortMode]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl cursor-help"
            title={
              lastRefreshedAt
                ? `Last refreshed: ${formatSaudiDateTime(new Date(lastRefreshedAt), {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })} (${SAUDI_TIMEZONE})`
                : `Last refreshed: — (${SAUDI_TIMEZONE})`
            }
          >
            Bed Map
          </h1>
          <p className="text-sm text-muted-foreground">
            {isToday
              ? "Live bed status from the latest entry per department (today)."
              : `Bed status for ${format(isoDateToCalendarDate(selectedIsoDate), "PPP")}.`}
          </p>
          {!isLoading && lastRefreshedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last refreshed:{" "}
              <span className="font-medium text-foreground">
                {formatSaudiDateTime(new Date(lastRefreshedAt), {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </p>
          )}
        </div>
        {!isLoading && (
          <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {isToday
                    ? "Today"
                    : format(isoDateToCalendarDate(selectedIsoDate), "PP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={isoDateToCalendarDate(selectedIsoDate)}
                  onSelect={(d) => d && setSelectedIsoDate(calendarDateToIsoDate(d))}
                  disabled={(date) => calendarDateToIsoDate(date) > todayIso}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {!isToday && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setSelectedIsoDate(todayIso)}
                    >
                      Jump to today
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default order</SelectItem>
                <SelectItem value="recent">Recently refreshed</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-sm">
              {grouped.length} departments · {totals.total} beds
            </Badge>
            <Badge variant="outline" className={statusStyles.occupied.badge}>
              {totals.occupied} Occupied
            </Badge>
            <Badge variant="outline" className={statusStyles.closed.badge}>
              {totals.closed} Closed
            </Badge>
            <Badge variant="outline" className={statusStyles.vacant.badge}>
              {totals.vacant} Vacant
            </Badge>
            {(() => {
              const rate = getOccupancyRate(totals.occupied, totals.total, totals.closed);
              const label = benchmarkLabel(rate);
              return (
                <Badge variant="outline" style={benchmarkBadgeStyle(rate)}>
                  Occupancy Rate {formatOccupancy(totals.occupied, totals.total, totals.closed)}
                  {label ? ` · ${label}` : ""}
                </Badge>
              );
            })()}
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BedDouble className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No active departments configured. Add departments and set Total Beds in Categories.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDepartments.map((dept) => (
            <Card key={dept.id} className="overflow-hidden">
              <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg sm:text-xl">{dept.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {dept.code || "—"}
                    {dept.lastUpdatedAt ? (
                      <>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span>
                          Updated{" "}
                          {formatSaudiDateTime(new Date(dept.lastUpdatedAt), {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className="italic">No submissions yet</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="shrink-0">
                    {dept.totalBeds} beds
                  </Badge>
                  <Badge variant="outline" className={statusStyles.occupied.badge}>
                    {dept.occupied} Occupied
                  </Badge>
                  <Badge variant="outline" className={statusStyles.closed.badge}>
                    {dept.closed} Closed
                  </Badge>
                  <Badge variant="outline" className={statusStyles.vacant.badge}>
                    {dept.vacant} Vacant
                  </Badge>
                  {(() => {
                    const rate = getOccupancyRate(dept.occupied, dept.totalBeds, dept.closed);
                    const label = benchmarkLabel(rate);
                    return (
                      <Badge variant="outline" style={benchmarkBadgeStyle(rate)}>
                        Occupancy Rate {formatOccupancy(dept.occupied, dept.totalBeds, dept.closed)}
                        {label ? ` · ${label}` : ""}
                      </Badge>
                    );
                  })()}
                </div>
              </CardHeader>
              <div className="border-t bg-muted/30 px-6 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                    Bed Type Breakdown
                  </span>
                  {dept.bedTypeCounts.map(({ label, count }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex h-1.5 w-1.5 rounded-full",
                          count > 0 ? "bg-primary" : "bg-muted-foreground/30",
                        )}
                      />
                      <span className="font-medium text-muted-foreground">{label}</span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
                          count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <CardContent>
                {dept.totalBeds === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Total Beds configured for this department.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {dept.beds.map((bed) => {
                      const s = statusStyles[bed.status];
                      const Icon = s.icon;
                      return (
                        <div
                          key={bed.index}
                          className={cn(
                            "hospital-transition grid aspect-square grid-rows-5 items-center justify-items-center rounded-lg border p-2 text-center shadow-sm hover:shadow-md",
                            s.card,
                          )}
                          title={`${bed.label} · ${s.label}${bed.bedTypeName ? ` · ${bed.bedTypeName}` : ""}`}
                        >
                          <Icon className={cn("h-5 w-5", s.iconColor)} />
                          <span className="text-xs font-semibold leading-none">
                            {dept.code || dept.name}
                          </span>
                          <span className="text-sm font-bold leading-none text-foreground">#{bed.index}</span>
                          <span
                            className="max-w-full truncate text-[9px] font-bold uppercase leading-none tracking-wide"
                            title={bed.bedTypeName || undefined}
                          >
                            {bed.bedTypeName || "\u00A0"}
                          </span>
                          <span className={cn("text-[10px] font-medium uppercase leading-none tracking-wide", s.iconColor)}>
                            {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default BedMapPage;
