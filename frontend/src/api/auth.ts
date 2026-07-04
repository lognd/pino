// Admin session auth -- server-side session cookies, see docs/design/00's
// locked decision table and docs/design/02-auth-and-security.md. CRIB:
// logand.app/frontend/src/api/auth.ts (fetchMe/login/logout shape).
// Melpino has no customer accounts (guest checkout only, docs/design/00)
// so there is no register()/password-reset pair to port -- admin-only.
//
// TODO(impl): docs/design/02-auth-and-security.md

import { apiGet } from "./client";

export interface Me {
  user_id: string;
  role: "admin";
}

export function fetchMe(): Promise<Me> {
  return apiGet<Me>("/api/auth/me");
}

export function login(_email: string, _password: string): Promise<{ status: string }> {
  throw new Error("TODO(impl): docs/design/02-auth-and-security.md");
}

export function logout(): Promise<{ status: string }> {
  throw new Error("TODO(impl): docs/design/02-auth-and-security.md");
}
