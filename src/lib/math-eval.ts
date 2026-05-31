import { evaluate } from "mathjs";

const SAFE_EXPR_REGEX = /^[0-9+\-*/().\s_a-zA-Z]+$/;

export const evaluateSafeExpression = (expression: string, scope: Record<string, number>) => {
  if (!SAFE_EXPR_REGEX.test(expression)) {
    throw new Error("Invalid expression characters");
  }

  const result = evaluate(expression, scope);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Expression did not return a valid number");
  }

  return result;
};
