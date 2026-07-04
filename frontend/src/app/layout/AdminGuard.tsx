// Wraps /admin/* -- consults the fake MSW login during the mockup phase
// per docs/design/14-admin-mockup.md ("same component, swapped data
// source, so graduation costs nothing"). CRIB:
// logand.app/frontend/src/app/layout/AdminGuard.tsx nearly verbatim.
//
// TODO(impl): docs/design/14-admin-mockup.md

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { UnauthenticatedError } from "../../api/client";
import { useMe } from "../../hooks/useMe";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error } = useMe();

  if (isLoading) return <p className="p-4 text-lg text-mp-muted">Loading...</p>;
  if (isError && error instanceof UnauthenticatedError) {
    return <Navigate to="/admin/login" replace />;
  }
  if (isError || !data) {
    return <p className="p-4 text-lg text-mp-red-text">Something went wrong. Please try again.</p>;
  }

  return <>{children}</>;
}
