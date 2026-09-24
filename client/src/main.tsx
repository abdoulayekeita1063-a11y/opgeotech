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

function StartupSplash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 900);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="opgeotech-splash" role="status" aria-label="Loading OPGeotech">
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

function RootApp() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <>
      <div className={showSplash ? "opgeotech-app opgeotech-app--hidden" : "opgeotech-app"}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </trpc.Provider>
      </div>
      {showSplash && <StartupSplash onComplete={() => setShowSplash(false)} />}
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
