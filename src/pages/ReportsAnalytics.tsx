import { useState } from "react";
import { BarChart3, CalendarIcon, FileDown, LineChart, PieChart, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { calendarDateToIsoDate, formatSaudiIsoDateForDisplay } from "@/lib/date-time";

const plannedSections: Array<{ icon: typeof BarChart3; title: string; description: string }> = [
  {
    icon: PieChart,
    title: "KPI summary cards",
    description: "Aggregated occupancy, closures, and bed utilization for any selected date range.",
  },
  {
    icon: BarChart3,
    title: "Department comparison",
    description: "Side-by-side bar charts comparing beds, occupancy, and closures across departments.",
  },
  {
    icon: LineChart,
    title: "Occupancy trends",
    description: "Daily and weekly line/area charts showing occupancy % per department over time.",
  },
  {
    icon: FileDown,
    title: "Export to CSV / PDF",
    description: "Download filtered report data for sharing and offline review.",
  },
];

const ReportsAnalyticsPage = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const formattedRangeLabel = dateRange?.from
    ? `${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.from), { year: "numeric", month: "short", day: "numeric" })}${dateRange.to ? ` – ${formatSaudiIsoDateForDisplay(calendarDateToIsoDate(dateRange.to), { year: "numeric", month: "short", day: "numeric" })}` : ""}`
    : "Pick date range";

  const fromIso = dateRange?.from ? calendarDateToIsoDate(dateRange.from) : null;
  const toIso = dateRange?.to
    ? calendarDateToIsoDate(dateRange.to)
    : dateRange?.from
      ? calendarDateToIsoDate(dateRange.from)
      : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
        <p className="text-muted-foreground">
          Visual reports and exportable analytics for bed occupancy and department performance.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report period</CardTitle>
          <CardDescription>
            Select a date range to scope the KPI summary, charts, and exports below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "min-w-[260px] justify-start text-left font-normal",
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
          {dateRange?.from && (
            <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
          {fromIso && (
            <span className="ml-auto text-xs text-muted-foreground">
              Showing data from <span className="font-medium text-foreground">{fromIso}</span> to{" "}
              <span className="font-medium text-foreground">{toIso}</span>
            </span>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            This page is a placeholder. The sections below outline what will be available once the full report
            module ships.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {plannedSections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <section.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed bg-muted/30 text-xs text-muted-foreground">
                Preview coming soon
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ReportsAnalyticsPage;