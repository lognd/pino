// Top-level render-crash catcher -- CRIB:
// logand.app/frontend/src/app/layout/ErrorBoundary.tsx nearly verbatim
// (React error boundaries only catch render-phase errors; lib/logging.ts's
// window.onerror/unhandledrejection listeners catch the rest).
//
// TODO(impl): docs/design/07-frontend-architecture.md

import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatLogsForExport, logError } from "../../lib/logging";

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

function downloadLogs(): void {
  const blob = new Blob([formatLogsForExport()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `melpino-client-log-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError("React render crash", `${error.stack ?? error.message}\n${info.componentStack}`);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-lg text-mp-muted">
          {/* TODO(impl): docs/design/07-frontend-architecture.md */}
          This page crashed unexpectedly. Call us if this keeps happening.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={downloadLogs}
            className="min-h-[56px] border-2 border-mp-white px-6 text-xl font-bold text-mp-white"
          >
            Download logs
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[56px] bg-mp-red px-6 text-xl font-bold text-mp-white"
          >
            Reload page
          </button>
        </div>
      </main>
    );
  }
}
