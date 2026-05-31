import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, RefreshCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import {
  deleteKpiWidget,
  deleteKpiFormula,
  fetchFormFields,
  fetchKpiFormulas,
  fetchKpiWidgets,
  saveKpiFormula,
  saveKpiWidget,
  updateKpiFormula,
} from "@/lib/supabase-api";
import { KpiBenchmarkEditor } from "@/components/settings/kpi-benchmark-editor";
import { detectFormulaCycle, formulaVariableKey } from "@/lib/formula-registry";

// Reserved math tokens that may appear in expressions but are NOT variables.
const RESERVED_TOKENS = new Set([
  "abs", "ceil", "floor", "round", "min", "max", "sum", "avg", "mean",
  "sqrt", "pow", "log", "exp", "if", "and", "or", "not", "true", "false",
  "pi", "e",
]);

const extractTokens = (expression: string): string[] => {
  const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of matches) {
    if (RESERVED_TOKENS.has(token.toLowerCase())) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
};

const KpiBuilderPage = () => {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [formulaName, setFormulaName] = useState("");
  const [expression, setExpression] = useState("");
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [widgetName, setWidgetName] = useState("");
  const [widgetFormulaId, setWidgetFormulaId] = useState("");
  const [widgetToDelete, setWidgetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [formulaToDelete, setFormulaToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: formulas = [] } = useQuery({ queryKey: ["kpi_formulas"], queryFn: fetchKpiFormulas });
  const { data: widgets = [] } = useQuery({ queryKey: ["kpi_widgets"], queryFn: fetchKpiWidgets });
  const { data: formFields = [] } = useQuery({ queryKey: ["form_fields"], queryFn: fetchFormFields });

  // Dynamic variables sourced from Form Builder fields (numeric / formula / boolean only).
  const fieldVariables = useMemo(
    () =>
      formFields
        .filter((field) => field.is_active)
        .filter((field) =>
          ["number", "formula", "boolean"].includes(field.field_type),
        )
        .map((field) => ({ key: field.field_key, label: field.label, source: "field" as const })),
    [formFields],
  );

  // Saved formulas (excluding the one currently being edited) become available
  // as variables for compound / derived formulas.
  const formulaVariables = useMemo(
    () =>
      formulas
        .filter((formula) => formula.is_active)
        .filter((formula) => formula.id !== editingFormulaId)
        .map((formula) => ({
          key: formulaVariableKey(formula.name),
          label: formula.name,
          source: "formula" as const,
        }))
        .filter((variable) => variable.key.length > 0),
    [formulas, editingFormulaId],
  );

  const availableVariables = useMemo(
    () => [...fieldVariables, ...formulaVariables],
    [fieldVariables, formulaVariables],
  );

  const availableKeySet = useMemo(
    () => new Set(availableVariables.map((variable) => variable.key)),
    [availableVariables],
  );

  // Tokens currently referenced by the expression that are NOT defined in Form Builder.
  const expressionTokens = useMemo(() => extractTokens(expression), [expression]);
  const unresolvedExpressionTokens = useMemo(
    () => expressionTokens.filter((token) => !availableKeySet.has(token)),
    [expressionTokens, availableKeySet],
  );

  // Self-reference guard: a formula cannot reference its own sanitized name.
  const selfReferenceKey = useMemo(() => formulaVariableKey(formulaName), [formulaName]);
  const selfReferences = selfReferenceKey.length > 0 && expressionTokens.includes(selfReferenceKey);

  // Circular dependency guard: simulate adding the candidate and walk the graph.
  const cyclePath = useMemo(() => {
    if (!formulaName.trim() || !expression.trim()) return null;
    return detectFormulaCycle(formulas, {
      id: editingFormulaId ?? undefined,
      name: formulaName,
      expression,
    });
  }, [formulas, formulaName, expression, editingFormulaId]);

  const resetFormulaForm = () => {
    setEditingFormulaId(null);
    setFormulaName("");
    setExpression("");
    setSelectedVariables([]);
  };

  const formulaMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: formulaName.trim(),
        expression: expression.trim(),
        variables: selectedVariables,
        is_active: true,
      };
      if (editingFormulaId) {
        return updateKpiFormula(roles, editingFormulaId, payload);
      }
      return saveKpiFormula(roles, payload);
    },
    onSuccess: async () => {
      toast({ title: editingFormulaId ? "Formula updated" : "Formula saved" });
      resetFormulaForm();
      await qc.invalidateQueries({ queryKey: ["kpi_formulas"] });
    },
    onError: (error) => toast({ title: "Formula save failed", description: (error as Error).message, variant: "destructive" }),
  });

  const deleteFormulaMutation = useMutation({
    mutationFn: (id: string) => deleteKpiFormula(roles, id),
    onSuccess: async () => {
      toast({ title: "Formula deleted" });
      if (editingFormulaId === formulaToDelete?.id) resetFormulaForm();
      await qc.invalidateQueries({ queryKey: ["kpi_formulas"] });
    },
    onError: (error) => toast({ title: "Formula delete failed", description: (error as Error).message, variant: "destructive" }),
  });

  const widgetMutation = useMutation({
    mutationFn: () =>
      saveKpiWidget(roles, {
        name: widgetName,
        formula_id: widgetFormulaId,
        aggregation_scope: "department_sum",
          is_visible: true,
        display_order: widgets.length + 1,
        refresh_seconds: 30,
      }),
    onSuccess: async () => {
      toast({ title: "Widget saved" });
      setWidgetName("");
      setWidgetFormulaId("");
      await qc.invalidateQueries({ queryKey: ["kpi_widgets"] });
    },
    onError: (error) => toast({ title: "Widget save failed", description: (error as Error).message, variant: "destructive" }),
  });

  const deleteWidgetMutation = useMutation({
    mutationFn: (id: string) => deleteKpiWidget(roles, id),
    onSuccess: async () => {
      toast({ title: "Widget deleted" });
      await qc.invalidateQueries({ queryKey: ["kpi_widgets"] });
    },
    onError: (error) => toast({ title: "Widget delete failed", description: (error as Error).message, variant: "destructive" }),
  });

  const insertVariable = (key: string) => {
    setExpression((prev) => (prev.length === 0 || /[\s+\-*/(]$/.test(prev) ? `${prev}${key}` : `${prev} ${key}`));
    setSelectedVariables((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">KPI Formula Builder</h1>
          <p className="text-sm text-muted-foreground">
            Variables come from Form Builder fields and any previously saved formula in the global registry.
            Compose ratios, averages, and derived KPIs without duplicating logic.
          </p>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["kpi_widgets"] })}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Manual Refresh
        </Button>
      </header>

      {/* Global formula health: any saved formula referencing variables no longer in Form Builder. */}
      {(() => {
        const broken = formulas
          .map((formula) => ({
            formula,
            missing: extractTokens(formula.expression).filter(
              (token) => !availableKeySet.has(token),
            ),
          }))
          .filter((entry) => entry.missing.length > 0);
        if (broken.length === 0) return null;
        return (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unresolved variables in saved formulas</AlertTitle>
            <AlertDescription>
              The following formulas reference fields that no longer exist in the Form Builder.
              Rename or recreate the matching field, or edit the formula.
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {broken.map(({ formula, missing }) => (
                  <li key={formula.id}>
                    <span className="font-semibold">{formula.name}</span>
                    {" — missing: "}
                    <span className="font-mono">{missing.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        );
      })()}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{editingFormulaId ? "Edit Formula" : "Create Formula"}</CardTitle>
            <CardDescription>
              All saved formulas are applied globally. Click a Form Builder field below to insert it as a variable.
              Operators: + - * / ( )
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Formula Name</Label>
              <Input value={formulaName} onChange={(e) => setFormulaName(e.target.value)} placeholder="Occupancy Rate" />
            </div>
            <div className="space-y-2">
              <Label>Expression</Label>
              <Input
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="e.g. occupied / total_beds * 100  or  Occupancy_Rate / 100"
                className="font-mono"
              />
              {unresolvedExpressionTokens.length > 0 && (
                <p className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Unresolved variable{unresolvedExpressionTokens.length > 1 ? "s" : ""}:{" "}
                    <span className="font-mono">{unresolvedExpressionTokens.join(", ")}</span>
                    {" — "}define {unresolvedExpressionTokens.length > 1 ? "these" : "this"} in Form Builder
                    {" "}or save a matching formula first, or remove from the expression.
                  </span>
                </p>
              )}
              {selfReferences && (
                <p className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>A formula cannot reference itself ({selfReferenceKey}).</span>
                </p>
              )}
              {cyclePath && cyclePath.length > 0 && !selfReferences && (
                <p className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Circular dependency detected:{" "}
                    <span className="font-mono">{cyclePath.join(" → ")}</span>
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Available Variables</Label>
              <p className="text-xs text-muted-foreground">
                Form Builder fields and saved formulas can be inserted as variables.
              </p>
              {availableVariables.length === 0 ? (
                <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  No numeric/formula fields exist in the Form Builder, and no formulas are saved yet.
                  Add fields or save a formula to make them available here.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {availableVariables.map((variable) => {
                    const selected = selectedVariables.includes(variable.key);
                    return (
                      <div
                        key={variable.key}
                        className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm"
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => {
                              setSelectedVariables((prev) =>
                                checked
                                  ? [...new Set([...prev, variable.key])]
                                  : prev.filter((item) => item !== variable.key),
                              );
                            }}
                          />
                          <span className="min-w-0 truncate">
                            <span className="font-mono text-xs">{variable.key}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{variable.label}</span>
                            <Badge
                              variant={variable.source === "formula" ? "secondary" : "outline"}
                              className="ml-2 text-[10px]"
                            >
                              {variable.source === "formula" ? "Formula" : "Field"}
                            </Badge>
                          </span>
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => insertVariable(variable.key)}
                        >
                          Insert
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => formulaMutation.mutate()}
                disabled={
                  formulaMutation.isPending ||
                  !formulaName.trim() ||
                  !expression.trim() ||
                  unresolvedExpressionTokens.length > 0 ||
                  selfReferences ||
                  Boolean(cyclePath && cyclePath.length > 0)
                }
              >
                {editingFormulaId ? "Update Formula" : "Save Formula"}
              </Button>
              {editingFormulaId && (
                <Button type="button" variant="outline" onClick={resetFormulaForm}>
                  <X className="mr-2 h-4 w-4" /> Cancel Edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create KPI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>KPI Name</Label>
              <Input value={widgetName} onChange={(e) => setWidgetName(e.target.value)} placeholder="Main Occupancy KPI" />
            </div>
            <div className="space-y-2">
              <Label>Formula</Label>
              <Select value={widgetFormulaId} onValueChange={setWidgetFormulaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select formula" />
                </SelectTrigger>
                <SelectContent>
                  {formulas.map((formula) => (
                    <SelectItem key={formula.id} value={formula.id}>
                      {formula.name} {formula.is_system ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => widgetMutation.mutate()} disabled={!widgetName || !widgetFormulaId || widgetMutation.isPending}>
              Save KPI
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Formulas (Global Registry)</CardTitle>
          <CardDescription>
            Every saved formula is applied across Dashboard KPI cards, tables, and charts.
            Default (system) formulas can be edited but not deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {formulas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No formulas yet. Create one above.</p>
          ) : (
            formulas.map((formula) => {
              const missing = extractTokens(formula.expression).filter(
                (token) => !availableKeySet.has(token),
              );
              return (
              <div key={formula.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{formula.name}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{formula.expression}</p>
                  {missing.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Unresolved: <span className="font-mono">{missing.join(", ")}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {formula.is_system && <Badge variant="secondary">Default</Badge>}
                  {missing.length > 0 && <Badge variant="destructive">Needs Fix</Badge>}
                  <Badge variant={formula.is_active ? "default" : "outline"}>{formula.is_active ? "Active" : "Inactive"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingFormulaId(formula.id);
                      setFormulaName(formula.name);
                      setExpression(formula.expression);
                      setSelectedVariables(Array.isArray(formula.variables) ? formula.variables : []);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={formula.is_system || deleteFormulaMutation.isPending}
                    title={formula.is_system ? "Default formulas cannot be deleted" : undefined}
                    onClick={() => setFormulaToDelete({ id: formula.id, name: formula.name })}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage KPIs</CardTitle>
          <CardDescription>Delete KPI you no longer need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {widgets.map((widget) => (
            <div key={widget.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-semibold">{widget.name}</p>
                <p className="text-xs text-muted-foreground">{widget.is_visible ? "Active" : "Not active"}</p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setWidgetToDelete({ id: widget.id, name: widget.name })}
                disabled={deleteWidgetMutation.isPending}
              >
                Delete
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <KpiBenchmarkEditor />

      <AlertDialog open={Boolean(widgetToDelete)} onOpenChange={(open) => !open && setWidgetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete widget?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{widgetToDelete?.name}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (widgetToDelete) {
                  deleteWidgetMutation.mutate(widgetToDelete.id);
                }
                setWidgetToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(formulaToDelete)} onOpenChange={(open) => !open && setFormulaToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete formula?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{formulaToDelete?.name}</span> from the global registry.
              Any KPI cards or charts that referenced it will fall back to defaults. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (formulaToDelete) {
                  deleteFormulaMutation.mutate(formulaToDelete.id);
                }
                setFormulaToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default KpiBuilderPage;
