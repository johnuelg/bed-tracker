import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const bedSubmissionSchema = z
  .object({
    department_id: z.string().uuid("Please select a department"),
    bed_type_id: z.string().uuid("Please select a bed type").optional().nullable(),
    total_beds: z.number().min(0),
    occupied: z.number().min(0),
    closed: z.number().min(0),
    closure_reason: z.string().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.closed > 0 && !value.closure_reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closure_reason"],
        message: "Reason for closure is required when Closed > 0",
      });
    }

    if (value.occupied + value.closed > value.total_beds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occupied"],
        message: "Occupied + Closed cannot exceed Total Beds",
      });
    }
  });

export const formulaSchema = z.object({
  name: z.string().trim().min(2).max(80),
  expression: z.string().trim().min(1).max(200),
  variables: z.array(z.string()).default([]),
});
