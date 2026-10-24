import { trpc } from "@/lib/trpc";
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import PortalRenderBoundary from "./components/PortalRenderBoundary";
import "./index.css";
import "./design-system.css";
import "./theme-system.css";
import "./portal-design-pass4.css";
import "./portal-render-recovery.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof Error)) return;
  if (!/UNAUTHORIZED|Authentication required|Session has been revoked/i.test(error.message)) return;
  const current = window.location.pathname;
  const target = current.startsWith("/ops-console") || current.startsWith("/admin")
    ? "/ops-console-7f3a"
    : "/customer";
  if (current !== target) window.location.assign(target);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
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
      headers() { return {}; },
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

// Customer-only styles stay split out of the initial admin/landing payload.
// Start fetching them before mounting, but NEVER gate React startup on stylesheet
// chunks: a slow or stalled CSS request must not leave the customer route as a
// blank background with an empty #root. The current styles apply as soon as each
// CSS chunk is ready; if one fails, the app still renders with the base design.
if (window.location.pathname.startsWith("/customer")) {
  void Promise.all([
    import("./customer-reference.css"),
    import("./customer-theme-overrides.css"),
  ]).catch((error) => {
    console.error("[Customer styles] Unable to load customer theme styles", error);
  });
}

renderApp();
