// Admin session query -- see docs/design/07-frontend-architecture.md's
// route guards section and docs/design/14-admin-mockup.md's fake gate.
// CRIB: logand.app/frontend/src/hooks/useMe.ts (a two-line TanStack Query
// wrapper around fetchMe()).
//
// TODO(impl): docs/design/07-frontend-architecture.md

import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "../api/auth";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });
}
