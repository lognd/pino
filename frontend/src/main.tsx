// Entry point -- CRIB: logand.app/frontend/src/main.tsx nearly verbatim
// (installGlobalLogging before first render, MSW dynamic-import gate
// behind VITE_USE_MOCKS so mock code never ships in a normal production
// build, see docs/design/14-admin-mockup.md).

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./app/layout/ErrorBoundary";
import { installGlobalLogging } from "./lib/logging";
import "./styles/tailwind.css";

installGlobalLogging();

const queryClient = new QueryClient();

function renderApp(): void {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// MSW only ever starts for the /admin mockup SPA, and only in dev or an
// explicit VITE_USE_MOCKS build (docs/design/14-admin-mockup.md's route
// gating + mockup mechanics) -- it must never intercept public-site
// requests in the prerendered build or the Playwright "public" project's
// preview server, which share this same entry point.
const shouldStartMocks =
  (import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === "true") &&
  window.location.pathname.startsWith("/admin");

if (shouldStartMocks) {
  import("./mocks/browser").then(({ worker }) => {
    worker.start({ onUnhandledRequest: "bypass" }).then(renderApp);
  });
} else {
  renderApp();
}
