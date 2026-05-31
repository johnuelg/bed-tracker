import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchOccupancyBenchmarkSettings, saveOccupancyBenchmarkSettings } from "@/lib/supabase-api";
import type { OccupancyBenchmarkSettings } from "@/types/hospital";
import { STATUS_ICON_OPTIONS, getStatusIconComponent, getDefaultIconForLabel } from "@/lib/status-icons";
import { StatusBadge } from "@/components/status-badge";

const defaultOccupancyBenchmarkSettings: OccupancyBenchmarkSettings = {
  levels: [
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
  ],
};

const parseThreshold = (value: string) => {
  const normalized = value.trim().replace(/–/g, "-");
  const rangeMatch = normalized.match(/^(\d{1,3})\s*%?\s*-\s*(\d{1,3})\s*%?$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max && min >= 0 && max <= 100) {
      return {
        threshold: `${min}% – ${max}%`,
        minPercent: min,
        maxPercent: max,
        minInclusive: true,
        maxInclusive: true,
      };
    }
  }

  const lowMatch = normalized.match(/^<\s*(\d{1,3})\s*%?$/);
  if (lowMatch) {
    const max = Number(lowMatch[1]);
    if (Number.isFinite(max) && max >= 0 && max <= 100) {
      return {
        threshold: `< ${max}%`,
        minPercent: null,
        maxPercent: max,
        minInclusive: false,
        maxInclusive: false,
      };
    }
  }

  const highMatch = normalized.match(/^(>=|≥)\s*(\d{1,3})\s*%?$/);
  if (highMatch) {
    const min = Number(highMatch[2]);
    if (Number.isFinite(min) && min >= 0 && min <= 100) {
      return {
        threshold: `≥ ${min}%`,
        minPercent: min,
        maxPercent: null,
        minInclusive: true,
        maxInclusive: false,
      };
    }
  }

  return null;
};

export const KpiBenchmarkEditor = () => {
  const { roles, user } = useAuth();
  const isAdmin = roles.includes("admin");
  const queryClient = useQueryClient();
  const { data: occupancyServerSettings } = useQuery({
    queryKey: ["app_settings", "occupancy_benchmark"],
    queryFn: fetchOccupancyBenchmarkSettings,
  });

  const [occupancyDraft, setOccupancyDraft] = useState<OccupancyBenchmarkSettings>(defaultOccupancyBenchmarkSettings);
  const currentOccupancy = occupancyServerSettings ?? occupancyDraft;

  const buildStatusKey = () => `status_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const updateLevel = (index: number, updater: (level: OccupancyBenchmarkSettings["levels"][number]) => OccupancyBenchmarkSettings["levels"][number]) => {
    const next = currentOccupancy.levels.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry));
    const payload = { levels: next };
    setOccupancyDraft(payload);
    if (occupancyServerSettings) queryClient.setQueryData(["app_settings", "occupancy_benchmark"], payload);
  };

  const addLevel = () => {
    const payload = {
      levels: [
        ...currentOccupancy.levels,
        {
          key: buildStatusKey(),
          label: "New Status",
          threshold: "0% – 100%",
          minPercent: 0,
          maxPercent: 100,
          minInclusive: true,
          maxInclusive: true,
          color: "#64748b",
          icon: "circle",
        },
      ],
    };
    setOccupancyDraft(payload);
    if (occupancyServerSettings) queryClient.setQueryData(["app_settings", "occupancy_benchmark"], payload);
  };

  const deleteLevel = (index: number) => {
    if (currentOccupancy.levels.length <= 1) {
      toast({
        title: "At least one status is required",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      levels: currentOccupancy.levels.filter((_, entryIndex) => entryIndex !== index),
    };
    setOccupancyDraft(payload);
    if (occupancyServerSettings) queryClient.setQueryData(["app_settings", "occupancy_benchmark"], payload);
  };

  const hasInvalidThreshold = currentOccupancy.levels.some((level) => !parseThreshold(level.threshold));
  const hasEmptyStatusName = currentOccupancy.levels.some((level) => level.label.trim().length === 0);

  const saveOccupancyMutation = useMutation({
    mutationFn: (next: OccupancyBenchmarkSettings) => {
      if (!user?.id) throw new Error("You must be signed in to save settings.");
      return saveOccupancyBenchmarkSettings(roles, next, user.id);
    },
    onSuccess: async () => {
      toast({ title: "KPI benchmark saved" });
      await queryClient.invalidateQueries({ queryKey: ["app_settings", "occupancy_benchmark"] });
    },
    onError: (error) => toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Benchmark</CardTitle>
        <CardDescription>Define occupancy statuses, thresholds, and color codes used by Dashboard and reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Admins can add, edit, or delete status rows.</p>
          <Button type="button" variant="outline" onClick={addLevel} disabled={!isAdmin || saveOccupancyMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Add Status
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Threshold</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Icon</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Color</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentOccupancy.levels.map((level, index) => (
                <tr key={level.key} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <Input
                      value={level.label}
                      placeholder="Status name"
                      onChange={(event) => updateLevel(index, (entry) => ({ ...entry, label: event.target.value }))}
                      disabled={!isAdmin || saveOccupancyMutation.isPending}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      value={level.threshold}
                      placeholder="e.g., 60% – 84%, < 60%, ≥ 90%"
                      onChange={(event) => {
                        const nextThreshold = event.target.value;
                        updateLevel(index, (entry) => {
                          const parsed = parseThreshold(nextThreshold);
                          if (!parsed) {
                            return { ...entry, threshold: nextThreshold };
                          }

                          return {
                            ...entry,
                            ...parsed,
                          };
                        });
                      }}
                      disabled={!isAdmin || saveOccupancyMutation.isPending}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const currentIcon = level.icon ?? getDefaultIconForLabel(level.label, level.key);
                      return (
                        <div className="flex items-center gap-2">
                          <StatusBadge level={{ ...level, icon: currentIcon }} />
                          <Select
                            value={currentIcon}
                            onValueChange={(value) => updateLevel(index, (entry) => ({ ...entry, icon: value }))}
                            disabled={!isAdmin || saveOccupancyMutation.isPending}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Pick icon" />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_ICON_OPTIONS.map((option) => {
                                const OptionIcon = option.Icon;
                                return (
                                  <SelectItem key={option.key} value={option.key}>
                                    <span className="flex items-center gap-2">
                                      <OptionIcon size={14} />
                                      <span>{option.label}</span>
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={level.color}
                        onChange={(event) => updateLevel(index, (entry) => ({ ...entry, color: event.target.value }))}
                        disabled={!isAdmin || saveOccupancyMutation.isPending}
                        className="h-10 w-14 cursor-pointer rounded border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${level.label} color code`}
                      />
                      <Input
                        value={level.color}
                        onChange={(event) => updateLevel(index, (entry) => ({ ...entry, color: event.target.value }))}
                        disabled={!isAdmin || saveOccupancyMutation.isPending}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteLevel(index)}
                      disabled={!isAdmin || saveOccupancyMutation.isPending || currentOccupancy.levels.length <= 1}
                      aria-label={`Delete ${level.label} status`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasEmptyStatusName ? <p className="text-sm text-destructive">Each status must have a name.</p> : null}
        <Button
          onClick={() => {
            if (hasInvalidThreshold) {
              toast({
                title: "Invalid threshold format",
                description: "Use one of: < 60%, 60% – 84%, or ≥ 90%.",
                variant: "destructive",
              });
              return;
            }
            if (hasEmptyStatusName) {
              toast({
                title: "Status name is required",
                description: "Every status row must have a label.",
                variant: "destructive",
              });
              return;
            }
            saveOccupancyMutation.mutate(currentOccupancy);
          }}
          disabled={!isAdmin || saveOccupancyMutation.isPending}
        >
          Save KPI Benchmark
        </Button>
      </CardContent>
    </Card>
  );
};