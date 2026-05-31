import type { AppRole } from "@/types/hospital";

export const requireRole = (roles: AppRole[], allowed: AppRole[], action: string) => {
  if (!roles.some((role) => allowed.includes(role))) {
    throw new Error(`Unauthorized: You cannot ${action}.`);
  }
};
