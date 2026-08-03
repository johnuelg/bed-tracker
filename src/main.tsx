import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "@/hooks/use-auth";

const clearStaleBrowserRuntimeState = async () => {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // no-op: failing to unregister should not block app startup
    }
  }

  if ("caches" in window) {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch {
      // no-op: failing to clear cache should not block app startup
    }
  }
};

const bootstrap = async () => {
  await clearStaleBrowserRuntimeState();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  createRoot(rootElement).render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
};

void bootstrap();
