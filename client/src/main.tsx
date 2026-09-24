import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { fetchWithTransientRetry } from "./lib/apiFetch";
import { countPendingOfflineRecords } from "./lib/offlineStore";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return fetchWithTransientRetry(input, init);
      },
    }),
  ],
});

function StartupSplash({ exiting, onExit }: { exiting: boolean; onExit: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onExit, 900);
    return () => window.clearTimeout(timer);
  }, [onExit]);

  return (
    <div className={`opgeotech-splash${exiting ? " opgeotech-splash--exiting" : ""}`} role="status" aria-label="Loading OPGeotech">
      <div className="opgeotech-splash__grid" aria-hidden="true" />
      <div className="opgeotech-splash__content">
        <div className="opgeotech-splash__mark">
          <img src="/favicon.png" alt="" />
        </div>
        <p className="opgeotech-splash__eyebrow">GEOTECHNICAL ENGINEERING PLATFORM</p>
        <h1>OP<span>GEOTECH</span></h1>
        <div className="opgeotech-splash__rule" />
        <p className="opgeotech-splash__status">INITIALIZING OPEN-PIT SUITE</p>
      </div>
    </div>
  );
}

function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const refreshPending = () => { void countPendingOfflineRecords().then(setPending).catch(() => undefined); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("opgeotech:offline-store-updated", refreshPending);
    refreshPending();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("opgeotech:offline-store-updated", refreshPending);
    };
  }, []);

  if (online) return null;
  return (
    <div className="opgeotech-offline-banner" role="status">
      <span className="opgeotech-offline-banner__dot" aria-hidden="true" />
      Offline mode — cached workspace available{pending > 0 ? ` · ${pending} operation${pending === 1 ? "" : "s"} stored locally` : ""}; server-backed actions are available again when connected.
    </div>
  );
}

function RootApp() {
  const [splashPhase, setSplashPhase] = useState<"visible" | "exiting" | "done">("visible");

  useEffect(() => {
    if (splashPhase !== "exiting") return;
    const timer = window.setTimeout(() => setSplashPhase("done"), 520);
    return () => window.clearTimeout(timer);
  }, [splashPhase]);

  const showSplash = splashPhase !== "done";
  const splashExiting = splashPhase === "exiting";
  return (
    <>
      <OfflineStatus />
      <div className={showSplash && !splashExiting ? "opgeotech-app opgeotech-app--hidden" : "opgeotech-app"}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </trpc.Provider>
      </div>
      {showSplash && <StartupSplash exiting={splashExiting} onExit={() => setSplashPhase("exiting")} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <RootApp />
);

// PWA: register the service worker (production only, to avoid interfering
// with Vite HMR during development).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.warn("[PWA] Service worker registration failed:", err);
    });
  });
}
