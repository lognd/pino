// Admin session auth -- server-side session cookies, see docs/design/00's
// locked decision table and docs/design/02-auth-and-security.md. CRIB:
// logand.app/frontend/src/api/auth.ts (fetchMe/login/logout shape).
// Melpino has no customer accounts (guest checkout only, docs/design/00)
// so there is no register()/password-reset pair to port -- admin-only.
//
// TODO(impl): docs/design/02-auth-and-security.md

import { apiGet, apiPost } from "./client";

export interface Me {
  user_id: string;
  role: "admin" | "staff";
}

export function fetchMe(): Promise<Me> {
  return apiGet<Me>("/api/auth/me");
}

// Backend returns MeResponse ({user_id, role}), not {status} -- see
// api/auth.py::login. Typed as Me so any future caller that trusts the
// return value gets the real shape instead of `undefined`.
export function login(email: string, password: string): Promise<Me> {
  return apiPost<Me>("/api/auth/login", { email, password });
}

export function logout(): Promise<{ status: string }> {
  return apiPost<{ status: string }>("/api/auth/logout");
}
