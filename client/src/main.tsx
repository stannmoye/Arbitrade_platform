import { trpc } from "@/lib/trpc";
import { Suspense } from "react";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { ThemeProvider } from "./contexts/ThemeContext";
import PortalRenderBoundary from "./components/PortalRenderBoundary";
import "./index.css";
import "./design-system.css";
import "./theme-system.css";
import "./portal-design-pass4.css";
import "./portal-render-recovery.css";

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
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing application root element");

const renderApp = () => createRoot(rootElement).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="original" switchable>
        <PortalRenderBoundary portal="application">
          <Suspense fallback={<div role="status" aria-live="polite">Loading Arbitrade workspace…</div>}>
            <App />
          </Suspense>
        </PortalRenderBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  </trpc.Provider>
);

// Customer-only styles are scoped to .customer-portal. Keep them out of the
// initial admin/landing CSS payload, and wait for them before first customer paint.
if (window.location.pathname.startsWith("/customer")) {
  void Promise.all([
    import("./customer-reference.css"),
    import("./customer-theme-overrides.css"),
  ]).catch((error) => {
    console.error("[Customer styles] Unable to load customer theme styles", error);
  }).finally(renderApp);
} else {
  renderApp();
}
