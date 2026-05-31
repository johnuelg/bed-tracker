export const LAST_REFRESH_STORAGE_KEY = "dashboard:lastRefreshAt";

/**
 * Record a "live data was just refreshed" timestamp shared across the app
 * (Dashboard, Bed Map, Bed Entry forms). The Dashboard's "Updated X ago"
 * indicator reads from this same key so it resets immediately whenever
 * fresh data is written from any page.
 */
export const markDataRefreshed = (timestamp: number = Date.now()) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LAST_REFRESH_STORAGE_KEY);
    const prev = raw ? Number(raw) : NaN;
    if (Number.isFinite(prev) && prev >= timestamp) return;
    window.localStorage.setItem(LAST_REFRESH_STORAGE_KEY, String(timestamp));
    // Notify same-tab listeners (the native `storage` event only fires across tabs).
    window.dispatchEvent(
      new CustomEvent("app:data-refreshed", { detail: { timestamp } }),
    );
  } catch {
    // ignore quota / private mode errors
  }
};

export const readLastRefreshAt = (): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_REFRESH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};