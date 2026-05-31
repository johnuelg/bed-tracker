import { evaluateSafeExpression } from "@/lib/math-eval";
import type { BedSubmission, KpiFormula } from "@/types/hospital";

/**
 * Global Formula Registry.
 *
 * All KPI calculations across Dashboard tables, charts, and KPI cards
 * MUST go through this module. No formula should be hardcoded elsewhere.
 *
 * Built-in variables available to every formula:
 *  - total_beds, occupied, closed, vacant
 *  - waiting_patients
 *
 * Custom variables resolve from `bed_submission.custom_fields` (numeric only).
 */

export type FormulaScope = Record<string, number>;

const WAITING_KEY_HINT = (key: string) =>
  key.toLowerCase().includes("waiting") && key.toLowerCase().includes("patient");

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const extractWaitingPatients = (custom: Record<string, unknown>): number => {
  const direct = custom.waiting_patients ?? (custom as Record<string, unknown>).waitingPatients;
  if (direct !== undefined) return toNumber(direct);
  const detected = Object.entries(custom).find(([key]) => WAITING_KEY_HINT(key));
  return detected ? toNumber(detected[1]) : 0;
};

/** Build a scope (variable → numeric value) for a single submission row. */
export const buildRowScope = (
  row: Pick<BedSubmission, "total_beds" | "occupied" | "closed"> & {
    custom_fields?: Record<string, unknown> | null;
  },
): FormulaScope => {
  const total_beds = toNumber(row.total_beds);
  const occupied = toNumber(row.occupied);
  const closed = toNumber(row.closed);
  const vacant = Math.max(total_beds - occupied - closed, 0);
  const custom = (row.custom_fields ?? {}) as Record<string, unknown>;
  const waiting_patients = extractWaitingPatients(custom);

  const scope: FormulaScope = {
    total_beds,
    occupied,
    closed,
    vacant,
    waiting_patients,
  };

  // Add numeric custom_fields under sanitized keys
  for (const [key, value] of Object.entries(custom)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
    if (!(safeKey in scope) && (typeof value === "number" || typeof value === "string")) {
      const num = Number(value);
      if (Number.isFinite(num)) scope[safeKey] = num;
    }
  }

  return scope;
};

/** Build an aggregate scope (SUM-based) across many rows. */
export const buildAggregateScope = (
  rows: Array<
    Pick<BedSubmission, "total_beds" | "occupied" | "closed"> & {
      custom_fields?: Record<string, unknown> | null;
    }
  >,
): FormulaScope => {
  const acc: FormulaScope = {
    total_beds: 0,
    occupied: 0,
    closed: 0,
    vacant: 0,
    waiting_patients: 0,
  };

  for (const row of rows) {
    const rowScope = buildRowScope(row);
    for (const [key, value] of Object.entries(rowScope)) {
      acc[key] = (acc[key] ?? 0) + value;
    }
  }

  return acc;
};

/**
 * Evaluate a single formula safely. Returns null when the formula is
 * inactive, missing, or the expression fails to evaluate.
 */
export const evaluateFormula = (
  formula: Pick<KpiFormula, "expression" | "is_active"> | null | undefined,
  scope: FormulaScope,
): number | null => {
  if (!formula || !formula.is_active) return null;
  try {
    return evaluateSafeExpression(formula.expression, scope);
  } catch {
    return null;
  }
};

/** Find a formula in the global registry by case-insensitive name match. */
export const findFormulaByName = (
  formulas: KpiFormula[],
  name: string,
): KpiFormula | undefined => {
  const target = name.trim().toLowerCase();
  return formulas.find((formula) => formula.name.trim().toLowerCase() === target);
};

/**
 * Sanitize a formula display name into a safe variable token (matches the
 * tokenization used by the KPI Builder UI: `[A-Za-z_][A-Za-z0-9_]*`).
 */
export const formulaVariableKey = (name: string): string => {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9_]/g, "_");
  if (!cleaned) return "";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
};

const RESERVED_TOKEN_SET = new Set([
  "abs", "ceil", "floor", "round", "min", "max", "sum", "avg", "mean",
  "sqrt", "pow", "log", "exp", "if", "and", "or", "not", "true", "false",
  "pi", "e",
]);

const tokensFromExpression = (expression: string): string[] => {
  const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of matches) {
    if (RESERVED_TOKEN_SET.has(token.toLowerCase())) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
};

/**
 * Augment a base scope (from row/aggregate data) with the evaluated value of
 * every active formula in the registry, keyed by the formula's variable name
 * (sanitized). Formulas are evaluated in dependency order; circular references
 * are detected and skipped (resolve to null and excluded from scope).
 *
 * Returned scope retains all base variables AND adds resolved formula values,
 * enabling compound formulas to reference other formulas as variables.
 */
export const buildScopeWithFormulas = (
  baseScope: FormulaScope,
  formulas: KpiFormula[],
): { scope: FormulaScope; unresolved: Record<string, string[]> } => {
  const scope: FormulaScope = { ...baseScope };
  const unresolved: Record<string, string[]> = {};

  const active = formulas.filter((f) => f.is_active);
  const byKey = new Map<string, KpiFormula>();
  for (const formula of active) {
    const key = formulaVariableKey(formula.name);
    if (key) byKey.set(key, formula);
  }

  const resolving = new Set<string>();
  const resolved = new Set<string>();

  const resolve = (key: string): number | null => {
    if (resolved.has(key)) return scope[key] ?? null;
    const formula = byKey.get(key);
    if (!formula) return null;
    if (resolving.has(key)) {
      // Circular reference — bail out for this branch.
      unresolved[formula.name] = [...(unresolved[formula.name] ?? []), `circular:${key}`];
      return null;
    }
    resolving.add(key);

    const tokens = tokensFromExpression(formula.expression);
    const missing: string[] = [];
    for (const token of tokens) {
      if (token in scope) continue;
      if (byKey.has(token)) {
        const value = resolve(token);
        if (value === null) missing.push(token);
      } else {
        missing.push(token);
      }
    }

    resolving.delete(key);

    if (missing.length > 0) {
      unresolved[formula.name] = [
        ...(unresolved[formula.name] ?? []),
        ...missing,
      ];
      resolved.add(key);
      return null;
    }

    const value = evaluateFormula(formula, scope);
    if (value !== null) scope[key] = value;
    resolved.add(key);
    return value;
  };

  for (const key of byKey.keys()) resolve(key);

  return { scope, unresolved };
};

/**
 * Detect whether adding/updating a formula with the given name + expression
 * would create a circular dependency in the registry. Returns the cycle path
 * if found, otherwise null.
 */
export const detectFormulaCycle = (
  formulas: KpiFormula[],
  candidate: { id?: string; name: string; expression: string },
): string[] | null => {
  const candidateKey = formulaVariableKey(candidate.name);
  if (!candidateKey) return null;

  const byKey = new Map<string, { id?: string; name: string; expression: string }>();
  for (const formula of formulas) {
    if (candidate.id && formula.id === candidate.id) continue; // replaced by candidate
    const key = formulaVariableKey(formula.name);
    if (key) byKey.set(key, formula);
  }
  byKey.set(candidateKey, candidate);

  const visit = (key: string, stack: string[]): string[] | null => {
    if (stack.includes(key)) return [...stack.slice(stack.indexOf(key)), key];
    const node = byKey.get(key);
    if (!node) return null;
    const tokens = tokensFromExpression(node.expression);
    for (const token of tokens) {
      if (!byKey.has(token)) continue;
      const cycle = visit(token, [...stack, key]);
      if (cycle) return cycle;
    }
    return null;
  };

  return visit(candidateKey, []);
};

/**
 * Evaluate every active formula in the registry against the provided scope.
 * Returns a map keyed by formula name → numeric result (or null on failure).
 */
export const evaluateAllFormulas = (
  formulas: KpiFormula[],
  scope: FormulaScope,
): Record<string, number | null> => {
  const out: Record<string, number | null> = {};
  for (const formula of formulas) {
    if (!formula.is_active) continue;
    out[formula.name] = evaluateFormula(formula, scope);
  }
  return out;
};

/**
 * Convenience: evaluate the registered "Occupancy Rate" formula. Falls back
 * to the canonical `occupied / total_beds * 100` only if no active formula
 * with that name exists in the registry.
 */
export const evaluateOccupancyRate = (
  formulas: KpiFormula[],
  scope: FormulaScope,
): number => {
  const formula = findFormulaByName(formulas, "Occupancy Rate");
  // Resolve registry dependencies first so compound formulas (e.g. Occupancy
  // Rate referencing a formula-defined Vacant or Occupied) evaluate correctly.
  const { scope: resolved } = buildScopeWithFormulas(scope, formulas);
  const result = evaluateFormula(formula, resolved);
  if (result !== null) return result;
  // Fallback: prefer registry-resolved Occupied / Total Beds when available.
  const total = resolved.total_beds ?? scope.total_beds ?? 0;
  const occupied = resolved.occupied ?? scope.occupied ?? 0;
  return total > 0 ? (occupied / total) * 100 : 0;
};

/**
 * Generic helper: evaluate a named formula from the global registry against a
 * scope. If no active formula with that name exists OR evaluation fails, the
 * provided `fallback` value is returned. This is the canonical entry-point for
 * UI surfaces (Bed Entry "auto" fields, Dashboard KPI cards) that want to
 * prefer an admin-defined formula but still degrade gracefully.
 */
export const evaluateNamedFormula = (
  formulas: KpiFormula[],
  name: string,
  scope: FormulaScope,
  fallback: number,
): number => {
  const formula = findFormulaByName(formulas, name);
  if (!formula) return fallback;
  // Resolve registry dependencies first so compound formulas work.
  const { scope: resolved } = buildScopeWithFormulas(scope, formulas);
  const value = evaluateFormula(formula, resolved);
  return value === null || !Number.isFinite(value) ? fallback : value;
};